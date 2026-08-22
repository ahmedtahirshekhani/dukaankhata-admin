import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { buildUsersListPipeline, parseUsersQueryParams } from '@/lib/admin/users-pipeline';

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
    const params = parseUsersQueryParams(searchParams);
    const now = new Date();

    const pipeline = buildUsersListPipeline(params, now);
    const [result] = await db.collection(COLLECTIONS.USERS).aggregate(pipeline).toArray();

    const totalUsers = result?.metadata?.[0]?.totalUsers ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalUsers / params.limit));
    const page = Math.min(params.page, totalPages);
    let users = result?.data ?? [];

    if (params.page > totalPages && totalUsers > 0) {
      const correctedPipeline = buildUsersListPipeline({ ...params, page: totalPages }, now);
      const [corrected] = await db.collection(COLLECTIONS.USERS).aggregate(correctedPipeline).toArray();
      users = corrected?.data ?? [];
    }

    return NextResponse.json({
      success: true,
      count: users.length,
      totalUsers,
      page,
      totalPages,
      limit: params.limit,
      users,
    });
  } catch (error: any) {
    console.error('Error fetching real users:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
