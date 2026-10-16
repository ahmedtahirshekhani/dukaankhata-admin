import QRCode from 'qrcode';
import { ObjectId } from 'mongodb';
import type { WASocket } from '@whiskeysockets/baileys';
import { formatWhatsAppPhone, replaceTemplateVariables, parseSpintax, isRealPersonName, RecipientUser } from './phone-utils';
import { getCollection, COLLECTIONS } from '@/lib/db/mongodb';
import { useMongoAuthState, hasStoredCreds, clearStoredAuth } from './mongo-auth-state';

export { formatWhatsAppPhone, replaceTemplateVariables, parseSpintax, isRealPersonName, type RecipientUser };

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Serverless-safe WhatsApp (Baileys) manager
 * ─────────────────────────────────────────────────────────────────────────────
 * Works the same way as the main DukaanKhata app:
 *  • Auth creds + signal keys live in MongoDB (`whatsapp_auth`), not on disk.
 *  • Connection status / QR live in MongoDB (`whatsapp_sessions`), so every
 *    Vercel instance sees the same state (no in-memory globals as truth).
 *  • Sockets are opened on demand. On Vercel they're closed right after each
 *    operation (a frozen lambda can't keep a WebSocket alive anyway); locally
 *    they're kept warm for fast sends.
 *  • No "always online" presence pings — linked devices that are permanently
 *    online and blasting messages look like bots.
 */

export type WhatsAppStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';

export interface WhatsAppSessionState {
  status: WhatsAppStatus;
  qrCodeUrl: string | null;
  phoneNumber: string | null;
  userName: string | null;
  error: string | null;
  connectedAt: string | null;
}

export interface AccountHealth {
  checkedAt: string | null;
  /** WhatsApp's own new-chat message cap (null when WhatsApp doesn't report one for this account). */
  newChatQuotaTotal: number | null;
  newChatQuotaUsed: number | null;
  newChatQuotaResetsAt: string | null;
  /** WhatsApp "reachout timelock" = account is temporarily restricted from messaging new people. */
  reachoutLocked: boolean;
  reachoutLockEndsAt: string | null;
  reachoutLockType: string | null;
}

export interface SendResult {
  phone: string;
  name: string;
  success: boolean;
  error?: string;
  sentAt?: string;
}

export interface SendOutcome {
  success: boolean;
  messageId?: string;
  error?: string;
  /** Number isn't registered on WhatsApp — we never attempted delivery. */
  notOnWhatsApp?: boolean;
  /** Error that suggests WhatsApp is throttling / restricting this account. Campaigns must stop. */
  accountRisk?: boolean;
  /** Socket couldn't be opened / dropped. */
  connectionError?: boolean;
}

export const SESSION_ID = 'admin';
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const OPEN_TIMEOUT_MS = 25_000;
const HEALTH_CHECK_INTERVAL_MS = 10 * 60 * 1000;

const silentLogger: any = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
};

interface LiveSocket {
  sock: WASocket;
  flush: () => Promise<void>;
  lastUsedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var _waLive: LiveSocket | undefined;
  // eslint-disable-next-line no-var
  var _waOpening: Promise<LiveSocket> | undefined;
  // eslint-disable-next-line no-var
  var _waVersion: [number, number, number] | null | undefined;
}

export class WhatsAppNotConnectedError extends Error {}

// ─── Session document helpers ────────────────────────────────────────────────

async function sessionsCol() {
  return getCollection(COLLECTIONS.WHATSAPP_SESSIONS);
}

async function updateSession(patch: Record<string, any>) {
  const col = await sessionsCol();
  await col.updateOne(
    { _id: SESSION_ID as any },
    { $set: { ...patch, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
}

async function markDisconnected(error: string | null) {
  await updateSession({
    status: 'disconnected',
    qrCodeUrl: null,
    qrExpiresAt: null,
    phoneNumber: null,
    userName: null,
    connectedAt: null,
    error,
  });
}

async function markConnected(sock: WASocket) {
  const userJid = sock.user?.id || '';
  const phone = userJid.split(':')[0].split('@')[0].replace(/\D/g, '');
  const col = await sessionsCol();
  const existing = await col.findOne({ _id: SESSION_ID as any });
  await updateSession({
    status: 'connected',
    qrCodeUrl: null,
    qrExpiresAt: null,
    phoneNumber: phone || existing?.phoneNumber || null,
    userName: sock.user?.name || existing?.userName || 'Admin',
    connectedAt: existing?.status === 'connected' && existing?.connectedAt ? existing.connectedAt : new Date(),
    lastSeenAt: new Date(),
    error: null,
  });
}

export async function getWhatsAppStatus(): Promise<{ state: WhatsAppSessionState; health: AccountHealth | null; lastSeenAt: string | null }> {
  const col = await sessionsCol();
  const doc: any = await col.findOne({ _id: SESSION_ID as any });

  let status: WhatsAppStatus = (doc?.status as WhatsAppStatus) || 'disconnected';
  let error: string | null = doc?.error || null;
  let qrCodeUrl: string | null = doc?.qrCodeUrl || null;

  // A QR is only valid while the lambda that generated it is still alive.
  if (status === 'qr_ready' && (!doc?.qrExpiresAt || new Date(doc.qrExpiresAt).getTime() < Date.now())) {
    status = 'disconnected';
    qrCodeUrl = null;
    error = 'QR code expired. Click "Connect WhatsApp QR" to generate a new one.';
  }
  // A "connecting" state older than 90s means the function that set it died.
  if (status === 'connecting' && doc?.updatedAt && Date.now() - new Date(doc.updatedAt).getTime() > 90_000) {
    status = (await hasStoredCreds(SESSION_ID)) ? 'connected' : 'disconnected';
  }

  return {
    state: {
      status,
      qrCodeUrl,
      phoneNumber: doc?.phoneNumber || null,
      userName: doc?.userName || null,
      error,
      connectedAt: doc?.connectedAt ? new Date(doc.connectedAt).toISOString() : null,
    },
    health: doc?.health || null,
    lastSeenAt: doc?.lastSeenAt ? new Date(doc.lastSeenAt).toISOString() : null,
  };
}

// ─── Socket creation ─────────────────────────────────────────────────────────

async function getBaileysVersion(baileys: typeof import('@whiskeysockets/baileys')) {
  if (global._waVersion !== undefined) return global._waVersion || undefined;
  try {
    const { version } = await Promise.race([
      baileys.fetchLatestBaileysVersion(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
    ]);
    global._waVersion = version as [number, number, number];
  } catch {
    global._waVersion = null; // fall back to Baileys' bundled version
  }
  return global._waVersion || undefined;
}

async function createSocket() {
  const baileys = await import('@whiskeysockets/baileys');
  const { state, saveCreds, flush } = await useMongoAuthState(SESSION_ID, baileys);
  const version = await getBaileysVersion(baileys);

  const sock = baileys.makeWASocket({
    ...(version ? { version } : {}),
    auth: {
      creds: state.creds,
      keys: baileys.makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    logger: silentLogger,
    printQRInTerminal: false,
    browser: baileys.Browsers.ubuntu('Chrome'),
    // Behave like a quiet linked device: don't appear online, don't pull history.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 20_000,
    defaultQueryTimeoutMs: 20_000,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 500,
    getMessage: async () => undefined,
  });

  sock.ev.on('creds.update', saveCreds);
  return { sock, flush, baileys, registered: Boolean(state.creds.me?.id) };
}

type OpenResult =
  | { kind: 'open' }
  | { kind: 'close'; code?: number; message: string }
  | { kind: 'qr'; qr: string }
  | { kind: 'timeout' };

function waitForConnection(sock: WASocket, timeoutMs: number, onQr?: (qr: string) => void): Promise<OpenResult> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: OpenResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.ev.off('connection.update', listener);
      resolve(r);
    };
    const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs);
    const listener = (update: any) => {
      if (update.qr) {
        if (onQr) onQr(update.qr);
        else finish({ kind: 'qr', qr: update.qr });
      }
      if (update.connection === 'open') finish({ kind: 'open' });
      if (update.connection === 'close') {
        const err: any = update.lastDisconnect?.error;
        finish({
          kind: 'close',
          code: err?.output?.statusCode,
          message: err?.output?.payload?.message || err?.message || 'Connection closed',
        });
      }
    };
    sock.ev.on('connection.update', listener);
  });
}

function safeEnd(sock: WASocket | undefined) {
  if (!sock) return;
  try {
    sock.ev.removeAllListeners('connection.update');
    sock.end(undefined);
  } catch {
    // ignore
  }
}

/**
 * Open (or reuse) an authenticated socket. Never shows a QR — if creds are
 * missing/invalid the session is marked disconnected and an error is thrown.
 */
async function getLiveSocket(timeoutMs = OPEN_TIMEOUT_MS): Promise<LiveSocket> {
  const cur = global._waLive;
  const wsOpen = (cur?.sock as any)?.ws?.isOpen;
  // On serverless a socket from a previous (frozen) invocation is likely dead.
  if (cur && wsOpen && cur.sock.user && (!IS_SERVERLESS || Date.now() - cur.lastUsedAt < 10_000)) {
    return cur;
  }
  if (cur) {
    safeEnd(cur.sock);
    global._waLive = undefined;
  }
  if (global._waOpening) return global._waOpening;

  global._waOpening = (async () => {
    if (!(await hasStoredCreds(SESSION_ID))) {
      await markDisconnected('WhatsApp is not linked. Scan the QR code first.');
      throw new WhatsAppNotConnectedError('WhatsApp is not connected. Please scan the QR code first.');
    }

    const { DisconnectReason } = await import('@whiskeysockets/baileys');

    for (let attempt = 0; attempt < 2; attempt++) {
      const { sock, flush } = await createSocket();
      const result = await waitForConnection(sock, timeoutMs);

      if (result.kind === 'open') {
        const live: LiveSocket = { sock, flush, lastUsedAt: Date.now() };
        global._waLive = live;
        sock.ev.on('connection.update', async (u: any) => {
          if (u.connection !== 'close') return;
          if (global._waLive?.sock === sock) global._waLive = undefined;
          const code = (u.lastDisconnect?.error as any)?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) {
            await clearStoredAuth(SESSION_ID).catch(() => {});
            await markDisconnected('WhatsApp logged this device out. Please scan the QR code again.').catch(() => {});
          } else if (code === DisconnectReason.connectionReplaced) {
            await updateSession({ error: 'Session was opened elsewhere (another server/dev instance). Avoid running local + Vercel at the same time.' }).catch(() => {});
          }
        });
        await markConnected(sock);
        return live;
      }

      safeEnd(sock);
      await flush();

      if (result.kind === 'close' && result.code === DisconnectReason.restartRequired) {
        continue; // normal after pairing / stream restart — reconnect once
      }
      if (result.kind === 'qr' || (result.kind === 'close' && (result.code === DisconnectReason.loggedOut || result.code === 401))) {
        await clearStoredAuth(SESSION_ID);
        await markDisconnected('WhatsApp session expired or was logged out from the phone. Please scan the QR code again.');
        throw new WhatsAppNotConnectedError('WhatsApp session expired. Please scan the QR code again.');
      }
      if (result.kind === 'close' && result.code === DisconnectReason.forbidden) {
        await updateSession({ status: 'error', error: 'WhatsApp refused the connection (403). The number may be restricted or banned.' });
        throw new WhatsAppNotConnectedError('WhatsApp refused the connection (403). The number may be restricted.');
      }
      throw new WhatsAppNotConnectedError(
        result.kind === 'timeout' ? 'Timed out connecting to WhatsApp. Try again.' : `WhatsApp connection failed: ${result.message}`
      );
    }
    throw new WhatsAppNotConnectedError('Could not connect to WhatsApp.');
  })();

  try {
    return await global._waOpening;
  } finally {
    global._waOpening = undefined;
  }
}

async function releaseSocket(live: LiveSocket) {
  live.lastUsedAt = Date.now();
  await live.flush().catch(() => {});
  await updateSession({ lastSeenAt: new Date() }).catch(() => {});
  if (IS_SERVERLESS) {
    // Close cleanly instead of letting the frozen lambda time the socket out.
    safeEnd(live.sock);
    if (global._waLive === live) global._waLive = undefined;
  }
}

/** Run `fn` with a connected socket, then flush auth writes and release. */
export async function withWhatsAppSocket<T>(fn: (sock: WASocket) => Promise<T>, timeoutMs?: number): Promise<T> {
  const live = await getLiveSocket(timeoutMs);
  try {
    return await fn(live.sock);
  } finally {
    await releaseSocket(live);
  }
}

// ─── Connect (QR pairing) / Disconnect ───────────────────────────────────────

/**
 * Connect WhatsApp. If already linked, reconnects silently. Otherwise holds
 * the function open for up to `holdMs` streaming fresh QR codes into MongoDB
 * (the UI polls /status to display them). Returns `needsRetry` when the hold
 * window elapsed without a scan — the UI simply calls connect again.
 */
export async function connectWhatsApp(holdMs = 45_000): Promise<{ state: WhatsAppSessionState; needsRetry: boolean }> {
  if (await hasStoredCreds(SESSION_ID)) {
    try {
      await withWhatsAppSocket(async () => undefined);
    } catch (err: any) {
      if (!(await hasStoredCreds(SESSION_ID))) {
        // creds were wiped (logged out) → fall through to QR pairing below
      } else {
        await updateSession({ error: err?.message || 'Failed to reconnect' });
        return { state: (await getWhatsAppStatus()).state, needsRetry: false };
      }
    }
    if (await hasStoredCreds(SESSION_ID)) {
      return { state: (await getWhatsAppStatus()).state, needsRetry: false };
    }
  }

  const { DisconnectReason } = await import('@whiskeysockets/baileys');
  const deadline = Date.now() + holdMs;
  await updateSession({ status: 'connecting', error: null, qrCodeUrl: null });

  for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt++) {
    const { sock, flush } = await createSocket();
    const pendingQrWrites: Promise<unknown>[] = [];

    const result = await waitForConnection(sock, Math.max(1000, deadline - Date.now()), (qr) => {
      pendingQrWrites.push(
        QRCode.toDataURL(qr, { margin: 2, scale: 6 }).then((url) =>
          updateSession({
            status: 'qr_ready',
            qrCodeUrl: url,
            // QR stays valid only while this function holds the socket.
            qrExpiresAt: new Date(deadline + 3000),
            error: null,
          })
        )
      );
    });
    await Promise.allSettled(pendingQrWrites);

    if (result.kind === 'open') {
      await markConnected(sock);
      const live: LiveSocket = { sock, flush, lastUsedAt: Date.now() };
      global._waLive = live;
      await releaseSocket(live);
      return { state: (await getWhatsAppStatus()).state, needsRetry: false };
    }

    safeEnd(sock);
    await flush();

    if (result.kind === 'close' && result.code === DisconnectReason.restartRequired) {
      // Phone just scanned the QR — WhatsApp asks for a restart, creds are now registered.
      continue;
    }
    if (result.kind === 'timeout') {
      await updateSession({ qrExpiresAt: new Date(Date.now() + 8000) });
      return { state: (await getWhatsAppStatus()).state, needsRetry: true };
    }
    if (result.kind === 'close' && result.code === DisconnectReason.loggedOut) {
      await clearStoredAuth(SESSION_ID);
      continue;
    }
    await updateSession({ status: 'error', qrCodeUrl: null, error: `WhatsApp connection closed: ${'message' in result ? result.message : 'unknown'}` });
    return { state: (await getWhatsAppStatus()).state, needsRetry: false };
  }

  // Ran out of attempts/time — if pairing completed, try one final silent connect.
  if (await hasStoredCreds(SESSION_ID)) {
    try {
      await withWhatsAppSocket(async () => undefined);
    } catch {
      // status already updated by getLiveSocket
    }
    return { state: (await getWhatsAppStatus()).state, needsRetry: false };
  }
  return { state: (await getWhatsAppStatus()).state, needsRetry: true };
}

/** Explicit logout: unlinks the device on the phone and wipes stored auth. */
export async function disconnectWhatsAppSession(): Promise<WhatsAppSessionState> {
  try {
    if (await hasStoredCreds(SESSION_ID)) {
      const live = await getLiveSocket(15_000).catch(() => null);
      if (live) {
        await live.sock.logout().catch(() => {});
        safeEnd(live.sock);
        global._waLive = undefined;
      }
    }
  } catch (error) {
    console.error('[WA] Error during logout:', error);
  }
  await clearStoredAuth(SESSION_ID);
  await markDisconnected(null);
  return (await getWhatsAppStatus()).state;
}

// ─── Account health (WhatsApp's own restriction signals) ────────────────────

function toDate(ts?: string | number | Date | null): Date | null {
  if (ts === undefined || ts === null || ts === '') return null;
  if (ts instanceof Date) return ts;
  const n = Number(ts);
  if (!Number.isFinite(n)) {
    const d = new Date(String(ts));
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(n < 1e12 ? n * 1000 : n);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null);
}

/**
 * Ask WhatsApp whether this account is under a "reachout timelock" (temporary
 * restriction on messaging new contacts) and how much of its new-chat quota is
 * used. Cached in the session doc for 10 minutes.
 */
export async function refreshAccountHealth(sock: WASocket, force = false): Promise<AccountHealth> {
  const col = await sessionsCol();
  const doc: any = await col.findOne({ _id: SESSION_ID as any }, { projection: { health: 1 } });
  const cached: AccountHealth | undefined = doc?.health;
  if (!force && cached?.checkedAt && Date.now() - new Date(cached.checkedAt).getTime() < HEALTH_CHECK_INTERVAL_MS) {
    return cached;
  }

  const anySock = sock as any;
  const [lock, cap]: [any, any] = await Promise.all([
    typeof anySock.fetchAccountReachoutTimelock === 'function' ? withTimeout<any>(anySock.fetchAccountReachoutTimelock(), 6000) : null,
    typeof anySock.fetchNewChatMessageCap === 'function' ? withTimeout<any>(anySock.fetchNewChatMessageCap(), 6000) : null,
  ]);

  const lockEnds = toDate(lock?.timeEnforcementEnds);
  const health: AccountHealth = {
    checkedAt: new Date().toISOString(),
    reachoutLocked: Boolean(lock?.isActive) && (!lockEnds || lockEnds.getTime() > Date.now()),
    reachoutLockEndsAt: lockEnds ? lockEnds.toISOString() : null,
    reachoutLockType: lock?.enforcementType || null,
    newChatQuotaTotal: typeof cap?.total_quota === 'number' ? cap.total_quota : null,
    newChatQuotaUsed: typeof cap?.used_quota === 'number' ? cap.used_quota : null,
    newChatQuotaResetsAt: toDate(cap?.cycle_end_timestamp)?.toISOString() || null,
  };
  await updateSession({ health });
  return health;
}

// ─── Sending ─────────────────────────────────────────────────────────────────

function classifySendError(error: any): SendOutcome {
  const code = error?.output?.statusCode ?? error?.data?.code;
  const msg = String(error?.message || error?.output?.payload?.message || 'Failed to send message');
  const lower = msg.toLowerCase();
  const accountRisk =
    code === 403 || code === 429 || code === 463 || code === 479 ||
    lower.includes('rate-overlimit') || lower.includes('rate limit') || lower.includes('too many') ||
    lower.includes('forbidden') || lower.includes('banned') || lower.includes('blocked') || lower.includes('not-authorized');
  const connectionError =
    code === 428 || code === 408 || lower.includes('connection closed') || lower.includes('timed out') || lower.includes('connection lost');
  return { success: false, error: msg, accountRisk, connectionError };
}

/**
 * Send one text message on an already-open socket with human-like behaviour:
 * verifies the number is on WhatsApp first (messaging non-WA numbers is a spam
 * signal), shows "typing…" for a duration proportional to message length.
 */
export async function sendTextOnSocket(
  sock: WASocket,
  phone: string,
  text: string,
  opts: { simulateTyping?: boolean; verifyOnWhatsApp?: boolean } = {}
): Promise<SendOutcome> {
  const cleanPhone = formatWhatsAppPhone(phone);
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: 'Invalid or missing phone number.' };
  }

  try {
    let jid = `${cleanPhone}@s.whatsapp.net`;

    if (opts.verifyOnWhatsApp !== false) {
      const lookup = await withTimeout(sock.onWhatsApp(cleanPhone), 10_000);
      const hit = lookup?.[0];
      if (lookup && !hit?.exists) {
        return { success: false, notOnWhatsApp: true, error: 'Number is not on WhatsApp' };
      }
      if (hit?.jid) jid = hit.jid;
    }

    if (opts.simulateTyping !== false) {
      try {
        await sock.presenceSubscribe(jid).catch(() => {});
        await sock.sendPresenceUpdate('composing', jid);
        // ~35ms per character, clamped to 2–7s, plus jitter
        const typingMs = Math.min(7000, Math.max(2000, text.length * 35)) + Math.floor(Math.random() * 1200);
        await new Promise((r) => setTimeout(r, typingMs));
        await sock.sendPresenceUpdate('paused', jid);
      } catch {
        // presence is best-effort
      }
    }

    const result = await sock.sendMessage(jid, { text });
    return { success: true, messageId: result?.key?.id || undefined };
  } catch (error: any) {
    console.error(`[WA] Send to ${cleanPhone} failed:`, error?.message);
    return classifySendError(error);
  }
}

/** Convenience wrapper: open socket → send one message → release. */
export async function sendSingleWhatsAppMessage(
  phone: string,
  messageText: string,
  opts?: { simulateTyping?: boolean; verifyOnWhatsApp?: boolean }
): Promise<SendOutcome> {
  try {
    return await withWhatsAppSocket((sock) => sendTextOnSocket(sock, phone, messageText, opts));
  } catch (err: any) {
    return { success: false, error: err?.message || 'WhatsApp is not connected.', connectionError: true };
  }
}

// ─── Lead tracking ───────────────────────────────────────────────────────────

/**
 * Update market_leads collection to record WhatsApp delivery status, timestamp, message, and increment send count.
 */
export async function recordMarketLeadWhatsAppStatus(
  db: any,
  params: {
    cleanPhone: string;
    rawPhone?: string;
    leadId?: string | ObjectId | null;
    success: boolean;
    message?: string;
    variantIndex?: number;
    error?: string | null;
    sentAt?: Date;
  }
): Promise<void> {
  try {
    const { cleanPhone, rawPhone, leadId, success, message, variantIndex, error, sentAt = new Date() } = params;
    const filterConditions: any[] = [];

    if (cleanPhone) {
      filterConditions.push({ cleanNumber: cleanPhone });
      filterConditions.push({ number: cleanPhone });
    }
    if (rawPhone && rawPhone !== cleanPhone) {
      filterConditions.push({ number: rawPhone });
    }
    if (leadId) {
      const idStr = leadId.toString();
      if (ObjectId.isValid(idStr)) {
        filterConditions.push({ _id: new ObjectId(idStr) });
      }
    }

    if (filterConditions.length === 0) return;

    if (success) {
      await db.collection(COLLECTIONS.MARKET_LEADS).updateMany(
        { $or: filterConditions },
        {
          $set: {
            whatsappSent: true,
            whatsappSentAt: sentAt,
            lastWhatsappStatus: 'sent',
            lastWhatsappMessage: message || '',
            lastWhatsappVariant: variantIndex || 1,
            lastWhatsappError: null,
            updatedAt: sentAt,
          },
          $inc: {
            whatsappSentCount: 1,
          },
        }
      );
    } else {
      await db.collection(COLLECTIONS.MARKET_LEADS).updateMany(
        { $or: filterConditions },
        {
          $set: {
            lastWhatsappStatus: 'failed',
            lastWhatsappError: error || 'Failed to deliver message',
            updatedAt: sentAt,
          },
        }
      );
    }
  } catch (err) {
    console.error('Error recording market lead whatsapp status:', err);
  }
}
