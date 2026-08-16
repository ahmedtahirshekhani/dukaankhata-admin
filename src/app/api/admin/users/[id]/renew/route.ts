import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
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

    let daysToAdd = 30;
    let planToSet = 'pro';

    try {
      const body = await request.json();
      if (body.days) daysToAdd = parseInt(body.days, 10);
      if (body.plan) planToSet = body.plan.toLowerCase();
    } catch (e) {
      // body optional
    }

    let userObjectId: ObjectId;
    try {
      userObjectId = toObjectId(id);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: userObjectId });
    if (!user) {
      return NextResponse.json({ error: 'Merchant user not found in database' }, { status: 404 });
    }

    // Find existing active or latest subscription in subscriptions collection
    const existingSub = await db
      .collection(COLLECTIONS.SUBSCRIPTIONS)
      .findOne({ $or: [{ user_id: user._id }, { email: user.email }] }, { sort: { created_at: -1 } });

    const now = new Date();
    let currentExpiry = existingSub?.expiry_date ? new Date(existingSub.expiry_date) : now;
    if (currentExpiry < now) {
      currentExpiry = new Date();
    }

    const newExpiry = new Date(currentExpiry.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    // Insert or update subscription record in real `subscriptions` collection
    const subscriptionData = {
      user_id: user._id,
      email: user.email,
      plan: planToSet,
      status: 'active',
      amount: planToSet === 'enterprise' ? 15000 : planToSet === 'pro' ? 5000 : 2500,
      created_at: now,
      activated_date: now,
      expiry_date: newExpiry,
      billing_cycle_start: now,
      billing_cycle_end: newExpiry,
      next_billing_date: newExpiry,
      updated_at: now,
    };

    if (existingSub) {
      await db.collection(COLLECTIONS.SUBSCRIPTIONS).updateOne(
        { _id: existingSub._id },
        { $set: subscriptionData }
      );
    } else {
      await db.collection(COLLECTIONS.SUBSCRIPTIONS).insertOne(subscriptionData);
    }

    // Also update user status in `users` collection to active
    await db.collection(COLLECTIONS.USERS).updateOne(
      { _id: user._id },
      {
        $set: {
          status: 'active',
          subscription: {
            plan: planToSet,
            status: 'active',
            expiresAt: newExpiry,
          },
          updated_at: now,
        },
      }
    );

    return NextResponse.json({
      success: true,
      message: `Subscription successfully renewed for ${user.name} (${planToSet.toUpperCase()}) for ${daysToAdd} days until ${newExpiry.toLocaleDateString()}`,
      subscription: subscriptionData,
    });
  } catch (error: any) {
    console.error('Subscription renewal error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
