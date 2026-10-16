import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { connectWhatsApp, getWhatsAppStatus } from '@/lib/whatsapp/baileys-manager';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient time for Baileys QR generation and pairing handshake

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

    const current = await getWhatsAppStatus();
    if (current.state.status === 'connected') {
      return NextResponse.json({
        success: true,
        state: current.state,
        needsRetry: false,
      });
    }

    const connectResult = await connectWhatsApp(45_000);

    return NextResponse.json({
      success: true,
      state: connectResult.state,
      needsRetry: connectResult.needsRetry,
    });
  } catch (error: any) {
    console.error('Error connecting WhatsApp:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
