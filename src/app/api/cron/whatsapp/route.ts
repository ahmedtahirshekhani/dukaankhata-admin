import { NextResponse } from 'next/server';
import { tickCampaign, getCurrentCampaignProgress } from '@/lib/whatsapp/campaign-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron handler for WhatsApp campaigns.
 *
 * Runs on a schedule (e.g. every 1-2 minutes). If an active campaign is running
 * and its cooldown has expired, sends the next recipient. This allows broadcasts
 * to continue running safely even when no browser tabs are open!
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecretHeader = request.headers.get('x-cron-secret');
    const cronSecret = process.env.CRON_SECRET;

    const isVercelCron =
      (authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (cronSecretHeader && cronSecret && cronSecretHeader === cronSecret) ||
      process.env.NODE_ENV !== 'production';

    if (!isVercelCron) {
      return NextResponse.json({ error: 'Unauthorized cron invocation' }, { status: 401 });
    }

    const current = await getCurrentCampaignProgress();
    if (!current.active) {
      return NextResponse.json({
        success: true,
        message: 'No active campaign running.',
        progress: current,
      });
    }

    const progress = await tickCampaign();

    return NextResponse.json({
      success: true,
      message: 'Campaign tick processed.',
      progress,
    });
  } catch (error: any) {
    console.error('Error in WhatsApp cron route:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
