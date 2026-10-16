import { ObjectId } from 'mongodb';
import { getDatabase, getCollection, COLLECTIONS } from '@/lib/db/mongodb';
import {
  withWhatsAppSocket,
  sendTextOnSocket,
  refreshAccountHealth,
  recordMarketLeadWhatsAppStatus,
  WhatsAppNotConnectedError,
  type SendOutcome,
} from './baileys-manager';
import { formatWhatsAppPhone, replaceTemplateVariables, parseSpintax, isRealPersonName } from './phone-utils';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel-safe WhatsApp campaign engine
 * ─────────────────────────────────────────────────────────────────────────────
 * The old engine ran one long `for` loop with `setTimeout` sleeps inside the
 * Node process. That cannot work on Vercel (functions time out after ≤60s and
 * are frozen between requests).
 *
 * Now (same idea as the main DukaanKhata app):
 *  • A campaign + its recipient queue is persisted in `whatsapp_campaigns`.
 *  • `tickCampaign()` sends AT MOST ONE message, then stores `nextSendAt`
 *    (per-message gap or batch cooldown) and returns immediately.
 *  • The dashboard calls the tick endpoint every few seconds while open; an
 *    external cron can call it too, so campaigns continue with the tab closed.
 *  • All anti-ban timing is enforced SERVER-SIDE from the DB, so refreshing,
 *    multiple tabs or cron + browser together can never send faster.
 *  • A DB lock guarantees only one message is in flight at any time.
 */

// ─── Safety configuration (override via env) ────────────────────────────────

const envInt = (key: string, fallback: number) => {
  const v = parseInt(process.env[key] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const SAFETY = {
  /** Max messages per Pakistan calendar day across all campaigns + tests. */
  dailyLimit: envInt('WA_DAILY_LIMIT', 150),
  /** Max messages in any rolling 60 minutes. */
  hourlyLimit: envInt('WA_HOURLY_LIMIT', 40),
  /** Only send between these hours (Asia/Karachi). Messages at 3am scream "bot". */
  windowStartHour: Math.min(23, envInt('WA_SEND_WINDOW_START', 9)),
  windowEndHour: Math.min(24, envInt('WA_SEND_WINDOW_END', 21)),
  /** Pause the campaign after this many failures in a row. */
  maxConsecutiveFailures: envInt('WA_MAX_CONSECUTIVE_FAILURES', 3),
  /** Same person can't be messaged again within this many days (unless forceSend). */
  repeatCooldownDays: envInt('WA_REPEAT_COOLDOWN_DAYS', 15),
  /** Hard floors — the UI can't configure anything faster than this. */
  minGapSecFloor: 20,
  minBatchCooldownSecFloor: 180,
  maxBatchSize: 15,
};

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Karachi = UTC+5, no DST
const LOCK_MS = 58_000;

function pktNow(d = new Date()) {
  return new Date(d.getTime() + PKT_OFFSET_MS); // use getUTC* on this
}

function pktStartOfDay(d = new Date()): Date {
  const p = pktNow(d);
  return new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate()) - PKT_OFFSET_MS);
}

function nextWindowStart(d = new Date()): Date {
  const p = pktNow(d);
  let start = Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate(), SAFETY.windowStartHour) - PKT_OFFSET_MS;
  if (start <= d.getTime()) start += 24 * 60 * 60 * 1000;
  return new Date(start);
}

function formatPkt(d: Date) {
  return d.toLocaleString('en-PK', { timeZone: 'Asia/Karachi', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ─── Types ───────────────────────────────────────────────────────────────────

export type CampaignStatus = 'running' | 'paused' | 'completed' | 'cancelled';
export type RecipientStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface CampaignRecipient {
  id?: string | null;
  name: string;
  phone: string;
  shopName?: string;
  email?: string;
  category?: string;
  businessType?: string;
  place?: string;
  market?: string;
  address?: string;
  plan?: string;
  expiresAt?: string;
  monthlyRevenue?: number;
  status: RecipientStatus;
  variantIdx?: number | null;
  error?: string | null;
  sentAt?: Date | null;
  messageId?: string | null;
}

export interface CampaignProgress {
  campaignId: string | null;
  name: string | null;
  status: CampaignStatus | null;
  active: boolean;
  paused: boolean;
  cancelled: boolean;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  currentIndex: number;
  currentName: string;
  currentVariantIdx: number;
  countdownSec: number;
  nextSendAt: string | null;
  isBatchCooldown: boolean;
  batchCooldownTotalSec: number;
  currentBatchNumber: number;
  batchStatusText: string;
  waitReason: string | null;
  pauseReason: string | null;
  resultMessage: string | null;
  resultType: 'success' | 'error' | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SafetySnapshot {
  dailyLimit: number;
  hourlyLimit: number;
  todaySentCount: number;
  hourSentCount: number;
  windowStartHour: number;
  windowEndHour: number;
  insideSendWindow: boolean;
  repeatCooldownDays: number;
  minGapSecFloor: number;
  minBatchCooldownSecFloor: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function campaignsCol() {
  return getCollection(COLLECTIONS.WHATSAPP_CAMPAIGNS);
}

function displayNameFor(r: { name?: string; shopName?: string }) {
  return isRealPersonName(r.name, r.shopName)
    ? (r.name as string).trim()
    : r.shopName
      ? `${r.shopName} wale bhai`
      : 'Dukan wale bhai';
}

function toProgress(c: any | null): CampaignProgress {
  if (!c) {
    return {
      campaignId: null, name: null, status: null, active: false, paused: false, cancelled: false,
      total: 0, sent: 0, failed: 0, skipped: 0, currentIndex: 0, currentName: '', currentVariantIdx: 0,
      countdownSec: 0, nextSendAt: null, isBatchCooldown: false, batchCooldownTotalSec: 0,
      currentBatchNumber: 1, batchStatusText: '', waitReason: null, pauseReason: null,
      resultMessage: null, resultType: null, startedAt: null, completedAt: null,
    };
  }
  const next = c.nextSendAt ? new Date(c.nextSendAt) : null;
  const countdownSec = c.status === 'running' && next ? Math.max(0, Math.ceil((next.getTime() - Date.now()) / 1000)) : 0;
  return {
    campaignId: c._id.toString(),
    name: c.name || null,
    status: c.status,
    active: c.status === 'running',
    paused: c.status === 'paused',
    cancelled: c.status === 'cancelled',
    total: c.total || 0,
    sent: c.sent || 0,
    failed: c.failed || 0,
    skipped: c.skipped || 0,
    currentIndex: Math.min(c.total || 0, (c.cursor || 0) + (c.status === 'running' ? 1 : 0)),
    currentName: c.currentName || '',
    currentVariantIdx: c.currentVariantIdx || 0,
    countdownSec,
    nextSendAt: next ? next.toISOString() : null,
    isBatchCooldown: Boolean(c.isBatchCooldown) && countdownSec > 0,
    batchCooldownTotalSec: c.batchCooldownTotalSec || 0,
    currentBatchNumber: Math.floor((c.sent || 0) / (c.batchSize || 10)) + 1,
    batchStatusText: c.batchStatusText || '',
    waitReason: countdownSec > 0 ? c.waitReason || null : null,
    pauseReason: c.pauseReason || null,
    resultMessage: c.resultMessage || null,
    resultType: c.resultType || null,
    startedAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    completedAt: c.completedAt ? new Date(c.completedAt).toISOString() : null,
  };
}

export async function getSafetySnapshot(): Promise<SafetySnapshot> {
  const db = await getDatabase();
  const logs = db.collection(COLLECTIONS.WHATSAPP_LOGS);
  const [todaySentCount, hourSentCount] = await Promise.all([
    logs.countDocuments({ status: 'sent', sentAt: { $gte: pktStartOfDay() } }),
    logs.countDocuments({ status: 'sent', sentAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }),
  ]);
  const hour = pktNow().getUTCHours();
  return {
    dailyLimit: SAFETY.dailyLimit,
    hourlyLimit: SAFETY.hourlyLimit,
    todaySentCount,
    hourSentCount,
    windowStartHour: SAFETY.windowStartHour,
    windowEndHour: SAFETY.windowEndHour,
    insideSendWindow: hour >= SAFETY.windowStartHour && hour < SAFETY.windowEndHour,
    repeatCooldownDays: SAFETY.repeatCooldownDays,
    minGapSecFloor: SAFETY.minGapSecFloor,
    minBatchCooldownSecFloor: SAFETY.minBatchCooldownSecFloor,
  };
}

/** Returns a reason + resume time if sending right now would break a safety rule. */
async function checkSafetyGates(): Promise<{ until: Date; reason: string } | null> {
  const now = new Date();
  const snap = await getSafetySnapshot();

  if (!snap.insideSendWindow) {
    const until = nextWindowStart(now);
    return {
      until,
      reason: `Outside safe sending hours (${SAFETY.windowStartHour}:00–${SAFETY.windowEndHour}:00 PKT). Resumes ${formatPkt(until)}.`,
    };
  }
  if (snap.todaySentCount >= SAFETY.dailyLimit) {
    const until = nextWindowStart(new Date(pktStartOfDay(now).getTime() + 24 * 60 * 60 * 1000 - 1));
    return { until, reason: `Daily safety limit reached (${snap.todaySentCount}/${SAFETY.dailyLimit}). Resumes ${formatPkt(until)}.` };
  }
  if (snap.hourSentCount >= SAFETY.hourlyLimit) {
    const db = await getDatabase();
    const oldest = await db
      .collection(COLLECTIONS.WHATSAPP_LOGS)
      .find({ status: 'sent', sentAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) } })
      .sort({ sentAt: 1 })
      .limit(1)
      .next();
    const until = new Date((oldest?.sentAt ? new Date(oldest.sentAt).getTime() : now.getTime()) + 60 * 60 * 1000 + rand(30, 120) * 1000);
    return { until, reason: `Hourly safety limit reached (${snap.hourSentCount}/${SAFETY.hourlyLimit}). Cooling down until ${formatPkt(until)}.` };
  }
  return null;
}

/** Throws if today's quota is used up — used by single test sends too. */
export async function assertCanSendNow(): Promise<void> {
  const gate = await checkSafetyGates();
  if (gate && !gate.reason.startsWith('Outside')) throw new Error(gate.reason);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getCurrentCampaignProgress(): Promise<CampaignProgress> {
  const col = await campaignsCol();
  const live = await col.findOne({ status: { $in: ['running', 'paused'] } }, { sort: { createdAt: -1 }, projection: { recipients: 0 } });
  if (live) return toProgress(live);
  const last = await col.findOne({}, { sort: { createdAt: -1 }, projection: { recipients: 0 } });
  return toProgress(last);
}

export async function listCampaigns(limit = 20) {
  const col = await campaignsCol();
  const docs = await col.find({}, { projection: { recipients: 0, variants: 0, categoryVariants: 0 } }).sort({ createdAt: -1 }).limit(limit).toArray();
  return docs.map((c) => ({
    id: c._id.toString(),
    name: c.name,
    status: c.status as CampaignStatus,
    total: c.total || 0,
    sent: c.sent || 0,
    failed: c.failed || 0,
    skipped: c.skipped || 0,
    pauseReason: c.pauseReason || null,
    resultMessage: c.resultMessage || null,
    createdAt: c.createdAt,
    completedAt: c.completedAt || null,
    lastSentAt: c.lastSentAt || null,
  }));
}

export async function getCampaignDetail(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const col = await campaignsCol();
  const c = await col.findOne({ _id: new ObjectId(id) }, { projection: { categoryVariants: 0 } });
  if (!c) return null;
  return {
    ...toProgress(c),
    recipients: (c.recipients || []).map((r: CampaignRecipient, index: number) => ({
      index,
      id: r.id,
      name: displayNameFor(r),
      phone: r.phone,
      status: r.status,
      variantIdx: r.variantIdx ?? null,
      error: r.error || null,
      sentAt: r.sentAt || null,
    })),
  };
}

export async function createCampaign(params: {
  name?: string;
  recipients: any[];
  variants: string[];
  categoryVariants?: Record<string, string[]>;
  forceSend?: boolean;
  minDelaySec?: number;
  maxDelaySec?: number;
  batchSize?: number;
  batchCooldownMinSec?: number;
  batchCooldownMaxSec?: number;
}) {
  const col = await campaignsCol();
  const existing = await col.findOne({ status: { $in: ['running', 'paused'] } }, { projection: { _id: 1, status: 1 } });
  if (existing) {
    throw Object.assign(
      new Error(`A campaign is already ${existing.status}. Resume, or cancel it before starting a new one.`),
      { status: 409 }
    );
  }

  const variants = (params.variants || []).map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
  const categoryVariants: Record<string, string[]> = {};
  for (const [k, pool] of Object.entries(params.categoryVariants || {})) {
    const clean = (pool || []).map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
    if (clean.length) categoryVariants[k] = clean;
  }
  if (variants.length === 0 && Object.keys(categoryVariants).length === 0) {
    throw Object.assign(new Error('Please provide at least one message variant.'), { status: 400 });
  }

  // De-duplicate by phone — messaging the same number twice in one blast is a red flag.
  const seen = new Set<string>();
  const recipients: CampaignRecipient[] = [];
  for (const u of params.recipients || []) {
    const rawPhone = String(u.phone || u.whatsapp || u.mobile || '');
    const clean = formatWhatsAppPhone(rawPhone);
    if (clean && seen.has(clean)) continue;
    if (clean) seen.add(clean);
    recipients.push({
      id: (u.id || u._id || null)?.toString?.() ?? null,
      name: u.name || '',
      phone: rawPhone,
      shopName: u.shopName || '',
      email: u.email || '',
      category: u.category || '',
      businessType: u.businessType || '',
      place: u.place || '',
      market: u.market || '',
      address: u.address || '',
      plan: u.plan || '',
      expiresAt: u.expiresAt || '',
      monthlyRevenue: u.monthlyRevenue || 0,
      status: 'pending',
      variantIdx: null,
      error: null,
      sentAt: null,
      messageId: null,
    });
  }
  if (recipients.length === 0) {
    throw Object.assign(new Error('No valid recipients.'), { status: 400 });
  }
  if (recipients.length > 1000) {
    throw Object.assign(new Error('Maximum 1000 recipients per campaign.'), { status: 400 });
  }

  const minDelaySec = Math.max(SAFETY.minGapSecFloor, Number(params.minDelaySec) || 30);
  const maxDelaySec = Math.max(minDelaySec, Number(params.maxDelaySec) || 60);
  const batchCooldownMinSec = Math.max(SAFETY.minBatchCooldownSecFloor, Number(params.batchCooldownMinSec) || 300);
  const batchCooldownMaxSec = Math.max(batchCooldownMinSec, Number(params.batchCooldownMaxSec) || 600);
  const batchSize = Math.min(SAFETY.maxBatchSize, Math.max(1, Number(params.batchSize) || 10));

  const now = new Date();
  const doc = {
    name: params.name?.trim() || `Broadcast ${formatPkt(now)}`,
    status: 'running' as CampaignStatus,
    variants,
    categoryVariants,
    forceSend: Boolean(params.forceSend),
    minDelaySec,
    maxDelaySec,
    batchSize,
    batchCooldownMinSec,
    batchCooldownMaxSec,
    recipients,
    total: recipients.length,
    cursor: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    sentSinceBreak: 0,
    consecutiveFailures: 0,
    nextSendAt: now,
    lockUntil: null,
    isBatchCooldown: false,
    batchCooldownTotalSec: 0,
    batchStatusText: '',
    waitReason: null,
    pauseReason: null,
    currentName: '',
    currentVariantIdx: 0,
    lastVariantKey: null,
    resultMessage: null,
    resultType: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    lastSentAt: null,
  };
  const res = await col.insertOne(doc);
  return toProgress({ ...doc, _id: res.insertedId });
}

export async function setCampaignState(action: 'pause' | 'resume' | 'cancel', id?: string) {
  const col = await campaignsCol();
  const filter: any = id && ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { status: { $in: ['running', 'paused'] } };
  const c = await col.findOne(filter, { sort: { createdAt: -1 }, projection: { recipients: 0 } });
  if (!c) return getCurrentCampaignProgress();
  const now = new Date();

  if (action === 'pause' && c.status === 'running') {
    await col.updateOne({ _id: c._id }, { $set: { status: 'paused', pauseReason: 'Paused by admin.', updatedAt: now } });
  } else if (action === 'resume' && c.status === 'paused') {
    // Resume never fires instantly — always wait a normal gap first.
    const gap = rand(c.minDelaySec || 30, c.maxDelaySec || 60);
    await col.updateOne(
      { _id: c._id },
      {
        $set: {
          status: 'running', pauseReason: null, consecutiveFailures: 0, lockUntil: null,
          nextSendAt: new Date(now.getTime() + Math.min(gap, 20) * 1000),
          isBatchCooldown: false, waitReason: 'Resuming…', updatedAt: now,
        },
      }
    );
  } else if (action === 'cancel' && (c.status === 'running' || c.status === 'paused')) {
    await col.updateOne(
      { _id: c._id },
      {
        $set: {
          status: 'cancelled', completedAt: now, updatedAt: now, resultType: 'error',
          resultMessage: `Broadcast cancelled by admin. Sent ${c.sent || 0} of ${c.total || 0} messages.`,
        },
      }
    );
  }
  const fresh = await col.findOne({ _id: c._id }, { projection: { recipients: 0 } });
  return toProgress(fresh);
}

function pickVariant(camp: any, r: CampaignRecipient): { pool: string[]; idx: number; key: string } {
  let pool: string[] = camp.variants || [];
  let poolKey = 'default';
  const catMap: Record<string, string[]> = camp.categoryVariants || {};
  if (Object.keys(catMap).length > 0) {
    const meta = `${r.category || ''} ${r.businessType || ''} ${r.market || ''} ${r.place || ''} ${r.plan || ''}`.toLowerCase();
    const match = Object.keys(catMap).find((k) => meta.includes(k.toLowerCase()));
    if (match && catMap[match]?.length) {
      pool = catMap[match];
      poolKey = match;
    }
  }
  if (pool.length === 0) {
    const first = Object.entries(catMap).find(([, p]) => p.length);
    pool = first?.[1] || [];
    poolKey = first?.[0] || 'default';
  }
  // Never send the exact same variant twice in a row.
  let idx = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && camp.lastVariantKey === `${poolKey}:${idx}`) {
    idx = (idx + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
  }
  return { pool, idx, key: `${poolKey}:${idx}` };
}

/**
 * Advance the active campaign by at most one message. Safe to call as often
 * as you like (browser polling + cron): it no-ops until `nextSendAt`.
 */
export async function tickCampaign(): Promise<CampaignProgress> {
  const col = await campaignsCol();
  const now = new Date();

  const camp = await col.findOne({ status: 'running' }, { sort: { createdAt: -1 }, projection: { recipients: 0 } });
  if (!camp) return getCurrentCampaignProgress();
  if (camp.nextSendAt && new Date(camp.nextSendAt) > now) return toProgress(camp);
  if (camp.lockUntil && new Date(camp.lockUntil) > now) return toProgress(camp);

  const gate = await checkSafetyGates();
  if (gate) {
    await col.updateOne({ _id: camp._id }, { $set: { nextSendAt: gate.until, waitReason: gate.reason, isBatchCooldown: false, updatedAt: now } });
    return toProgress({ ...camp, nextSendAt: gate.until, waitReason: gate.reason, isBatchCooldown: false });
  }

  // Atomic lock — only one tick may send at a time across all instances.
  const locked = await col.findOneAndUpdate(
    {
      _id: camp._id,
      status: 'running',
      $and: [
        { $or: [{ lockUntil: null }, { lockUntil: { $exists: false } }, { lockUntil: { $lt: now } }] },
        { $or: [{ nextSendAt: null }, { nextSendAt: { $lte: now } }] },
      ],
    },
    { $set: { lockUntil: new Date(now.getTime() + LOCK_MS) } },
    { returnDocument: 'after' }
  );
  if (!locked) return getCurrentCampaignProgress();

  try {
    await processNextRecipient(locked);
  } catch (err: any) {
    console.error('[WA Campaign] tick error:', err);
    await col.updateOne({ _id: locked._id }, { $set: { nextSendAt: new Date(Date.now() + 30_000), waitReason: `Error: ${err?.message || 'unknown'} — retrying in 30s` } });
  } finally {
    await col.updateOne({ _id: locked._id }, { $set: { lockUntil: null, updatedAt: new Date() } });
  }

  const fresh = await col.findOne({ _id: locked._id }, { projection: { recipients: 0 } });
  return toProgress(fresh);
}

async function processNextRecipient(camp: any) {
  const col = await campaignsCol();
  const db = await getDatabase();
  const logs = db.collection(COLLECTIONS.WHATSAPP_LOGS);
  const recipients: CampaignRecipient[] = camp.recipients || [];
  const set: Record<string, any> = {};
  const inc: Record<string, number> = {};
  let idx: number = camp.cursor || 0;
  const repeatCutoff = new Date(Date.now() - SAFETY.repeatCooldownDays * 24 * 60 * 60 * 1000);

  // 1. Fast-forward over recipients we must not message (no WhatsApp traffic generated).
  for (let guard = 0; idx < recipients.length && guard < 200; guard++) {
    const r = recipients[idx];
    const clean = formatWhatsAppPhone(r.phone);
    if (!clean || clean.length < 10) {
      set[`recipients.${idx}.status`] = 'failed';
      set[`recipients.${idx}.error`] = 'No valid phone number';
      inc.failed = (inc.failed || 0) + 1;
      idx++;
      continue;
    }
    if (!camp.forceSend) {
      const recent = await logs.findOne({
        $or: [{ phone: clean }, ...(r.id ? [{ userId: r.id }] : [])],
        status: 'sent',
        sentAt: { $gte: repeatCutoff },
      });
      if (recent) {
        set[`recipients.${idx}.status`] = 'skipped';
        set[`recipients.${idx}.error`] = `Already messaged in last ${SAFETY.repeatCooldownDays} days`;
        inc.skipped = (inc.skipped || 0) + 1;
        idx++;
        continue;
      }
    }
    break;
  }

  const finish = async () => {
    const sent = (camp.sent || 0) + (inc.sent || 0);
    const failed = (camp.failed || 0) + (inc.failed || 0);
    const skipped = (camp.skipped || 0) + (inc.skipped || 0);
    let msg = `Broadcast complete! Sent ${sent} of ${camp.total} messages.`;
    if (skipped) msg += ` (${skipped} skipped)`;
    if (failed) msg += ` (${failed} failed)`;
    Object.assign(set, {
      cursor: idx, status: 'completed', completedAt: new Date(), resultMessage: msg, resultType: 'success',
      isBatchCooldown: false, waitReason: null, nextSendAt: null,
    });
    await col.updateOne({ _id: camp._id }, { $set: set, ...(Object.keys(inc).length ? { $inc: inc } : {}) });
  };

  if (idx >= recipients.length) return finish();

  const r = recipients[idx];
  const cleanPhone = formatWhatsAppPhone(r.phone);
  const displayName = displayNameFor(r);
  const { pool, idx: variantIdx, key: variantKey } = pickVariant(camp, r);
  const message = parseSpintax(replaceTemplateVariables(pool[variantIdx] || '', r as any));
  set.currentName = displayName;
  set.currentVariantIdx = variantIdx + 1;

  // 2. Send (with WhatsApp's own restriction signals checked first).
  let outcome: SendOutcome & { healthBlock?: string };
  try {
    outcome = await withWhatsAppSocket(async (sock) => {
      const health = await refreshAccountHealth(sock);
      if (health.reachoutLocked) {
        return {
          success: false,
          healthBlock: `WhatsApp has temporarily restricted this number from messaging new contacts${
            health.reachoutLockEndsAt ? ` until ${formatPkt(new Date(health.reachoutLockEndsAt))}` : ''
          }. Campaign paused — do NOT resume before then.`,
        };
      }
      if (
        health.newChatQuotaTotal !== null && health.newChatQuotaUsed !== null &&
        health.newChatQuotaUsed >= health.newChatQuotaTotal
      ) {
        return {
          success: false,
          healthBlock: `WhatsApp new-chat quota used up (${health.newChatQuotaUsed}/${health.newChatQuotaTotal})${
            health.newChatQuotaResetsAt ? `, resets ${formatPkt(new Date(health.newChatQuotaResetsAt))}` : ''
          }. Campaign paused.`,
        };
      }
      return sendTextOnSocket(sock, r.phone, message, { simulateTyping: true, verifyOnWhatsApp: true });
    });
  } catch (err: any) {
    outcome = { success: false, connectionError: true, error: err?.message || 'WhatsApp connection failed' };
    if (err instanceof WhatsAppNotConnectedError) {
      Object.assign(set, { cursor: idx, status: 'paused', pauseReason: `WhatsApp disconnected: ${err.message}` });
      await col.updateOne({ _id: camp._id }, { $set: set, ...(Object.keys(inc).length ? { $inc: inc } : {}) });
      return;
    }
  }

  const now = new Date();

  if (outcome.healthBlock) {
    Object.assign(set, { cursor: idx, status: 'paused', pauseReason: outcome.healthBlock });
    await col.updateOne({ _id: camp._id }, { $set: set, ...(Object.keys(inc).length ? { $inc: inc } : {}) });
    return;
  }

  // Log every real attempt (users pipeline reads `userId` + `status: 'sent'` from here).
  if (!outcome.connectionError) {
    await logs.insertOne({
      userId: r.id || null,
      campaignId: camp._id,
      name: displayName,
      phone: cleanPhone,
      message,
      variantIndex: variantIdx + 1,
      status: outcome.success ? 'sent' : 'failed',
      error: outcome.error || null,
      messageId: outcome.messageId || null,
      sentAt: now,
    });
    await recordMarketLeadWhatsAppStatus(db, {
      cleanPhone, rawPhone: r.phone, leadId: r.id, success: outcome.success,
      message, variantIndex: variantIdx + 1, error: outcome.error, sentAt: now,
    });
  }

  if (outcome.success) {
    set[`recipients.${idx}.status`] = 'sent';
    set[`recipients.${idx}.variantIdx`] = variantIdx + 1;
    set[`recipients.${idx}.sentAt`] = now;
    set[`recipients.${idx}.messageId`] = outcome.messageId || null;
    inc.sent = (inc.sent || 0) + 1;
    idx++;
    set.consecutiveFailures = 0;
    set.lastSentAt = now;
    set.lastVariantKey = variantKey;

    // 3. Schedule the next send: per-message gap, or a long batch break.
    const sentSinceBreak = (camp.sentSinceBreak || 0) + 1;
    const batchSize = camp.batchSize || 10;
    if (idx >= recipients.length) return finish();
    if (sentSinceBreak >= batchSize) {
      const sec = rand(camp.batchCooldownMinSec, camp.batchCooldownMaxSec);
      const batchNum = Math.floor(((camp.sent || 0) + 1) / batchSize);
      Object.assign(set, {
        sentSinceBreak: 0,
        isBatchCooldown: true,
        batchCooldownTotalSec: sec,
        batchStatusText: `Batch ${batchNum} (${batchSize} msgs) sent! Anti-ban rest for ${Math.floor(sec / 60)}m ${sec % 60}s before Batch ${batchNum + 1}...`,
        nextSendAt: new Date(now.getTime() + sec * 1000),
        waitReason: null,
      });
    } else {
      const sec = rand(camp.minDelaySec, camp.maxDelaySec);
      Object.assign(set, {
        sentSinceBreak,
        isBatchCooldown: false,
        batchStatusText: '',
        nextSendAt: new Date(now.getTime() + sec * 1000),
        waitReason: null,
      });
    }
  } else if (outcome.notOnWhatsApp) {
    set[`recipients.${idx}.status`] = 'failed';
    set[`recipients.${idx}.error`] = 'Number is not on WhatsApp';
    inc.failed = (inc.failed || 0) + 1;
    idx++;
    // Only a lookup happened — short pause is enough.
    Object.assign(set, { nextSendAt: new Date(now.getTime() + rand(4, 8) * 1000), isBatchCooldown: false, waitReason: null });
    if (idx >= recipients.length) return finish();
  } else if (outcome.accountRisk) {
    // WhatsApp is pushing back → stop immediately, keep this recipient pending.
    Object.assign(set, {
      status: 'paused',
      pauseReason: `WhatsApp returned a rate-limit/restriction error ("${outcome.error}"). Paused to protect your number — wait several hours before resuming.`,
    });
  } else if (outcome.connectionError) {
    const fails = (camp.consecutiveFailures || 0) + 1;
    set.consecutiveFailures = fails;
    if (fails >= SAFETY.maxConsecutiveFailures) {
      Object.assign(set, { status: 'paused', pauseReason: `Connection failed ${fails} times in a row: ${outcome.error}` });
    } else {
      Object.assign(set, { nextSendAt: new Date(now.getTime() + 30_000), waitReason: `Connection issue — retrying in 30s (${outcome.error})` });
    }
  } else {
    const fails = (camp.consecutiveFailures || 0) + 1;
    set[`recipients.${idx}.status`] = 'failed';
    set[`recipients.${idx}.error`] = outcome.error || 'Failed';
    inc.failed = (inc.failed || 0) + 1;
    idx++;
    set.consecutiveFailures = fails;
    if (fails >= SAFETY.maxConsecutiveFailures) {
      Object.assign(set, { status: 'paused', pauseReason: `${fails} messages failed in a row — paused to protect your WhatsApp number. Last error: ${outcome.error}` });
    } else {
      Object.assign(set, { nextSendAt: new Date(now.getTime() + rand(camp.minDelaySec, camp.maxDelaySec) * 1000), isBatchCooldown: false, waitReason: null });
    }
    if (idx >= recipients.length && set.status !== 'paused') return finish();
  }

  set.cursor = idx;
  await col.updateOne({ _id: camp._id }, { $set: set, ...(Object.keys(inc).length ? { $inc: inc } : {}) });
}
