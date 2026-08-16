import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { verifyToken } from '@/lib/auth';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('dukaankhata_token')?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || !payload.id) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const db = await getDatabase();
    const userIdStr = typeof payload.id === 'string' ? payload.id : String(payload.id);
    const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: toObjectId(userIdStr) });

    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user._id.toString(),
        name: user.name || 'Admin',
        email: user.email,
        role: user.role || 'admin',
        status: user.status || 'active',
      },
    });
  } catch (error) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 500 });
  }
}
