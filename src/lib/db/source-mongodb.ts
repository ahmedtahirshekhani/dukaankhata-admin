/**
 * Source MongoDB connection — connects to the MAIN Dukaankhata database.
 * Used ONLY by the migration sync cron endpoint.
 */
import { MongoClient, Db, Collection } from 'mongodb';

const SOURCE_MONGODB_URL = process.env.SOURCE_MONGODB_URL || '';
const SOURCE_DB_NAME = process.env.SOURCE_MONGODB_DB_NAME || 'dukaankhata-prod';

if (!SOURCE_MONGODB_URL) {
  console.warn('Warning: SOURCE_MONGODB_URL is not set. Migration sync will not work.');
}

let sourceClient: MongoClient;
let sourceClientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _sourceMongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === 'development') {
  if (!global._sourceMongoClientPromise) {
    sourceClient = new MongoClient(SOURCE_MONGODB_URL);
    global._sourceMongoClientPromise = sourceClient.connect();
  }
  sourceClientPromise = global._sourceMongoClientPromise;
} else {
  sourceClient = new MongoClient(SOURCE_MONGODB_URL);
  sourceClientPromise = sourceClient.connect();
}

export async function getSourceDatabase(): Promise<Db> {
  const c = await sourceClientPromise;
  return c.db(SOURCE_DB_NAME);
}

export async function getSourceCollection<T extends Document = any>(name: string): Promise<Collection<T>> {
  const db = await getSourceDatabase();
  return db.collection<T>(name);
}

/** Collection names in the SOURCE (main Dukaankhata) database */
export const SOURCE_COLLECTIONS = {
  USERS: 'users',
  SUBSCRIPTIONS: 'subscriptions',
  SHOPS: 'shops',
  WHATSAPP_LOGS: 'whatsapp_logs',
} as const;
