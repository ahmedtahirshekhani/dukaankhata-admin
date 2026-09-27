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

    const user = await db.collection(COLLECTIONS.CURRENT_USERS).findOne({ _id: userObjectId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    const userUpdate: any = { updatedAt: now };

    if (body.status) {
      userUpdate.status = body.status;
    }

    if (body.role) {
      userUpdate.role = body.role;
    }

    // Update subscription status based on user status change
    if (body.status === 'suspended' || body.status === 'blocked') {
      userUpdate['subscription.status'] = 'login_blocked';
    } else if (body.status === 'active') {
      userUpdate['subscription.status'] = 'active';
    }

    // Direct subscription updates
    if (body.subscription) {
      if (body.subscription.plan) userUpdate['subscription.plan'] = body.subscription.plan;
      if (body.subscription.status) userUpdate['subscription.status'] = body.subscription.status;
      if (body.subscription.expiresAt) userUpdate['subscription.expiresAt'] = new Date(body.subscription.expiresAt);
    }

    await db.collection(COLLECTIONS.CURRENT_USERS).updateOne(
      { _id: userObjectId },
      { $set: userUpdate }
    );

    // Sync status change to Source DB (Main Dukaankhata) if connected
    if (body.status) {
      try {
        const { getSourceDatabase, SOURCE_COLLECTIONS } = await import('@/lib/db/source-mongodb');
        const sourceDb = await getSourceDatabase();
        const origId = user.originalUserId || user._id;

        await sourceDb.collection(SOURCE_COLLECTIONS.USERS).updateOne(
          { $or: [{ _id: origId }, { _id: origId.toString() }, { email: user.email }] },
          { $set: { status: body.status, updated_at: now } }
        );
      } catch (sourceErr) {
        console.warn('Could not sync status change to source DB:', sourceErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `User status updated to ${body.status || 'updated'} and subscription synchronized.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE USER COMPLETELY
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

    const user = await db.collection(COLLECTIONS.CURRENT_USERS).findOne({ _id: userObjectId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.role === 'admin') {
      return NextResponse.json({ error: 'Admin accounts cannot be deleted.' }, { status: 400 });
    }

    // Archive to leads_deleted before purging
    const leadRecord = {
      originalUserId: (user.originalUserId || userObjectId).toString(),
      name: user.name || 'Unknown Merchant',
      email: user.email || '',
      phone: user.phone || '',
      company: user.shopName || 'N/A',
      address: user.address || 'N/A',
      city: user.city || '',
      role: user.role || 'user',
      userStatus: user.status || 'active',
      subscriptionPlan: user.subscription?.plan || 'trial',
      subscriptionStatus: user.subscription?.status || 'expired',
      lastActivity: user.lastActivity || null,
      createdAt: user.createdAt || null,
      deletedAt: new Date(),
    };

    await db.collection(COLLECTIONS.LEADS_DELETED).insertOne(leadRecord);

    // Delete from current_users and whatsapp_logs
    await Promise.all([
      db.collection(COLLECTIONS.CURRENT_USERS).deleteOne({ _id: userObjectId }),
      db.collection(COLLECTIONS.WHATSAPP_LOGS).deleteMany({
        $or: [
          { userId: userObjectId.toString() },
          { userId: userObjectId },
          ...(user.phone ? [{ phone: user.phone }] : []),
        ],
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Merchant "${user.name}" (${user.email}) deleted permanently.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
