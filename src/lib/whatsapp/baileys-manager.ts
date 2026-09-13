import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';

export type WhatsAppStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';

export interface WhatsAppSessionState {
  status: WhatsAppStatus;
  qrCodeUrl: string | null;
  phoneNumber: string | null;
  userName: string | null;
  error: string | null;
  connectedAt: string | null;
}

export interface RecipientUser {
  id?: string;
  _id?: string;
  name: string;
  phone?: string;
  shopName?: string;
  email?: string;
  plan?: string;
  expiresAt?: string;
  status?: string;
  monthlyRevenue?: number;
  [key: string]: any;
}

export interface SendResult {
  phone: string;
  name: string;
  success: boolean;
  error?: string;
  sentAt?: string;
}

const AUTH_FOLDER = path.join(process.cwd(), '.whatsapp-auth');

// Global singleton state for Next.js dev server & production server
declare global {
  // eslint-disable-next-line no-var
  var _waState: WhatsAppSessionState | undefined;
  // eslint-disable-next-line no-var
  var _waSocket: any | undefined;
  // eslint-disable-next-line no-var
  var _waInitializing: boolean | undefined;
  // eslint-disable-next-line no-var
  var _waLogs: SendResult[] | undefined;
}

if (!global._waState) {
  global._waState = {
    status: 'disconnected',
    qrCodeUrl: null,
    phoneNumber: null,
    userName: null,
    error: null,
    connectedAt: null,
  };
}

if (!global._waLogs) {
  global._waLogs = [];
}

const silentLogger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};

export function formatWhatsAppPhone(phone: string): string {
  let clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('0')) clean = `92${clean.slice(1)}`;
  if (clean.length === 10) clean = `92${clean}`;
  return clean;
}

export function replaceTemplateVariables(template: string, user: RecipientUser): string {
  let result = template || '';
  const vars: Record<string, string> = {
    name: user.name || 'Valued User',
    shopName: user.shopName || user.resolvedShopName || 'Your Shop',
    email: user.email || '',
    phone: user.phone || '',
    plan: user.subscription?.plan || user.plan || 'Free',
    expiresAt: user.subscription?.expiresAt || user.expiresAt || 'N/A',
    status: user.status || 'Active',
    monthlyRevenue: user.monthlyRevenue !== undefined ? `Rs. ${user.monthlyRevenue}` : 'Rs. 0',
  };

  Object.entries(vars).forEach(([key, val]) => {
    const reg = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(reg, val);
  });

  return result;
}

export function getWhatsAppStatus(): { state: WhatsAppSessionState; logs: SendResult[] } {
  return {
    state: global._waState!,
    logs: global._waLogs || [],
  };
}

export async function initWhatsAppSession(forceRestart = false): Promise<WhatsAppSessionState> {
  if (global._waInitializing && !forceRestart) {
    return global._waState!;
  }

  if (global._waState?.status === 'connected' && global._waSocket && !forceRestart) {
    return global._waState;
  }

  global._waInitializing = true;
  global._waState = {
    status: 'connecting',
    qrCodeUrl: null,
    phoneNumber: global._waState?.phoneNumber || null,
    userName: global._waState?.userName || null,
    error: null,
    connectedAt: global._waState?.connectedAt || null,
  };

  try {
    if (!fs.existsSync(AUTH_FOLDER)) {
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    const { makeWASocket, DisconnectReason, useMultiFileAuthState } = await import('@whiskeysockets/baileys');
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    if (global._waSocket) {
      try {
        global._waSocket.ev.removeAllListeners('connection.update');
        global._waSocket.ev.removeAllListeners('creds.update');
        global._waSocket.end(undefined);
      } catch (e) {
        // ignore
      }
    }

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: silentLogger as any,
      browser: ['DukaanKhata Admin', 'Chrome', '1.0.0'],
    });

    global._waSocket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          global._waState = {
            status: 'qr_ready',
            qrCodeUrl: qrDataUrl,
            phoneNumber: null,
            userName: null,
            error: null,
            connectedAt: null,
          };
        } catch (qrErr: any) {
          console.error('QR code generation error:', qrErr);
        }
      }

      if (connection === 'open') {
        const userJid = sock.user?.id || '';
        const phone = userJid.split(':')[0] || userJid.split('@')[0];
        const name = sock.user?.name || 'Admin';

        global._waState = {
          status: 'connected',
          qrCodeUrl: null,
          phoneNumber: phone,
          userName: name,
          error: null,
          connectedAt: new Date().toISOString(),
        };
        global._waInitializing = false;
      } else if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (statusCode === DisconnectReason.loggedOut) {
          try {
            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
          } catch (err) {
            console.error('Error clearing auth folder:', err);
          }

          global._waState = {
            status: 'disconnected',
            qrCodeUrl: null,
            phoneNumber: null,
            userName: null,
            error: 'Session logged out. Please connect again.',
            connectedAt: null,
          };
          global._waSocket = null;
          global._waInitializing = false;
        } else if (shouldReconnect) {
          global._waInitializing = false;
          initWhatsAppSession();
        } else {
          global._waState = {
            status: 'disconnected',
            qrCodeUrl: null,
            phoneNumber: null,
            userName: null,
            error: 'Connection closed.',
            connectedAt: null,
          };
          global._waSocket = null;
          global._waInitializing = false;
        }
      }
    });

    return global._waState;
  } catch (error: any) {
    console.error('Failed to initialize Baileys WhatsApp socket:', error);
    global._waState = {
      status: 'error',
      qrCodeUrl: null,
      phoneNumber: null,
      userName: null,
      error: error.message || 'Failed to initialize WhatsApp session',
      connectedAt: null,
    };
    global._waInitializing = false;
    return global._waState;
  }
}

export async function disconnectWhatsAppSession(): Promise<WhatsAppSessionState> {
  try {
    if (global._waSocket) {
      try {
        await global._waSocket.logout();
      } catch (e) {
        // ignore logout errors
      }
      global._waSocket = null;
    }

    if (fs.existsSync(AUTH_FOLDER)) {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    }

    global._waState = {
      status: 'disconnected',
      qrCodeUrl: null,
      phoneNumber: null,
      userName: null,
      error: null,
      connectedAt: null,
    };
  } catch (error: any) {
    console.error('Error disconnecting WhatsApp:', error);
  }

  return global._waState!;
}

export async function sendSingleWhatsAppMessage(
  phone: string,
  messageText: string
): Promise<{ success: boolean; error?: string }> {
  if (global._waState?.status !== 'connected' || !global._waSocket) {
    return {
      success: false,
      error: 'WhatsApp is not connected. Please scan the QR code first.',
    };
  }

  const cleanPhone = formatWhatsAppPhone(phone);
  if (!cleanPhone || cleanPhone.length < 10) {
    return {
      success: false,
      error: 'Invalid or missing phone number.',
    };
  }

  const jid = `${cleanPhone}@s.whatsapp.net`;

  try {
    await global._waSocket.sendMessage(jid, { text: messageText });
    return { success: true };
  } catch (error: any) {
    console.error(`Error sending WhatsApp to ${cleanPhone}:`, error);
    return {
      success: false,
      error: error.message || 'Failed to send message via WhatsApp socket.',
    };
  }
}

export async function sendBulkWhatsAppMessages(
  recipients: RecipientUser[],
  templateText: string,
  delayMs = 1500
): Promise<{ total: number; sentCount: number; failCount: number; results: SendResult[] }> {
  const results: SendResult[] = [];
  let sentCount = 0;
  let failCount = 0;

  for (let i = 0; i < recipients.length; i++) {
    const user = recipients[i];
    const rawPhone = user.phone || user.whatsapp || (user as any).mobile || '';
    const cleanPhone = formatWhatsAppPhone(rawPhone);
    const msg = replaceTemplateVariables(templateText, user);

    if (!cleanPhone) {
      const failedRes: SendResult = {
        phone: rawPhone || 'N/A',
        name: user.name || 'Unknown',
        success: false,
        error: 'No valid phone number',
        sentAt: new Date().toISOString(),
      };
      results.push(failedRes);
      failCount++;
      continue;
    }

    const sendRes = await sendSingleWhatsAppMessage(cleanPhone, msg);
    const logItem: SendResult = {
      phone: cleanPhone,
      name: user.name || 'User',
      success: sendRes.success,
      error: sendRes.error,
      sentAt: new Date().toISOString(),
    };

    results.push(logItem);
    if (global._waLogs) {
      global._waLogs.unshift(logItem);
      if (global._waLogs.length > 200) global._waLogs.pop();
    }

    if (sendRes.success) {
      sentCount++;
    } else {
      failCount++;
    }

    // Delay between bulk messages to prevent spam detection
    if (i < recipients.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: recipients.length,
    sentCount,
    failCount,
    results,
  };
}
