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
    const col = db.collection(COLLECTIONS.CURRENT_USERS);

    const totalUsers = await col.countDocuments({ role: { $ne: 'admin' } });
    const activeUsers = await col.countDocuments({
      role: { $ne: 'admin' },
      status: { $nin: ['suspended', 'blocked'] },
    });
    const suspendedUsers = await col.countDocuments({
      role: { $ne: 'admin' },
      status: { $in: ['suspended', 'blocked'] },
    });

    // Subscription stats from flat current_users data
    const activeSubscriptions = await col.countDocuments({
      'subscription.status': { $in: ['active', 'in_trial'] },
      'subscription.expiresAt': { $gt: now },
    });

    const expiredSubscriptions = await col.countDocuments({
      $or: [
        { 'subscription.status': 'expired' },
        { 'subscription.expiresAt': { $lte: now } },
      ],
    });

    const trialSubscriptions = await col.countDocuments({
      'subscription.plan': 'trial',
      'subscription.expiresAt': { $gt: now },
    });

    // Total shops = total current_users (each user represents a shop)
    const totalShops = totalUsers;

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
        waitlistCount: 0,
        deletedLeadsCount,
      },
    });
  } catch (error: any) {
    console.error('Stats aggregation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
