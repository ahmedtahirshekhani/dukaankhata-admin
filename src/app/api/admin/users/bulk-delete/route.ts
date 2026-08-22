import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { isMerchantDeletable, purgeMerchantData } from '@/lib/admin/purge-user';

async function checkAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('dukaankhata_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

export async function POST(request: Request) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const ids: unknown = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No merchant IDs provided.' }, { status: 400 });
    }

    if (ids.length > 50) {
      return NextResponse.json({ error: 'Cannot delete more than 50 merchants at once.' }, { status: 400 });
    }

    const db = await getDatabase();
    const now = new Date();

    const deleted: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const rawId of ids) {
      if (typeof rawId !== 'string') {
        failed.push({ id: String(rawId), error: 'Invalid ID format' });
        continue;
      }

      let userObjectId;
      try {
        userObjectId = toObjectId(rawId);
      } catch {
        failed.push({ id: rawId, error: 'Invalid ID format' });
        continue;
      }

      const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: userObjectId });
      if (!user) {
        failed.push({ id: rawId, error: 'User not found' });
        continue;
      }

      if (user.role === 'admin') {
        failed.push({ id: rawId, error: 'Admin accounts cannot be deleted' });
        continue;
      }

      const deletable = await isMerchantDeletable(db, user as any, now);
      if (!deletable) {
        failed.push({
          id: rawId,
          error: 'Merchant is not eligible for deletion',
        });
        continue;
      }

      await purgeMerchantData(db, userObjectId, user.email);
      deleted.push(user.name || user.email || rawId);
    }

    if (deleted.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No merchants were deleted.',
          failed,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: deleted.length,
      deleted,
      failed,
      message:
        failed.length > 0
          ? `Deleted ${deleted.length} merchant(s). ${failed.length} could not be deleted.`
          : `Deleted ${deleted.length} merchant(s) and all associated data permanently.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
