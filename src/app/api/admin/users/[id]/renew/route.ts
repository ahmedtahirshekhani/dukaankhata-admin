import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import {
  addDays,
  getCycleDays,
  getPlanAmount,
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

    const user = await db.collection(COLLECTIONS.CURRENT_USERS).findOne({ _id: userObjectId });
    if (!user) {
      return NextResponse.json({ error: 'Merchant user not found in database' }, { status: 404 });
    }

    const now = new Date();
    const cycleDays = getCycleDays(billingCycle);
    const amount = getPlanAmount(billingCycle);

    // Calculate new expiry from current expiry or now
    const currentExpiry = user.subscription?.expiresAt
      ? new Date(user.subscription.expiresAt)
      : null;

    const baseDate =
      currentExpiry && currentExpiry > now ? currentExpiry : now;
    const newEnd = addDays(baseDate, cycleDays);

    // Update subscription in-place on current_users (Admin DB)
    const subscriptionUpdate = {
      'subscription.plan': 'pro',
      'subscription.status': 'active',
      'subscription.expiresAt': newEnd,
      'subscription.amount': amount,
      'subscription.billingCycle': billingCycle,
      status: 'active',
      updatedAt: now,
    };

    await db.collection(COLLECTIONS.CURRENT_USERS).updateOne(
      { _id: userObjectId },
      { $set: subscriptionUpdate }
    );

    // Sync renewal back to Source DB (Main Dukaankhata) if connected
    try {
      const { getSourceDatabase, SOURCE_COLLECTIONS } = await import('@/lib/db/source-mongodb');
      const sourceDb = await getSourceDatabase();
      const rawOrigId = user.originalUserId || user._id;

      let origObjectId: ObjectId | null = null;
      try {
        origObjectId = toObjectId(rawOrigId);
      } catch {
        origObjectId = null;
      }

      const idFilterConditions: any[] = [];
      if (origObjectId) {
        idFilterConditions.push({ user_id: origObjectId });
        idFilterConditions.push({ user_id: origObjectId.toString() });
      } else if (rawOrigId) {
        idFilterConditions.push({ user_id: rawOrigId.toString() });
      }
      if (user.email) {
        idFilterConditions.push({ email: user.email });
      }

      const subMatchFilter = idFilterConditions.length > 0 ? { $or: idFilterConditions } : { email: user.email };

      // Update or insert subscription record in Source DB (dukaankhata-prod.subscriptions)
      await sourceDb.collection(SOURCE_COLLECTIONS.SUBSCRIPTIONS).updateOne(
        subMatchFilter,
        {
          $set: {
            user_id: origObjectId || rawOrigId,
            email: user.email,
            plan: 'pro',
            status: 'active',
            amount: amount,
            billing_cycle: billingCycle,
            expiry_date: newEnd,
            billing_cycle_start: now,
            billing_cycle_end: newEnd,
            activated_date: now,
            next_billing_date: newEnd,
            updated_at: now,
          },
          $setOnInsert: {
            created_at: now,
          },
        },
        { upsert: true }
      );

      // Also ensure user in Source DB (dukaankhata-prod.users) is active & undeleted
      const userMatchConditions: any[] = [];
      if (origObjectId) {
        userMatchConditions.push({ _id: origObjectId });
      }
      if (user.email) {
        userMatchConditions.push({ email: user.email });
      }

      if (userMatchConditions.length > 0) {
        await sourceDb.collection(SOURCE_COLLECTIONS.USERS).updateOne(
          { $or: userMatchConditions },
          {
            $set: {
              status: 'active',
              isDeleted: false,
              updated_at: now,
            },
          }
        );
      }
    } catch (sourceErr) {
      console.warn('Could not sync renewal to source DB:', sourceErr);
    }

    const message = `Pro subscription ${
      user.subscription?.plan === 'pro' ? 'renewed' : 'activated'
    } for ${user.name} (${billingCycle}) until ${formatDisplayDate(newEnd)}`;

    return NextResponse.json({
      success: true,
      message,
      subscription: {
        plan: 'pro',
        status: 'active',
        expiresAt: newEnd,
        amount,
        billingCycle,
      },
    });
  } catch (error: any) {
    console.error('Subscription renewal error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
