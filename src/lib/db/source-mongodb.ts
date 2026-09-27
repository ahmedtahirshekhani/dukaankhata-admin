/**
 * Source MongoDB connection — connects to the MAIN Dukaankhata database.
 * Used ONLY by the migration sync cron endpoint.
 */
import { MongoClient, MongoClientOptions, Db, Collection } from 'mongodb';

const SOURCE_MONGODB_URL = process.env.SOURCE_MONGODB_URL || '';
const SOURCE_DB_NAME = process.env.SOURCE_MONGODB_DB_NAME || 'dukaankhata-prod';

if (!SOURCE_MONGODB_URL) {
  console.warn('Warning: SOURCE_MONGODB_URL is not set. Migration sync will not work.');
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
  var _sourceMongoClientPromise: Promise<MongoClient> | undefined;
}

function createSourceClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(SOURCE_MONGODB_URL, mongoOptions);
  return client.connect().catch((err) => {
    global._sourceMongoClientPromise = undefined;
    throw err;
  });
}

export async function getSourceDatabase(): Promise<Db> {
  if (!global._sourceMongoClientPromise) {
    global._sourceMongoClientPromise = createSourceClientPromise();
  }
  try {
    const c = await global._sourceMongoClientPromise;
    return c.db(SOURCE_DB_NAME);
  } catch (err) {
    global._sourceMongoClientPromise = undefined;
    throw err;
  }
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
