/**
 * Migration & Sync Script: Main Dukaankhata ↔ Admin Portal DB
 *
 * FULL SYNC (Ultra Fast Bulk Operations):
 * - Inserts new users from Source DB → Admin DB (current_users).
 * - Updates existing users with latest subscriptions, lastActivity, status, orders count & total revenue from Source DB.
 * - Syncs deleted leads from Source DB → Admin DB (leads_deleted).
 *
 * Usage:
 *   npm run migrate:users
 *   npx tsx scripts/migrate-users.ts
 */

import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '..', '.env') });

const SOURCE_URL = process.env.SOURCE_MONGODB_URL || '';
const SOURCE_DB = process.env.SOURCE_MONGODB_DB_NAME || 'dukaankhata-prod';
const ADMIN_URL = process.env.MONGODB_URL || '';
const ADMIN_DB = process.env.MONGODB_DB_NAME || 'dukaankhata-admin-prod';

const SOURCE_COLLECTIONS = {
  USERS: 'users',
  SUBSCRIPTIONS: 'subscriptions',
  SHOPS: 'shops',
  WHATSAPP_LOGS: 'whatsapp_logs',
};

const PENDING_PAYMENT_STATUSES = ['payment_pending', 'payment_expire'];

function pickEffectiveSubscription(subs: any[]): any | undefined {
  if (!subs.length) return undefined;
  return (
    subs.find((s) => s.plan === 'pro' && s.status === 'active') ||
    subs.find((s) => s.status === 'active') ||
    subs.find((s) => PENDING_PAYMENT_STATUSES.includes(s.status)) ||
    subs[0]
  );
}

function log(msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  if (!SOURCE_URL) {
    console.error('❌ SOURCE_MONGODB_URL is not set. Check your .env file.');
    process.exit(1);
  }
  if (!ADMIN_URL) {
    console.error('❌ MONGODB_URL is not set. Check your .env file.');
    process.exit(1);
  }

  log('🔌 Connecting to Source DB (Main Dukaankhata)...');
  const sourceClient = new MongoClient(SOURCE_URL);
  await sourceClient.connect();
  const sourceDb = sourceClient.db(SOURCE_DB);
  log(`✅ Connected to Source: ${SOURCE_DB}`);

  log('🔌 Connecting to Admin Portal DB...');
  const adminClient = new MongoClient(ADMIN_URL);
  await adminClient.connect();
  const adminDb = adminClient.db(ADMIN_DB);
  log(`✅ Connected to Admin Portal: ${ADMIN_DB}`);

  try {
    const allUsers = await sourceDb
      .collection(SOURCE_COLLECTIONS.USERS)
      .find({ role: { $ne: 'admin' } })
      .toArray();

    log(`📋 Found ${allUsers.length} users in source database`);

    if (allUsers.length === 0) {
      log('⚠️  No users found in source database.');
      return;
    }

    log('⚡ Bulk fetching shops, subscriptions, orders revenue, deleted leads & existing admin users...');
    const userIds = allUsers.map((u) => u._id);
    const userIdStrings = allUsers.map((u) => u._id.toString());
    const userEmails = allUsers.map((u) => u.email).filter(Boolean);

    const [allShops, allSubscriptions, orderStats, existingDocs, sourceDeletedLeads] = await Promise.all([
      sourceDb.collection(SOURCE_COLLECTIONS.SHOPS).find({
        $or: [
          { owner_user_id: { $in: [...userIds, ...userIdStrings] } },
          { user_id: { $in: [...userIds, ...userIdStrings] } },
          { _id: { $in: userIds } },
        ],
      }).toArray(),
      sourceDb.collection(SOURCE_COLLECTIONS.SUBSCRIPTIONS).find({
        $or: [
          { user_id: { $in: [...userIds, ...userIdStrings] } },
          { email: { $in: userEmails } },
        ],
      }).sort({ created_at: -1 }).toArray(),
      sourceDb.collection('orders').aggregate([
        {
          $group: {
            _id: { $toString: '$user_id' },
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: { $ifNull: ['$total_amount', '$amount', 0] } },
          },
        },
      ]).toArray(),
      adminDb.collection('current_users').find({}).toArray(),
      sourceDb.collection('leads_deleted').find({}).toArray(),
    ]);

    const shopMap = new Map<string, any>();
    for (const shop of allShops) {
      if (shop.owner_user_id) shopMap.set(shop.owner_user_id.toString(), shop);
      if (shop.user_id) shopMap.set(shop.user_id.toString(), shop);
      if (shop._id) shopMap.set(shop._id.toString(), shop);
    }

    const subMap = new Map<string, any[]>();
    for (const sub of allSubscriptions) {
      const key = sub.user_id?.toString() || sub.email;
      if (key) {
        if (!subMap.has(key)) subMap.set(key, []);
        subMap.get(key)!.push(sub);
      }
    }

    const orderStatMap = new Map<string, { totalOrders: number; totalRevenue: number }>();
    for (const stat of orderStats) {
      if (stat._id) {
        orderStatMap.set(stat._id.toString(), {
          totalOrders: stat.totalOrders || 0,
          totalRevenue: stat.totalRevenue || 0,
        });
      }
    }

    const existingDocMap = new Map<string, any>();
    for (const doc of existingDocs) {
      if (doc.originalUserId) existingDocMap.set(doc.originalUserId.toString(), doc);
      if (doc.email) existingDocMap.set(doc.email, doc);
    }

    const adminCollection = adminDb.collection('current_users');
    const bulkOperations: any[] = [];
    let insertedCount = 0;
    let updatedCount = 0;

    log('🔄 Preparing bulk sync operations with revenue & orders...');
    for (const user of allUsers) {
      const userIdStr = user._id.toString();
      const userEmail = user.email || '';

      const shopDoc = shopMap.get(userIdStr);
      const userSubs = subMap.get(userIdStr) || (userEmail ? subMap.get(userEmail) : []) || [];
      const effectiveSub = pickEffectiveSubscription(userSubs);
      const orderStat = orderStatMap.get(userIdStr) || { totalOrders: 0, totalRevenue: 0 };

      const resolvedPhone =
        user.phone || shopDoc?.company_phone || shopDoc?.phone || shopDoc?.mobile || '';

      const lastActivityDate =
        user.lastLogin || user.user_last_updated_at || user.updated_at ||
        user.created_at || user.createdAt || null;

      const subPlan = effectiveSub?.plan || user.subscription?.plan || 'trial';
      const subStat = effectiveSub?.status || user.subscription?.status || 'in_trial';
      const subExpiresAt =
        effectiveSub?.expiry_date || effectiveSub?.billing_cycle_end ||
        user.subscription?.expiresAt || null;
      const subAmount = effectiveSub?.amount || 0;
      const subBillingCycle = effectiveSub?.billing_cycle || null;

      const existingDoc = existingDocMap.get(userIdStr) || (userEmail ? existingDocMap.get(userEmail) : null);

      if (!existingDoc) {
        insertedCount++;
        bulkOperations.push({
          insertOne: {
            document: {
              originalUserId: user._id,
              name: user.name || user.full_name || shopDoc?.name || 'Unknown',
              email: userEmail,
              role: user.role || 'user',
              status: user.status || 'active',
              shopName: shopDoc?.name || user.shopName || 'Dukaan Store',
              phone: resolvedPhone,
              address:
                shopDoc?.address || shopDoc?.company_address ||
                shopDoc?.location?.address || user.address || '',
              city: shopDoc?.city || shopDoc?.location?.city || '',
              subscription: {
                plan: subPlan,
                status: subStat,
                expiresAt: subExpiresAt ? new Date(subExpiresAt) : null,
                amount: subAmount,
                billingCycle: subBillingCycle,
                createdAt: effectiveSub?.created_at ? new Date(effectiveSub.created_at) : null,
              },
              monthlyRevenue: orderStat.totalRevenue,
              totalTransactions: orderStat.totalOrders,
              whatsapp: {
                lastMessageSentAt: null,
                lastMessagePhone: null,
                lastMessageStatus: null,
              },
              lastLogin: user.lastLogin ? new Date(user.lastLogin) : null,
              lastActivity: lastActivityDate ? new Date(lastActivityDate) : null,
              createdAt: user.created_at ? new Date(user.created_at) : new Date(),
              updatedAt: new Date(),
              migratedAt: new Date(),
              sourceDb: SOURCE_DB,
            },
          },
        });
      } else {
        updatedCount++;
        const updateFields: any = {
          monthlyRevenue: orderStat.totalRevenue,
          totalTransactions: orderStat.totalOrders,
          updatedAt: new Date(),
        };

        if (user.name && user.name !== 'Unknown') updateFields.name = user.name;
        if (shopDoc?.name) updateFields.shopName = shopDoc.name;
        if (resolvedPhone) updateFields.phone = resolvedPhone;
        if (shopDoc?.address) updateFields.address = shopDoc.address;
        if (shopDoc?.city) updateFields.city = shopDoc.city;
        if (lastActivityDate) updateFields.lastActivity = new Date(lastActivityDate);
        if (user.lastLogin) updateFields.lastLogin = new Date(user.lastLogin);

        const existingSubExpires = existingDoc.subscription?.expiresAt
          ? new Date(existingDoc.subscription.expiresAt).getTime()
          : 0;
        const sourceSubExpires = subExpiresAt ? new Date(subExpiresAt).getTime() : 0;

        if (effectiveSub && (sourceSubExpires >= existingSubExpires || existingDoc.subscription?.status !== 'active')) {
          updateFields['subscription.plan'] = subPlan;
          updateFields['subscription.status'] = subStat;
          if (subExpiresAt) updateFields['subscription.expiresAt'] = new Date(subExpiresAt);
          if (subAmount) updateFields['subscription.amount'] = subAmount;
          if (subBillingCycle) updateFields['subscription.billingCycle'] = subBillingCycle;
        }

        bulkOperations.push({
          updateOne: {
            filter: { _id: existingDoc._id },
            update: { $set: updateFields },
          },
        });
      }
    }

    if (bulkOperations.length > 0) {
      log(`🚀 Executing ${bulkOperations.length} bulk merchant operations...`);
      await adminCollection.bulkWrite(bulkOperations);
    }

    // Sync deleted_leads from Source DB -> Admin DB
    let syncedDeletedLeadsCount = 0;
    if (sourceDeletedLeads.length > 0) {
      log(`🗑️ Syncing ${sourceDeletedLeads.length} deleted leads from Source DB...`);
      const deletedOps = sourceDeletedLeads.map((lead) => ({
        updateOne: {
          filter: {
            $or: [
              { originalUserId: lead.originalUserId },
              ...(lead.email ? [{ email: lead.email }] : []),
            ],
          },
          update: {
            $set: {
              originalUserId: lead.originalUserId || lead._id?.toString(),
              name: lead.name || 'Unknown Merchant',
              email: lead.email || '',
              phone: lead.phone || '',
              company: lead.company || 'N/A',
              address: lead.address || 'N/A',
              city: lead.city || '',
              role: lead.role || 'user',
              userStatus: lead.userStatus || 'active',
              subscriptionPlan: lead.subscriptionPlan || 'trial',
              subscriptionStatus: lead.subscriptionStatus || 'expired',
              monthlyRevenue: lead.monthlyRevenue || 0,
              totalTransactions: lead.totalTransactions || 0,
              lastActivity: lead.lastActivity ? new Date(lead.lastActivity) : null,
              createdAt: lead.createdAt ? new Date(lead.createdAt) : null,
              deletedAt: lead.deletedAt ? new Date(lead.deletedAt) : new Date(),
            },
          },
          upsert: true,
        },
      }));
      await adminDb.collection('leads_deleted').bulkWrite(deletedOps);
      syncedDeletedLeadsCount = sourceDeletedLeads.length;
      log(`✅ Synced ${syncedDeletedLeadsCount} deleted leads`);
    }

    log('🔧 Ensuring indexes on current_users & leads_deleted...');
    await adminCollection.createIndex({ originalUserId: 1 }, { unique: true });
    await adminCollection.createIndex({ email: 1 });
    await adminCollection.createIndex({ phone: 1 });
    await adminCollection.createIndex({ 'subscription.plan': 1 });
    await adminCollection.createIndex({ 'subscription.status': 1 });
    await adminCollection.createIndex({ status: 1 });
    await adminCollection.createIndex({ createdAt: -1 });
    await adminCollection.createIndex({ lastActivity: -1 });
    await adminCollection.createIndex({ 'whatsapp.lastMessageSentAt': -1 });

    const deletedLeadsCol = adminDb.collection('leads_deleted');
    await deletedLeadsCol.createIndex({ originalUserId: 1 });
    await deletedLeadsCol.createIndex({ email: 1 });
    await deletedLeadsCol.createIndex({ deletedAt: -1 });
    log('✅ Indexes ready');

    console.log('\n' + '═'.repeat(60));
    console.log('  FULL MIGRATION & SYNC COMPLETE (WITH DELETED LEADS)');
    console.log('═'.repeat(60));
    console.log(`  Source DB:            ${SOURCE_DB}`);
    console.log(`  Destination DB:       ${ADMIN_DB}`);
    console.log(`  Collection:           current_users & leads_deleted`);
    console.log('─'.repeat(60));
    console.log(`  Total Source Users:   ${allUsers.length}`);
    console.log(`  Newly Inserted:       ${insertedCount}`);
    console.log(`  Existing Updated:     ${updatedCount}`);
    console.log(`  Deleted Leads Synced: ${syncedDeletedLeadsCount}`);
    console.log('═'.repeat(60) + '\n');
  } finally {
    await sourceClient.close();
    await adminClient.close();
    log('🔒 Database connections closed');
  }
}

main().catch((err) => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
