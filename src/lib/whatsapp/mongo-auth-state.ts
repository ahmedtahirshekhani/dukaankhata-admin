import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { getCollection, COLLECTIONS } from '@/lib/db/mongodb';

/**
 * MongoDB-backed Baileys auth state.
 *
 * Replaces the local `.whatsapp-auth` folder (useMultiFileAuthState) so that the
 * WhatsApp linked-device credentials survive Vercel's read-only / ephemeral
 * filesystem, redeploys and cold starts. Every serverless instance reads the
 * same creds + signal keys from MongoDB.
 *
 * Document shape (collection `whatsapp_auth`):
 *   { sessionId: 'admin', keyId: 'creds' | '<type>-<id>', data: '<BufferJSON string>', updatedAt }
 */

type BaileysModule = typeof import('@whiskeysockets/baileys');

let indexEnsured = false;

async function authCollection() {
  const col = await getCollection(COLLECTIONS.WHATSAPP_AUTH);
  if (!indexEnsured) {
    indexEnsured = true;
    col.createIndex({ sessionId: 1, keyId: 1 }, { unique: true }).catch(() => {});
  }
  return col;
}

export async function hasStoredCreds(sessionId: string): Promise<boolean> {
  const col = await authCollection();
  const doc = await col.findOne({ sessionId, keyId: 'creds' }, { projection: { data: 1 } });
  if (doc?.data) {
    try {
      const parsed = JSON.parse(doc.data);
      if (parsed?.me?.id) return true;
    } catch {
      // invalid creds
    }
  }

  // Try auto-migrating local .whatsapp-auth folder if running on node with local files
  await migrateLocalAuthFolderIfPresent(sessionId);
  const recheck = await col.findOne({ sessionId, keyId: 'creds' }, { projection: { data: 1 } });
  if (!recheck?.data) return false;
  try {
    const parsed = JSON.parse(recheck.data);
    return Boolean(parsed?.me?.id);
  } catch {
    return false;
  }
}

export async function migrateLocalAuthFolderIfPresent(sessionId: string): Promise<boolean> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const folder = path.join(process.cwd(), '.whatsapp-auth');
    if (!fs.existsSync(folder)) return false;

    const credsFile = path.join(folder, 'creds.json');
    if (!fs.existsSync(credsFile)) return false;

    const col = await authCollection();
    const existing = await col.findOne({ sessionId, keyId: 'creds' });
    if (existing?.data) return false; // already populated

    const files = fs.readdirSync(folder);
    const ops: any[] = [];
    const now = new Date();

    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const keyId = f.replace(/\.json$/, '');
      const filePath = [folder, f].join(path.sep);
      const content = fs.readFileSync(filePath, 'utf-8');
      ops.push({
        updateOne: {
          filter: { sessionId, keyId },
          update: { $set: { sessionId, keyId, data: content, updatedAt: now } },
          upsert: true,
        },
      });
    }

    if (ops.length > 0) {
      await col.bulkWrite(ops, { ordered: false });
      console.log(`[WA Auth] Successfully migrated ${ops.length} auth keys from local .whatsapp-auth to MongoDB!`);
      return true;
    }
  } catch (err) {
    console.warn('[WA Auth] Auto-migration from local folder skipped/failed:', err);
  }
  return false;
}

export async function clearStoredAuth(sessionId: string): Promise<void> {
  const col = await authCollection();
  await col.deleteMany({ sessionId });
}

export async function useMongoAuthState(
  sessionId: string,
  baileys: BaileysModule
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  /** Await all in-flight writes — call before a serverless function returns. */
  flush: () => Promise<void>;
}> {
  const { BufferJSON, initAuthCreds } = baileys;
  const col = await authCollection();
  const pending = new Set<Promise<unknown>>();

  const track = <T>(p: Promise<T>): Promise<T> => {
    pending.add(p);
    p.finally(() => pending.delete(p)).catch(() => {});
    return p;
  };

  const credsDoc = await col.findOne({ sessionId, keyId: 'creds' });
  let creds: AuthenticationCreds;
  try {
    creds = credsDoc?.data ? JSON.parse(credsDoc.data, BufferJSON.reviver) : initAuthCreds();
  } catch {
    creds = initAuthCreds();
  }

  const saveCreds = () =>
    track(
      col
        .updateOne(
          { sessionId, keyId: 'creds' },
          { $set: { data: JSON.stringify(creds, BufferJSON.replacer), updatedAt: new Date() } },
          { upsert: true }
        )
        .then(() => undefined)
        .catch((err) => console.error('[WA Auth] Failed to save creds:', err))
    );

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        if (ids.length === 0) return result;
        const docs = await col
          .find({ sessionId, keyId: { $in: ids.map((id) => `${type}-${id}`) } })
          .toArray();
        for (const doc of docs) {
          try {
            let value = JSON.parse(doc.data, BufferJSON.reviver);
            if (type === 'app-state-sync-key' && value) {
              value = baileys.proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            result[(doc.keyId as string).slice(type.length + 1)] = value;
          } catch {
            // ignore corrupt key
          }
        }
        return result;
      },
      set: async (data: any) => {
        const ops: any[] = [];
        for (const category of Object.keys(data)) {
          const entries = data[category] || {};
          for (const id of Object.keys(entries)) {
            const keyId = `${category}-${id}`;
            const value = entries[id];
            if (value) {
              ops.push({
                updateOne: {
                  filter: { sessionId, keyId },
                  update: { $set: { data: JSON.stringify(value, BufferJSON.replacer), updatedAt: new Date() } },
                  upsert: true,
                },
              });
            } else {
              ops.push({ deleteOne: { filter: { sessionId, keyId } } });
            }
          }
        }
        if (ops.length > 0) {
          await track(col.bulkWrite(ops, { ordered: false }).catch((err) => {
            console.error('[WA Auth] Failed to write signal keys:', err);
          }));
        }
      },
    },
  };

  return {
    state,
    saveCreds,
    flush: async () => {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
  };
}
