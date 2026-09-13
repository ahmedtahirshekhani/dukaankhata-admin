import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import {
  sendSingleWhatsAppMessage,
  getWhatsAppStatus,
  formatWhatsAppPhone,
  replaceTemplateVariables,
  SendResult,
} from '@/lib/whatsapp/baileys-manager';

export async function POST(request: Request) {
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

    const currentStatus = getWhatsAppStatus();
    if (currentStatus.state.status !== 'connected') {
      return NextResponse.json(
        { error: 'WhatsApp is not connected. Please scan the QR code first.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { userIds, recipients: inputRecipients, message, delayMs = 1200, forceSend = false } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message content is required.' }, { status: 400 });
    }

    let finalRecipients: any[] = [];
    const db = await getDatabase();

    if (Array.isArray(inputRecipients) && inputRecipients.length > 0) {
      finalRecipients = inputRecipients;
    } else if (Array.isArray(userIds) && userIds.length > 0) {
      const objectIds = userIds.map((id: string) => toObjectId(id));
      const usersDocs = await db
        .collection(COLLECTIONS.USERS)
        .find({ _id: { $in: objectIds } })
        .toArray();

      finalRecipients = usersDocs.map((u) => ({
        id: u._id.toString(),
        name: u.name || 'User',
        phone: u.phone || u.whatsapp || u.mobile || '',
        shopName: u.shopName || '',
        email: u.email || '',
        plan: u.subscription?.plan || 'free',
        expiresAt: u.subscription?.expiresAt || '',
        status: u.status || 'active',
      }));
    } else {
      return NextResponse.json({ error: 'No recipients provided.' }, { status: 400 });
    }

    if (finalRecipients.length === 0) {
      return NextResponse.json({ error: 'No valid target users found.' }, { status: 400 });
    }

    // 7-day cooldown cutoff
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const results: (SendResult & { skipped?: boolean })[] = [];
    let sentCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < finalRecipients.length; i++) {
      const user = finalRecipients[i];
      const rawPhone = user.phone || user.whatsapp || (user as any).mobile || '';
      const cleanPhone = formatWhatsAppPhone(rawPhone);
      const msg = replaceTemplateVariables(message, user);

      if (!cleanPhone) {
        const failedItem: SendResult = {
          phone: rawPhone || 'N/A',
          name: user.name || 'Unknown',
          success: false,
          error: 'No valid phone number',
          sentAt: new Date().toISOString(),
        };
        results.push(failedItem);
        failCount++;
        continue;
      }

      // Check 7-day frequency rule if forceSend is not enabled
      if (!forceSend) {
        const recentLog = await db.collection(COLLECTIONS.WHATSAPP_LOGS).findOne({
          $or: [{ phone: cleanPhone }, { userId: user.id || user._id }],
          status: 'sent',
          sentAt: { $gte: sevenDaysAgo },
        });

        if (recentLog) {
          const skippedItem = {
            phone: cleanPhone,
            name: user.name || 'User',
            success: false,
            skipped: true,
            error: `Skipped (Sent on ${new Date(recentLog.sentAt).toLocaleDateString()} - 7-day limit)`,
            sentAt: new Date().toISOString(),
          };
          results.push(skippedItem);
          skippedCount++;
          continue;
        }
      }

      // Send message via Baileys socket
      const sendRes = await sendSingleWhatsAppMessage(cleanPhone, msg);
      const now = new Date();

      const logRecord = {
        userId: user.id || user._id || null,
        name: user.name || 'User',
        phone: cleanPhone,
        message: msg,
        status: sendRes.success ? 'sent' : 'failed',
        error: sendRes.error || null,
        sentAt: now,
      };

      await db.collection(COLLECTIONS.WHATSAPP_LOGS).insertOne(logRecord);

      const logItem: SendResult = {
        phone: cleanPhone,
        name: user.name || 'User',
        success: sendRes.success,
        error: sendRes.error,
        sentAt: now.toISOString(),
      };

      results.push(logItem);

      if (sendRes.success) {
        sentCount++;
      } else {
        failCount++;
      }

      // Rate limit delay between sequential messages
      if (i < finalRecipients.length - 1 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return NextResponse.json({
      success: true,
      total: finalRecipients.length,
      sentCount,
      failCount,
      skippedCount,
      results,
    });
  } catch (error: any) {
    console.error('Error in WhatsApp send API route:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
