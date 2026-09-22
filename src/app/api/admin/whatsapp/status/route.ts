import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { getDatabase, COLLECTIONS } from '@/lib/db/mongodb';
import { getWhatsAppStatus, initWhatsAppSession } from '@/lib/whatsapp/baileys-manager';

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

    // Auto-init session if disconnected to check saved creds
    const statusObj = getWhatsAppStatus();
    if (statusObj.state.status === 'disconnected') {
      await initWhatsAppSession(false);
    }

    const currentStatus = getWhatsAppStatus();
    const db = await getDatabase();
    const dbLogs = await db
      .collection(COLLECTIONS.WHATSAPP_LOGS)
      .find({})
      .sort({ sentAt: -1 })
      .limit(100)
      .toArray();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaySentCount = await db.collection(COLLECTIONS.WHATSAPP_LOGS).countDocuments({
      status: 'sent',
      sentAt: { $gte: todayStart },
    });

    const formattedLogs = dbLogs.map((l) => ({
      phone: l.phone,
      name: l.name || 'User',
      success: l.status === 'sent',
      error: l.error || (l.status === 'sent' ? undefined : 'Failed'),
      sentAt: l.sentAt ? new Date(l.sentAt).toISOString() : undefined,
    }));

    return NextResponse.json({
      success: true,
      state: currentStatus.state,
      todaySentCount,
      dailyLimit: 20,
      logs: formattedLogs.length > 0 ? formattedLogs : currentStatus.logs,
    });
  } catch (error: any) {
    console.error('Error fetching WhatsApp status:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
