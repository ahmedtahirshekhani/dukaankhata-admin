import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

async function checkAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('dukaankhata_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

export async function GET(request: Request) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = await getDatabase();
    const { searchParams } = new URL(request.url);

    const search = (searchParams.get('search') || '').trim();
    const plan = searchParams.get('plan') || 'all';
    const sortBy = searchParams.get('sortBy') || 'deletedAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (search) {
      const regex = { $regex: search, $options: 'i' };
      query.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { company: regex },
        { address: regex },
        { city: regex },
        { originalUserId: regex },
      ];
    }

    if (plan !== 'all') {
      query.subscriptionPlan = plan.toLowerCase();
    }

    const sortFieldMap: Record<string, string> = {
      deletedAt: 'deletedAt',
      name: 'name',
      company: 'company',
      email: 'email',
      createdAt: 'createdAt',
    };
    const sortField = sortFieldMap[sortBy] || 'deletedAt';

    const collection = db.collection(COLLECTIONS.LEADS_DELETED);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalLeads, trialLeads, proLeads, recent30Days, leads] = await Promise.all([
      collection.countDocuments(query),
      collection.countDocuments({ subscriptionPlan: 'trial' }),
      collection.countDocuments({ subscriptionPlan: 'pro' }),
      collection.countDocuments({ deletedAt: { $gte: thirtyDaysAgo } }),
      collection
        .find(query)
        .sort({ [sortField]: sortOrder, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
    ]);

    const totalPages = Math.ceil(totalLeads / limit) || 1;

    const formattedLeads = leads.map((item) => ({
      _id: item._id.toString(),
      originalUserId: item.originalUserId,
      name: item.name || 'Unknown Merchant',
      email: item.email || '',
      phone: item.phone || '',
      company: item.company || 'N/A',
      address: item.address || 'N/A',
      city: item.city || '',
      role: item.role || 'user',
      userStatus: item.userStatus || 'active',
      subscriptionPlan: item.subscriptionPlan || 'trial',
      subscriptionStatus: item.subscriptionStatus || 'expired',
      monthlyRevenue: item.monthlyRevenue || 0,
      totalTransactions: item.totalTransactions || 0,
      lastActivity: item.lastActivity || null,
      createdAt: item.createdAt || null,
      deletedAt: item.deletedAt,
    }));

    return NextResponse.json({
      success: true,
      leads: formattedLeads,
      totalLeads,
      totalPages,
      page,
      summary: {
        total: totalLeads,
        trial: trialLeads,
        pro: proLeads,
        recent30Days,
      },
    });
  } catch (error: any) {
    console.error('Failed to fetch deleted leads:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
