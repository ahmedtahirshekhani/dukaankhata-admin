import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

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

// DELETE USER COMPLETELY (FOR BLOCKED / SUSPENDED MERCHANTS)
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

    // Check all subscriptions matching user_id or email
    const subs = await db.collection(COLLECTIONS.SUBSCRIPTIONS).find({
      $or: [{ user_id: userObjectId }, { email: user.email }],
    }).toArray();

    const isUserStatusBlocked = ['suspended', 'blocked', 'login_blocked', 'inactive'].includes(
      (user.status || '').toLowerCase()
    );

    const isSubBlocked = subs.some((s) =>
      ['login_blocked', 'suspended', 'blocked', 'inactive'].includes((s.status || '').toLowerCase())
    );

    const isBlocked = isUserStatusBlocked || isSubBlocked;

    if (!isBlocked) {
      return NextResponse.json(
        { error: 'Only blocked or suspended merchants can be deleted. Please block the merchant first.' },
        { status: 400 }
      );
    }

    const userEmail = user.email;

    // Permanently purge user document and all associated data across collections
    await Promise.all([
      db.collection(COLLECTIONS.USERS).deleteOne({ _id: userObjectId }),
      db.collection(COLLECTIONS.SUBSCRIPTIONS).deleteMany({
        $or: [{ user_id: userObjectId }, { email: userEmail }],
      }),
      db.collection(COLLECTIONS.SHOPS).deleteMany({
        $or: [{ owner_user_id: userObjectId }, { user_id: userObjectId }, { email: userEmail }],
      }),
      db.collection(COLLECTIONS.ORDERS).deleteMany({
        $or: [{ user_id: userObjectId }, { merchant_id: userObjectId }],
      }),
      db.collection(COLLECTIONS.TRANSACTIONS).deleteMany({ user_id: userObjectId }),
      db.collection(COLLECTIONS.PRODUCTS).deleteMany({ user_id: userObjectId }),
      db.collection(COLLECTIONS.PARTIES).deleteMany({ user_id: userObjectId }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Blocked merchant "${user.name}" (${userEmail}) and all associated data deleted permanently.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
