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
    const ordersRaw = await db
      .collection(COLLECTIONS.ORDERS)
      .find()
      .sort({ created_at: -1, sale_date: -1 })
      .limit(50)
      .toArray();

    const orders = await Promise.all(
      ordersRaw.map(async (o) => {
        // Find merchant user
        const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: o.user_id });
        const shop = await db.collection(COLLECTIONS.SHOPS).findOne({
          $or: [{ owner_user_id: o.user_id }, { user_id: o.user_id }, { _id: o.user_id }],
        });
        const party = o.customer_id
          ? await db.collection(COLLECTIONS.PARTIES).findOne({ _id: o.customer_id })
          : null;

        return {
          _id: o._id.toString(),
          invoiceNo: o.invoice_no || `INV-${o._id.toString().slice(-6)}`,
          merchantName: user?.name || 'Store Owner',
          shopName: shop?.name || user?.shopName || 'Dukaan Store',
          customerName: party?.name || 'Walk-in Customer',
          totalAmount: o.total_amount || 0,
          status: o.status || 'completed',
          date: o.sale_date || o.created_at || new Date(),
        };
      })
    );

    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error: any) {
    console.error('Fetch orders error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
