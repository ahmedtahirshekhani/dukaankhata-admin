import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import User from '@/models/User';
import { connectToDatabase } from '@/lib/db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dukaankhata_super_secret_jwt_key_2026'
);

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

export async function signToken(payload: { id: string; email: string; role: string; name: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    return verified.payload;
  } catch (error) {
    return null;
  }
}

/**
 * Ensures the admin user defined in .env exists in MongoDB.
 * If the account does not exist, creates it.
 * If it exists, updates the password if necessary.
 */
export async function ensureAdminAccountExists() {
  await connectToDatabase();

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@dukaankhata.com').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminSecurePass123!';

  let adminUser = await User.findOne({ email: adminEmail }).select('+password');

  if (!adminUser) {
    console.log(`Creating default admin account from .env (${adminEmail})...`);
    const hashedPassword = await hashPassword(adminPassword);
    adminUser = await User.create({
      name: 'Super Admin',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      status: 'active',
      shopName: 'DukaanKhata HQ',
      phone: '+1 800-DUKAAN',
      subscription: {
        plan: 'Enterprise',
        status: 'active',
        expiresAt: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000), // 10 years
      },
      monthlyRevenue: 500000,
      totalTransactions: 1200,
    });
    console.log('Admin account created successfully.');
  } else {
    // Optionally ensure role and password match .env
    const isPasswordValid = await comparePassword(adminPassword, adminUser.password || '');
    if (!isPasswordValid || adminUser.role !== 'admin' || adminUser.status !== 'active') {
      console.log('Updating admin account credentials/role from .env...');
      adminUser.password = await hashPassword(adminPassword);
      adminUser.role = 'admin';
      adminUser.status = 'active';
      await adminUser.save();
    }
  }

  return adminUser;
}
