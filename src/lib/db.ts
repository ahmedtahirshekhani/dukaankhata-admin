import mongoose from 'mongoose';

const MONGODB_URL = process.env.MONGODB_URL || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'dukaankhata-dev';

if (!MONGODB_URL) {
  console.warn('Warning: MONGODB_URL is not set in environment variables.');
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (cached?.conn) {
    return cached.conn;
  }

  if (!cached?.promise) {
    const opts = {
      bufferCommands: false,
      dbName: MONGODB_DB_NAME,
    };

    cached!.promise = mongoose.connect(MONGODB_URL, opts).then((mongooseInstance) => {
      console.log('Connected to MongoDB:', MONGODB_DB_NAME);
      return mongooseInstance;
    });
  }

  try {
    cached!.conn = await cached!.promise;
  } catch (e) {
    cached!.promise = null;
    throw e;
  }

  return cached!.conn;
}
