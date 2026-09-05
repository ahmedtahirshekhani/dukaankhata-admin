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
  // Retrieve user document
  const userDoc = await db.collection(COLLECTIONS.USERS).findOne({ _id: userObjectId });

  // Retrieve shop document
  const shopDoc = await db.collection(COLLECTIONS.SHOPS).findOne({
    $or: [{ owner_user_id: userObjectId }, { user_id: userObjectId }, { email: userEmail }],
  });

  // Retrieve subscription document
  const subDoc = await db.collection(COLLECTIONS.SUBSCRIPTIONS).findOne(
    { $or: [{ user_id: userObjectId }, { email: userEmail }] },
    { sort: { created_at: -1 } }
  );

  // Retrieve order metrics
  const orderAgg = await db
    .collection(COLLECTIONS.ORDERS)
    .aggregate([
      { $match: { $or: [{ user_id: userObjectId }, { merchant_id: userObjectId }] } },
      {
        $group: {
          _id: null,
          total: { $sum: '$total_amount' },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const aggResult = orderAgg[0] || {};
  const monthlyRevenue = aggResult.total ?? (userDoc as any)?.monthlyRevenue ?? 0;
  const totalTransactions = aggResult.count ?? (userDoc as any)?.totalTransactions ?? 0;

  const leadRecord = {
    originalUserId: userObjectId.toString(),
    name: userDoc?.name || userDoc?.full_name || shopDoc?.name || 'Unknown Merchant',
    email: userEmail || userDoc?.email || '',
    phone: shopDoc?.company_phone || shopDoc?.phone || shopDoc?.mobile || userDoc?.phone || '',
    company: shopDoc?.name || userDoc?.shopName || 'N/A',
    address: shopDoc?.address || shopDoc?.company_address || shopDoc?.location?.address || userDoc?.address || 'N/A',
    city: shopDoc?.city || shopDoc?.location?.city || '',
    role: userDoc?.role || 'user',
    userStatus: userDoc?.status || 'active',
    subscriptionPlan: subDoc?.plan || userDoc?.subscription?.plan || 'trial',
    subscriptionStatus: subDoc?.status || userDoc?.subscription?.status || 'expired',
    monthlyRevenue,
    totalTransactions,
    lastActivity: userDoc ? getUserLastActivity(userDoc as any) : null,
    createdAt: userDoc?.created_at || userDoc?.createdAt || null,
    deletedAt: new Date(),
  };

  // Archive lead into leads_deleted collection
  await db.collection(COLLECTIONS.LEADS_DELETED).insertOne(leadRecord);

  // Cascade purge across all user collections
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
