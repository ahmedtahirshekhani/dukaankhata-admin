import { Db, ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/mongodb';
import { canDeleteMerchant, getEffectiveSubscription, type SubscriptionRecord } from '@/lib/subscriptions';

type UserDoc = {
  _id: ObjectId;
  email: string;
  name?: string;
  role?: string;
  status?: string;
  lastLogin?: Date | string;
  user_last_updated_at?: Date | string;
  updated_at?: Date | string;
  created_at?: Date | string;
  createdAt?: Date | string;
};

export function getUserLastActivity(user: UserDoc): Date | string | undefined {
  return (
    user.lastLogin ||
    user.user_last_updated_at ||
    user.updated_at ||
    user.created_at ||
    user.createdAt
  );
}

export async function isMerchantDeletable(
  db: Db,
  user: UserDoc,
  now: Date = new Date()
): Promise<boolean> {
  if (user.role === 'admin') return false;

  const subscriptions = (await db
    .collection(COLLECTIONS.SUBSCRIPTIONS)
    .find({ $or: [{ user_id: user._id }, { email: user.email }] })
    .toArray()) as SubscriptionRecord[];
  const effectiveSub = getEffectiveSubscription(subscriptions);

  return canDeleteMerchant({
    role: user.role,
    userStatus: user.status,
    subStatus: effectiveSub?.status,
    subPlan: effectiveSub?.plan || (user as any).subscription?.plan,
    expiresAt: effectiveSub?.expiry_date,
    lastActivity: getUserLastActivity(user),
    createdAt: user.created_at || user.createdAt,
    now,
  });
}

export async function purgeMerchantData(
  db: Db,
  userObjectId: ObjectId,
  userEmail: string
): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.USERS).deleteOne({ _id: userObjectId }),
    db.collection(COLLECTIONS.SUBSCRIPTIONS).deleteMany({
      $or: [{ user_id: userObjectId }, { email: userEmail }],
    }),
    db.collection(COLLECTIONS.SHOPS).deleteMany({
      $or: [{ owner_user_id: userObjectId }, { user_id: userObjectId }, { email: userEmail }],
    }),
    db.collection(COLLECTIONS.ORDERS).deleteMany({
      $or: [{ user_id: userObjectId }, { merchant_id: userObjectId }],
    }),
    db.collection(COLLECTIONS.TRANSACTIONS).deleteMany({ user_id: userObjectId }),
    db.collection(COLLECTIONS.PRODUCTS).deleteMany({ user_id: userObjectId }),
    db.collection(COLLECTIONS.PARTIES).deleteMany({ user_id: userObjectId }),
  ]);
}
