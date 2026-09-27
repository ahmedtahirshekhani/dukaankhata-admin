import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { getDatabase, COLLECTIONS } from '@/lib/db/mongodb';
import { getSourceDatabase, SOURCE_COLLECTIONS } from '@/lib/db/source-mongodb';
import { PENDING_PAYMENT_STATUSES } from '@/lib/subscriptions';

const CRON_SECRET = process.env.CRON_SECRET || '';

/**
 * POST /api/admin/migrate-users
 *
 * Full Bulk Sync:
 * - Inserts new users from Source DB (dukaankhata-prod) → Admin DB (current_users).
 * - Updates existing users with latest subscription, lastActivity, status, shop info, totalTransactions, and monthlyRevenue.
 * - Syncs deleted leads from Source DB → Admin DB (leads_deleted).
 * - Uses MongoDB bulkWrite for maximum performance.
 *
 * Auth: Admin cookie OR x-cron-secret header (for external cron jobs).
 * Cron URL: POST https://dukaankhata-admin.vercel.app/api/admin/migrate-users
 * Header:   x-cron-secret: <CRON_SECRET from .env>
 */
export async function POST(request: Request) {
  try {
    let authorized = false;

    const cronSecret = request.headers.get('x-cron-secret');
    if (CRON_SECRET && cronSecret === CRON_SECRET) {
      authorized = true;
    }

    if (!authorized) {
      const cookieStore = await cookies();
      const token = cookieStore.get('dukaankhata_token')?.value;
      if (token) {
        const payload = await verifyToken(token);
        if (payload && payload.role === 'admin') {
          authorized = true;
        }
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sourceDb = await getSourceDatabase();
    const adminDb = await getDatabase();

    const allUsers = await sourceDb
      .collection(SOURCE_COLLECTIONS.USERS)
      .find({ role: { $ne: 'admin' } })
      .toArray();

    if (allUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users found in source database.',
        inserted: 0,
        updated: 0,
      });
    }

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
      adminDb.collection(COLLECTIONS.CURRENT_USERS).find({}).toArray(),
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

    const bulkOperations: any[] = [];
    let insertedCount = 0;
    let updatedCount = 0;

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
              sourceDb: process.env.SOURCE_MONGODB_DB_NAME || 'dukaankhata-prod',
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
      await adminDb.collection(COLLECTIONS.CURRENT_USERS).bulkWrite(bulkOperations);
    }

    // Sync deleted_leads from Source DB -> Admin DB
    let syncedDeletedLeadsCount = 0;
    if (sourceDeletedLeads.length > 0) {
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
      await adminDb.collection(COLLECTIONS.LEADS_DELETED).bulkWrite(deletedOps);
      syncedDeletedLeadsCount = sourceDeletedLeads.length;
    }

    return NextResponse.json({
      success: true,
      message: `Sync complete. ${insertedCount} new users inserted. ${updatedCount} existing users updated with latest orders, revenue & subscriptions. ${syncedDeletedLeadsCount} deleted leads synced.`,
      totalSourceUsers: allUsers.length,
      inserted: insertedCount,
      updated: updatedCount,
      deletedLeadsSynced: syncedDeletedLeadsCount,
    });
  } catch (error: any) {
    console.error('Migration sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function pickEffectiveSubscription(subs: any[]): any | undefined {
  if (!subs.length) return undefined;
  return (
    subs.find((s) => s.plan === 'pro' && s.status === 'active') ||
    subs.find((s) => s.status === 'active') ||
    subs.find((s) => PENDING_PAYMENT_STATUSES.includes(s.status as any)) ||
    subs[0]
  );
}
