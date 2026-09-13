import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { initWhatsAppSession, getWhatsAppStatus } from '@/lib/whatsapp/baileys-manager';

export async function POST() {
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

    await initWhatsAppSession(true);
    const statusObj = getWhatsAppStatus();

    return NextResponse.json({
      success: true,
      ...statusObj,
    });
  } catch (error: any) {
    console.error('Error connecting WhatsApp:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
