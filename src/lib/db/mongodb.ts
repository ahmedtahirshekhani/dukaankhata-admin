import { MongoClient, MongoClientOptions, Db, Collection, ObjectId } from 'mongodb';

const MONGODB_URL = process.env.MONGODB_URL || '';
const DB_NAME = process.env.MONGODB_DB_NAME || 'dukaankhata-admin-prod';

if (!MONGODB_URL) {
  console.warn('Warning: MONGODB_URL is not set in environment variables.');
}

const mongoOptions: MongoClientOptions = {
  maxIdleTimeMS: 10000,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  retryReads: true,
};

declare global {
  // eslint-disable-next-line no-var
  var _adminMongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(MONGODB_URL, mongoOptions);
  return client.connect().catch((err) => {
    global._adminMongoClientPromise = undefined;
    throw err;
  });
}

export async function getDatabase(): Promise<Db> {
  if (!global._adminMongoClientPromise) {
    global._adminMongoClientPromise = createClientPromise();
  }
  try {
    const c = await global._adminMongoClientPromise;
    return c.db(DB_NAME);
  } catch (err) {
    global._adminMongoClientPromise = undefined;
    throw err;
  }
}

export async function getCollection<T extends Document = any>(name: string): Promise<Collection<T>> {
  const db = await getDatabase();
  return db.collection<T>(name);
}

export const COLLECTIONS = {
  /** Admin login accounts (admin@dukaankhata.com) — `users` collection */
  USERS: 'users',
  /** Migrated merchant data (flat, denormalized) — `current_users` collection */
  CURRENT_USERS: 'current_users',
  WHATSAPP_LOGS: 'whatsapp_logs',
  LEADS_DELETED: 'leads_deleted',
} as const;

export function toObjectId(id: string | ObjectId): ObjectId {
  if (typeof id === 'string') {
    return new ObjectId(id);
  }
  return id;
}
