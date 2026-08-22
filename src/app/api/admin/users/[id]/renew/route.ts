import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import {
  addDays,
  computeNextCycleEnd,
  computeNextCycleStart,
  getCycleDays,
  getPlanAmount,
  isPendingPaymentStatus,
  type BillingCycle,
} from '@/lib/subscriptions';
import { formatDisplayDate } from '@/lib/format-date';
import { ObjectId } from 'mongodb';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('dukaankhata_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = await getDatabase();
    const { id } = await params;

    let billingCycle: BillingCycle = 'monthly';

    try {
      const body = await request.json();
      if (body.billingCycle === 'monthly' || body.billingCycle === 'yearly') {
        billingCycle = body.billingCycle;
      }
    } catch {
      // body optional
    }

    let userObjectId: ObjectId;
    try {
      userObjectId = toObjectId(id);
    } catch {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: userObjectId });
    if (!user) {
      return NextResponse.json({ error: 'Merchant user not found in database' }, { status: 404 });
    }

    const now = new Date();
    const cycleDays = getCycleDays(billingCycle);
    const amount = getPlanAmount(billingCycle);
    const planToSet = 'pro';

    const allSubs = await db
      .collection(COLLECTIONS.SUBSCRIPTIONS)
      .find({ $or: [{ user_id: user._id }, { email: user.email }] })
      .sort({ created_at: -1 })
      .toArray();

    const pendingProSub = allSubs.find(
      (s) => s.plan === 'pro' && isPendingPaymentStatus(s.status)
    );
    const activeProSub = allSubs.find((s) => s.plan === 'pro' && s.status === 'active');
    const latestProSub = allSubs.find((s) => s.plan === 'pro');
    const latestSub = allSubs[0];

    let resultSub: Record<string, unknown>;
    let message: string;

    if (pendingProSub) {
      // Payment grace already extended dates — only activate, do not add more days.
      await db.collection(COLLECTIONS.SUBSCRIPTIONS).updateOne(
        { _id: pendingProSub._id },
        { $set: { status: 'active', updated_at: now } }
      );

      const expiry = new Date(pendingProSub.expiry_date);
      resultSub = { ...pendingProSub, status: 'active' };
      message = `Pro subscription activated for ${user.name} until ${formatDisplayDate(expiry)}`;
    } else if (activeProSub) {
      // Extend active pro from previous billing_cycle_end (not today + 30).
      const prevEnd = new Date(activeProSub.billing_cycle_end || activeProSub.expiry_date);
      const newStart = computeNextCycleStart(prevEnd, now);
      const newEnd = computeNextCycleEnd(prevEnd, cycleDays, now);

      const update = {
        status: 'active',
        amount,
        billing_cycle: billingCycle,
        billing_cycle_start: newStart,
        billing_cycle_end: newEnd,
        expiry_date: newEnd,
        next_billing_date: newEnd,
        updated_at: now,
      };

      await db.collection(COLLECTIONS.SUBSCRIPTIONS).updateOne(
        { _id: activeProSub._id },
        { $set: update }
      );

      resultSub = { ...activeProSub, ...update };
      message = `Pro subscription extended for ${user.name} (${billingCycle}) until ${formatDisplayDate(newEnd)}`;
    } else if (latestProSub) {
      // Expired/inactive pro — extend the existing record in place.
      const prevEnd = new Date(latestProSub.billing_cycle_end || latestProSub.expiry_date);
      const newStart = computeNextCycleStart(prevEnd, now);
      const newEnd = computeNextCycleEnd(prevEnd, cycleDays, now);

      const update = {
        status: 'active',
        amount,
        billing_cycle: billingCycle,
        billing_cycle_start: newStart,
        billing_cycle_end: newEnd,
        expiry_date: newEnd,
        next_billing_date: newEnd,
        updated_at: now,
      };

      await db.collection(COLLECTIONS.SUBSCRIPTIONS).updateOne(
        { _id: latestProSub._id },
        { $set: update }
      );

      resultSub = { ...latestProSub, ...update };
      message = `Pro subscription renewed for ${user.name} (${billingCycle}) until ${formatDisplayDate(newEnd)}`;
    } else {
      // First pro subscription (e.g. upgrade from trial) — create a new entry, keep trial history.
      const newEnd = addDays(now, cycleDays);
      const previousId = latestSub?._id;

      const subscriptionData: Record<string, unknown> = {
        user_id: user._id,
        email: user.email,
        plan: planToSet,
        status: 'active',
        amount,
        billing_cycle: billingCycle,
        created_at: now,
        activated_date: now,
        expiry_date: newEnd,
        billing_cycle_start: now,
        billing_cycle_end: newEnd,
        next_billing_date: newEnd,
        updated_at: now,
      };

      if (previousId) {
        subscriptionData.previous_subscription_id = previousId;
        subscriptionData.is_renewal = true;
      }

      const insertResult = await db.collection(COLLECTIONS.SUBSCRIPTIONS).insertOne(subscriptionData);
      resultSub = { _id: insertResult.insertedId, ...subscriptionData };
      message = `Pro subscription created for ${user.name} (${billingCycle}) until ${formatDisplayDate(newEnd)}`;
    }

    const expiresAt = new Date(
      (resultSub.expiry_date || resultSub.billing_cycle_end) as Date | string
    );

    await db.collection(COLLECTIONS.USERS).updateOne(
      { _id: user._id },
      {
        $set: {
          status: 'active',
          subscription: {
            plan: planToSet,
            status: 'active',
            expiresAt,
          },
          updated_at: now,
        },
      }
    );

    return NextResponse.json({
      success: true,
      message,
      subscription: resultSub,
    });
  } catch (error: any) {
    console.error('Subscription renewal error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
