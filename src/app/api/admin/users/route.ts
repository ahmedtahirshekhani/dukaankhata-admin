import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export async function GET(request: Request) {
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
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const plan = searchParams.get('plan') || 'all';
    const subState = searchParams.get('subState') || 'all';
    const role = searchParams.get('role') || 'all';
    const sortBy = searchParams.get('sortBy') || 'lastActivity';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Pagination parameters (Max 20 per page)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    // Build Mongo query for users
    const query: any = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (status !== 'all') {
      query.status = status;
    }

    if (role !== 'all') {
      query.role = role;
    }

    const rawUsers = await db
      .collection(COLLECTIONS.USERS)
      .find(query)
      .toArray();

    const now = new Date();

    // Enrich users with subscription, shop details, sales, and last activity
    const users = await Promise.all(
      rawUsers.map(async (u) => {
        // Find shop
        const shop = await db.collection(COLLECTIONS.SHOPS).findOne({
          $or: [{ owner_user_id: u._id }, { user_id: u._id }, { _id: u._id }],
        });

        // Find latest subscription
        const sub = await db.collection(COLLECTIONS.SUBSCRIPTIONS).findOne(
          { $or: [{ user_id: u._id }, { email: u.email }] },
          { sort: { created_at: -1 } }
        );

        // Aggregate actual orders/sales for this user
        const orderAgg = await db.collection(COLLECTIONS.ORDERS).aggregate([
          { $match: { user_id: u._id } },
          { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
        ]).toArray();

        const productCount = await db.collection(COLLECTIONS.PRODUCTS).countDocuments({ user_id: u._id });

        const subPlan = sub?.plan || u.subscription?.plan || 'trial';
        const subStat = sub?.status || u.subscription?.status || 'in_trial';
        const expiresAt = sub?.expiry_date || sub?.billing_cycle_end || u.subscription?.expiresAt || new Date();

        // Calculate last activity
        const lastActivity = u.lastLogin || u.user_last_updated_at || u.updated_at || u.created_at || u.createdAt || null;

        return {
          _id: u._id.toString(),
          name: u.name || 'Store Merchant',
          email: u.email,
          role: u.role || 'user',
          status: u.status || 'active',
          shopName: shop?.name || u.shopName || 'Dukaan Store',
          phone: u.phone || shop?.company_phone || '',
          subscription: {
            plan: subPlan,
            status: subStat,
            expiresAt,
            amount: sub?.amount || 0,
          },
          monthlyRevenue: orderAgg[0]?.total || u.monthlyRevenue || 0,
          totalTransactions: orderAgg[0]?.count || u.totalTransactions || 0,
          productCount,
          lastActivity,
          createdAt: u.created_at || u.createdAt || new Date(),
        };
      })
    );

    // Apply plan & subState filters in JavaScript
    let filteredUsers = users;

    if (plan !== 'all') {
      filteredUsers = filteredUsers.filter(
        (u) => u.subscription.plan.toLowerCase() === plan.toLowerCase()
      );
    }

    if (subState !== 'all') {
      filteredUsers = filteredUsers.filter((u) => {
        const exp = new Date(u.subscription.expiresAt);
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
        const isExpired = exp < now || u.subscription.status === 'expired';

        if (subState === 'active') return !isExpired && daysLeft > 0;
        if (subState === 'expiring_soon') return !isExpired && daysLeft <= 7 && daysLeft >= 0;
        if (subState === 'expired') return isExpired;
        return true;
      });
    }

    // Apply Column Sorting
    filteredUsers.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortBy === 'lastActivity') {
        valA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        valB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      } else if (sortBy === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      } else if (sortBy === 'shopName') {
        valA = (a.shopName || '').toLowerCase();
        valB = (b.shopName || '').toLowerCase();
      } else if (sortBy === 'revenue') {
        valA = a.monthlyRevenue || 0;
        valB = b.monthlyRevenue || 0;
      } else if (sortBy === 'expiry') {
        valA = a.subscription?.expiresAt ? new Date(a.subscription.expiresAt).getTime() : 0;
        valB = b.subscription?.expiresAt ? new Date(b.subscription.expiresAt).getTime() : 0;
      } else {
        valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination slice
    const totalUsers = filteredUsers.length;
    const totalPages = Math.ceil(totalUsers / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedUsers = filteredUsers.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      count: paginatedUsers.length,
      totalUsers,
      page,
      totalPages,
      limit,
      users: paginatedUsers,
    });
  } catch (error: any) {
    console.error('Error fetching real users:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
