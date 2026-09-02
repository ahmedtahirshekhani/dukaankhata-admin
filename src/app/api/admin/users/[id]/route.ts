import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { isMerchantDeletable, purgeMerchantData } from '@/lib/admin/purge-user';

async function checkAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('dukaankhata_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = await getDatabase();
    const { id } = await params;
    const body = await request.json();

    let userObjectId: ObjectId;
    try {
      userObjectId = toObjectId(id);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: userObjectId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    const userUpdate: any = { updated_at: now };

    if (body.status) {
      userUpdate.status = body.status;
    }

    if (body.role) {
      userUpdate.role = body.role;
    }

    await db.collection(COLLECTIONS.USERS).updateOne(
      { _id: userObjectId },
      { $set: userUpdate }
    );

    // Update Subscription status according to schema
    if (body.status === 'suspended' || body.status === 'blocked') {
      await db.collection(COLLECTIONS.SUBSCRIPTIONS).updateMany(
        { $or: [{ user_id: userObjectId }, { email: user.email }] },
        { $set: { status: 'login_blocked', updated_at: now } }
      );
    } else if (body.status === 'active') {
      await db.collection(COLLECTIONS.SUBSCRIPTIONS).updateMany(
        { $or: [{ user_id: userObjectId }, { email: user.email }] },
        { $set: { status: 'active', updated_at: now } }
      );
    }

    if (body.subscription) {
      const subUpdate: any = { updated_at: now };
      if (body.subscription.plan) subUpdate.plan = body.subscription.plan;
      if (body.subscription.status) subUpdate.status = body.subscription.status;
      if (body.subscription.expiresAt) subUpdate.expiry_date = new Date(body.subscription.expiresAt);

      await db.collection(COLLECTIONS.SUBSCRIPTIONS).updateMany(
        { $or: [{ user_id: userObjectId }, { email: user.email }] },
        { $set: subUpdate }
      );
    }

    return NextResponse.json({
      success: true,
      message: `User status updated to ${body.status || 'updated'} and subscription synchronized.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE USER COMPLETELY ((blocked or expired) and inactive 60+ days)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = await getDatabase();
    const { id } = await params;

    let userObjectId: ObjectId;
    try {
      userObjectId = toObjectId(id);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: userObjectId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.role === 'admin') {
      return NextResponse.json({ error: 'Admin accounts cannot be deleted.' }, { status: 400 });
    }

    const now = new Date();

    const deletable = await isMerchantDeletable(db, user as any, now);

    if (!deletable) {
      return NextResponse.json(
        {
          error:
            'Merchant is not eligible for deletion. (Must be Login Blocked, an expired trial plan with > 7 days of inactivity, or expired with > 60 days of inactivity).',
        },
        { status: 400 }
      );
    }

    const userEmail = user.email;

    await purgeMerchantData(db, userObjectId, userEmail);

    return NextResponse.json({
      success: true,
      message: `Merchant "${user.name}" (${userEmail}) and all associated data deleted permanently.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
