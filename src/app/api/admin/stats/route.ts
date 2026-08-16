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

    // 1. Total counts from real MongoDB collections
    const totalUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
    const activeUsers = await db.collection(COLLECTIONS.USERS).countDocuments({ status: { $ne: 'suspended' } });
    const suspendedUsers = await db.collection(COLLECTIONS.USERS).countDocuments({ status: 'suspended' });
    const totalShops = await db.collection(COLLECTIONS.SHOPS).countDocuments();

    // 2. Subscriptions metrics
    const activeSubscriptions = await db.collection(COLLECTIONS.SUBSCRIPTIONS).countDocuments({
      $or: [{ status: 'active' }, { status: 'in_trial' }],
      expiry_date: { $gt: now },
    });

    const expiredSubscriptions = await db.collection(COLLECTIONS.SUBSCRIPTIONS).countDocuments({
      $or: [
        { status: 'expired' },
        { expiry_date: { $lte: now } },
      ],
    });

    const trialSubscriptions = await db.collection(COLLECTIONS.SUBSCRIPTIONS).countDocuments({
      plan: 'trial',
      expiry_date: { $gt: now },
    });

    // 3. Real Store Sales & Transactions Volume from orders collection
    const orderStats = await db.collection(COLLECTIONS.ORDERS).aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total_amount' },
          totalOrders: { $sum: 1 },
        },
      },
    ]).toArray();

    const totalRevenue = orderStats[0]?.totalRevenue || 0;
    const totalOrders = orderStats[0]?.totalOrders || 0;

    // 4. Real Waitlist count
    const waitlistCount = await db.collection(COLLECTIONS.WAITLIST).countDocuments();

    // 5. Recent registered users with enriched shop and subscription details
    const recentUsersRaw = await db
      .collection(COLLECTIONS.USERS)
      .find()
      .sort({ created_at: -1, createdAt: -1 })
      .limit(6)
      .toArray();

    const recentUsers = await Promise.all(
      recentUsersRaw.map(async (u) => {
        // Find shop
        const shop = await db.collection(COLLECTIONS.SHOPS).findOne({
          $or: [{ owner_user_id: u._id }, { user_id: u._id }, { _id: u._id }],
        });

        // Find subscription
        const sub = await db.collection(COLLECTIONS.SUBSCRIPTIONS).findOne(
          { $or: [{ user_id: u._id }, { email: u.email }] },
          { sort: { created_at: -1 } }
        );

        // Calculate sales for this specific user
        const userSales = await db.collection(COLLECTIONS.ORDERS).aggregate([
          { $match: { user_id: u._id } },
          { $group: { _id: null, total: { $sum: '$total_amount' } } },
        ]).toArray();

        return {
          _id: u._id.toString(),
          name: u.name || 'Merchant User',
          email: u.email,
          phone: u.phone || shop?.company_phone || '',
          shopName: shop?.name || u.shopName || 'Dukaan Store',
          status: u.status || 'active',
          role: u.role || 'user',
          subscription: {
            plan: sub?.plan || u.subscription?.plan || 'trial',
            status: sub?.status || u.subscription?.status || 'in_trial',
            expiresAt: sub?.expiry_date || u.subscription?.expiresAt || new Date(),
          },
          monthlyRevenue: userSales[0]?.total || u.monthlyRevenue || 0,
          createdAt: u.created_at || u.createdAt || new Date(),
        };
      })
    );

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
        totalRevenue,
        totalOrders,
        waitlistCount,
      },
      recentUsers,
    });
  } catch (error: any) {
    console.error('Real stats aggregation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
