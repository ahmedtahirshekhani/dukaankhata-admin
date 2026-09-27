import { MongoClient, Db, Collection, ObjectId } from 'mongodb';

const MONGODB_URL = process.env.MONGODB_URL || '';
const DB_NAME = process.env.MONGODB_DB_NAME || 'dukaankhata-admin-prod';

if (!MONGODB_URL) {
  console.warn('Warning: MONGODB_URL is not set in environment variables.');
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _adminMongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === 'development') {
  if (!global._adminMongoClientPromise) {
    client = new MongoClient(MONGODB_URL);
    global._adminMongoClientPromise = client.connect();
  }
  clientPromise = global._adminMongoClientPromise;
} else {
  client = new MongoClient(MONGODB_URL);
  clientPromise = client.connect();
}

export async function getDatabase(): Promise<Db> {
  const c = await clientPromise;
  return c.db(DB_NAME);
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
