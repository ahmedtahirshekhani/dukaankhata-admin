import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export async function GET() {
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
    const now = new Date();

    const totalUsers = await db.collection(COLLECTIONS.USERS).countDocuments({ role: { $ne: 'admin' } });
    const activeUsers = await db.collection(COLLECTIONS.USERS).countDocuments({
      role: { $ne: 'admin' },
      status: { $nin: ['suspended', 'blocked'] },
    });
    const suspendedUsers = await db.collection(COLLECTIONS.USERS).countDocuments({
      role: { $ne: 'admin' },
      status: { $in: ['suspended', 'blocked'] },
    });
    const totalShops = await db.collection(COLLECTIONS.SHOPS).countDocuments();

    const activeSubscriptions = await db.collection(COLLECTIONS.SUBSCRIPTIONS).countDocuments({
      $or: [{ status: 'active' }, { status: 'in_trial' }],
      expiry_date: { $gt: now },
    });

    const expiredSubscriptions = await db.collection(COLLECTIONS.SUBSCRIPTIONS).countDocuments({
      $or: [{ status: 'expired' }, { expiry_date: { $lte: now } }],
    });

    const trialSubscriptions = await db.collection(COLLECTIONS.SUBSCRIPTIONS).countDocuments({
      plan: 'trial',
      expiry_date: { $gt: now },
    });

    const waitlistCount = await db.collection(COLLECTIONS.WAITLIST).countDocuments();
    const deletedLeadsCount = await db.collection(COLLECTIONS.LEADS_DELETED).countDocuments();

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        totalShops,
        activeSubscriptions,
        expiredSubscriptions,
        trialSubscriptions,
        waitlistCount,
        deletedLeadsCount,
      },
    });
  } catch (error: any) {
    console.error('Real stats aggregation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
