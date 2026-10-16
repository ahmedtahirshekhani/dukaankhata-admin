import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { getWhatsAppStatus } from '@/lib/whatsapp/baileys-manager';
import {
  getCurrentCampaignProgress,
  createCampaign,
  setCampaignState,
  tickCampaign,
} from '@/lib/whatsapp/campaign-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient time for Baileys typing simulation and socket dispatch

async function authenticate(request: Request): Promise<boolean> {
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) {
    return true;
  }
  const cookieStore = await cookies();
  const token = cookieStore.get('dukaankhata_token')?.value;
  if (!token) return false;
  const payload = await verifyToken(token);
  return Boolean(payload && payload.role === 'admin');
}

/**
 * GET — Poll current broadcast progress.
 * If campaign is running, also checks if a pending message is ready to be sent (tick)
 * so client polling naturally drives the campaign forward across serverless invocations.
 */
export async function GET(request: Request) {
  try {
    const isAuthed = await authenticate(request);
    if (!isAuthed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const shouldTick = searchParams.get('notick') !== 'true';

    // If active and due to send, advance one recipient
    let progress = await getCurrentCampaignProgress();
    if (shouldTick && progress.active && (!progress.nextSendAt || new Date(progress.nextSendAt).getTime() <= Date.now())) {
      progress = await tickCampaign();
    }

    return NextResponse.json({
      success: true,
      progress,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST — Start a new server-side broadcast campaign.
 * Persists campaign to MongoDB and executes first tick.
 */
export async function POST(request: Request) {
  try {
    const isAuthed = await authenticate(request);
    if (!isAuthed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentWaStatus = await getWhatsAppStatus();
    if (currentWaStatus.state.status !== 'connected') {
      return NextResponse.json(
        { error: 'WhatsApp is not connected. Please scan the QR code first.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      name,
      recipients,
      variants,
      categoryVariants,
      forceSend = false,
      minDelaySec = 30,
      maxDelaySec = 60,
      batchSize = 10,
      batchCooldownMinSec = 300,
      batchCooldownMaxSec = 600,
    } = body;

    const progress = await createCampaign({
      name,
      recipients,
      variants,
      categoryVariants,
      forceSend,
      minDelaySec,
      maxDelaySec,
      batchSize,
      batchCooldownMinSec,
      batchCooldownMaxSec,
    });

    // Run first tick immediately so the first recipient is sent without waiting for poll
    const initialTick = await tickCampaign();

    return NextResponse.json({
      success: true,
      progress: initialTick || progress,
      message: `Broadcast started for ${progress.total} recipients.`,
    });
  } catch (error: any) {
    console.error('Error starting broadcast:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: error.status || 500 });
  }
}

/**
 * PUT — Pause, resume or cancel active broadcast.
 */
export async function PUT(request: Request) {
  try {
    const isAuthed = await authenticate(request);
    if (!isAuthed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action as 'pause' | 'resume' | 'cancel';

    if (!['pause', 'resume', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be pause, resume, or cancel.' }, { status: 400 });
    }

    const progress = await setCampaignState(action, body.campaignId);

    return NextResponse.json({
      success: true,
      progress,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE — Cancel the currently running broadcast.
 */
export async function DELETE(request: Request) {
  try {
    const isAuthed = await authenticate(request);
    if (!isAuthed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const progress = await setCampaignState('cancel');

    return NextResponse.json({
      success: true,
      progress,
      message: 'Broadcast cancellation requested.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
