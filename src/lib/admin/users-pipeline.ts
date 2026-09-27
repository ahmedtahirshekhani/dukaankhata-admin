import { COLLECTIONS } from '@/lib/db/mongodb';

export type UsersSortField = 'lastActivity' | 'name' | 'shopName' | 'expiry' | 'revenue' | 'orders' | 'createdAt' | 'lastWaMessageSentAt';

export interface UsersQueryParams {
  search: string;
  status: string;
  plan: string;
  subState: string;
  role: string;
  sortBy: UsersSortField;
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

const SORT_FIELD_MAP: Record<UsersSortField, string> = {
  lastActivity: 'lastActivity',
  name: 'name',
  shopName: 'shopName',
  expiry: 'subscription.expiresAt',
  revenue: 'monthlyRevenue',
  orders: 'totalTransactions',
  createdAt: 'createdAt',
  lastWaMessageSentAt: 'lastWaMessageSentAt',
};

/**
 * Builds an aggregation pipeline for the `current_users` collection.
 * Data is already flat (no lookups needed for shops/subscriptions).
 * Only looks up whatsapp_logs for live last-sent data.
 */
export function buildUsersListPipeline(params: UsersQueryParams, now: Date) {
  const { search, status, plan, subState, role, sortBy, sortOrder, page, limit } = params;
  const skip = (page - 1) * limit;
  const sortField = SORT_FIELD_MAP[sortBy] || 'lastActivity';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  // Initial match: filter by role and status
  const userMatch: Record<string, unknown> = {
    role: role !== 'all' ? role : { $ne: 'admin' },
  };

  if (status === 'suspended') {
    userMatch.status = { $in: ['suspended', 'blocked'] };
  } else if (status === 'active') {
    userMatch.status = { $nin: ['suspended', 'blocked'] };
  }

  const pipeline: Record<string, unknown>[] = [{ $match: userMatch }];

  // Add computed fields from flat data
  pipeline.push({
    $addFields: {
      subPlan: {
        $toLower: { $ifNull: ['$subscription.plan', 'trial'] },
      },
      subStat: {
        $ifNull: ['$subscription.status', 'in_trial'],
      },
      expiresAt: {
        $ifNull: ['$subscription.expiresAt', now],
      },
      lastActivity: {
        $ifNull: ['$lastActivity', { $ifNull: ['$createdAt', now] }],
      },
      createdAt: {
        $ifNull: ['$createdAt', now],
      },
    },
  });

  // Post-computed-field filters (search, plan, subState)
  const postMatch: Record<string, unknown> = {};

  if (search.trim()) {
    const regex = { $regex: search.trim(), $options: 'i' };
    postMatch.$or = [
      { name: regex },
      { email: regex },
      { phone: regex },
      { shopName: regex },
    ];
  }

  if (plan !== 'all') {
    postMatch.subPlan = plan.toLowerCase();
  }

  if (subState === 'active') {
    postMatch.$expr = {
      $and: [{ $gt: ['$expiresAt', now] }, { $ne: ['$subStat', 'expired'] }],
    };
  } else if (subState === 'expiring_soon') {
    postMatch.$expr = {
      $and: [
        { $gte: ['$expiresAt', now] },
        {
          $lte: [{ $divide: [{ $subtract: ['$expiresAt', now] }, 1000 * 60 * 60 * 24] }, 7],
        },
      ],
    };
  } else if (subState === 'expired') {
    postMatch.$expr = {
      $or: [{ $lt: ['$expiresAt', now] }, { $eq: ['$subStat', 'expired'] }],
    };
  }

  if (Object.keys(postMatch).length > 0) {
    pipeline.push({ $match: postMatch });
  }

  // Lookup latest WhatsApp log for each user
  pipeline.push(
    {
      $lookup: {
        from: COLLECTIONS.WHATSAPP_LOGS,
        let: { uid: '$_id', ph: '$phone' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$status', 'sent'] },
                  {
                    $or: [
                      { $eq: ['$userId', '$$uid'] },
                      { $eq: ['$userId', { $toString: '$$uid' }] },
                      { $eq: ['$phone', '$$ph'] },
                    ],
                  },
                ],
              },
            },
          },
          { $sort: { sentAt: -1 } },
          { $limit: 1 },
        ],
        as: 'lastWaLogDoc',
      },
    },
    {
      $addFields: {
        // Prefer live WA log over migrated whatsapp.lastMessageSentAt
        lastWaMessageSentAt: {
          $ifNull: [
            { $let: { vars: { log: { $arrayElemAt: ['$lastWaLogDoc', 0] } }, in: '$$log.sentAt' } },
            '$whatsapp.lastMessageSentAt',
          ],
        },
        isNeverWaSent: {
          $cond: [
            {
              $or: [
                { $ifNull: [{ $arrayElemAt: ['$lastWaLogDoc', 0] }, false] },
                { $ifNull: ['$whatsapp.lastMessageSentAt', false] },
              ],
            },
            0,
            1,
          ],
        },
        hasPhoneSort: {
          $cond: [
            { $gt: [{ $strLenCP: { $ifNull: ['$phone', ''] } }, 8] },
            1,
            0,
          ],
        },
      },
    },
    {
      $facet: {
        metadata: [{ $count: 'totalUsers' }],
        data: [
          {
            $sort:
              sortBy === 'lastWaMessageSentAt'
                ? { hasPhoneSort: -1, isNeverWaSent: -1, lastActivity: -1 }
                : { [sortField]: sortDirection, _id: 1 },
          },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: { $toString: '$_id' },
              name: { $ifNull: ['$name', 'Store Merchant'] },
              email: 1,
              role: { $ifNull: ['$role', 'user'] },
              status: { $ifNull: ['$status', 'active'] },
              shopName: { $ifNull: ['$shopName', 'Dukaan Store'] },
              phone: { $ifNull: ['$phone', ''] },
              subscription: {
                plan: '$subPlan',
                status: '$subStat',
                expiresAt: '$expiresAt',
                amount: { $ifNull: ['$subscription.amount', 0] },
                billingCycle: '$subscription.billingCycle',
              },
              monthlyRevenue: { $ifNull: ['$monthlyRevenue', 0] },
              totalTransactions: { $ifNull: ['$totalTransactions', 0] },
              lastActivity: 1,
              lastWaMessageSentAt: 1,
              createdAt: 1,
            },
          },
        ],
      },
    }
  );

  return pipeline;
}

export function parseUsersQueryParams(searchParams: URLSearchParams): UsersQueryParams {
  const sortByParam = searchParams.get('sortBy') || 'lastActivity';
  const allowedSortFields: UsersSortField[] = [
    'lastActivity',
    'name',
    'shopName',
    'expiry',
    'revenue',
    'orders',
    'createdAt',
    'lastWaMessageSentAt',
  ];

  return {
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || 'all',
    plan: searchParams.get('plan') || 'all',
    subState: searchParams.get('subState') || 'all',
    role: searchParams.get('role') || 'all',
    sortBy: allowedSortFields.includes(sortByParam as UsersSortField)
      ? (sortByParam as UsersSortField)
      : 'lastActivity',
    sortOrder: searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, parseInt(searchParams.get('page') || '1', 10)),
    limit: Math.min(5000, Math.max(1, parseInt(searchParams.get('limit') || '20', 10))),
  };
}
