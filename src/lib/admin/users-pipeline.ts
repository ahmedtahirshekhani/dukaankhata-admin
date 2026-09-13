import { COLLECTIONS } from '@/lib/db/mongodb';
import { PENDING_PAYMENT_STATUSES } from '@/lib/subscriptions';

export type UsersSortField = 'lastActivity' | 'name' | 'shopName' | 'expiry' | 'revenue' | 'orders' | 'createdAt';

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
  shopName: 'resolvedShopName',
  expiry: 'expiresAt',
  revenue: 'monthlyRevenue',
  orders: 'totalTransactions',
  createdAt: 'createdAt',
};

export function buildUsersListPipeline(params: UsersQueryParams, now: Date) {
  const { search, status, plan, subState, role, sortBy, sortOrder, page, limit } = params;
  const skip = (page - 1) * limit;
  const sortField = SORT_FIELD_MAP[sortBy] || 'lastActivity';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const userMatch: Record<string, unknown> = {
    role: role !== 'all' ? role : { $ne: 'admin' },
  };

  if (status === 'suspended') {
    userMatch.status = { $in: ['suspended', 'blocked'] };
  } else if (status === 'active') {
    userMatch.status = { $nin: ['suspended', 'blocked'] };
  }

  const pipeline: Record<string, unknown>[] = [{ $match: userMatch }];

  pipeline.push(
    {
      $lookup: {
        from: COLLECTIONS.SHOPS,
        let: { uid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$owner_user_id', '$$uid'] },
                  { $eq: ['$user_id', '$$uid'] },
                  { $eq: ['$_id', '$$uid'] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'shopDoc',
      },
    },
    {
      $lookup: {
        from: COLLECTIONS.SUBSCRIPTIONS,
        let: { uid: '$_id', email: '$email' },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [{ $eq: ['$user_id', '$$uid'] }, { $eq: ['$email', '$$email'] }],
              },
            },
          },
          { $sort: { created_at: -1 } },
        ],
        as: 'allSubs',
      },
    },
    {
      $addFields: {
        shopFromLookup: { $arrayElemAt: ['$shopDoc', 0] },
        effectiveSub: {
          $let: {
            vars: { subs: '$allSubs' },
            in: {
              $ifNull: [
                {
                  $first: {
                    $filter: {
                      input: '$$subs',
                      as: 's',
                      cond: {
                        $and: [
                          { $eq: ['$$s.plan', 'pro'] },
                          { $eq: ['$$s.status', 'active'] },
                        ],
                      },
                    },
                  },
                },
                {
                  $ifNull: [
                    {
                      $first: {
                        $filter: {
                          input: '$$subs',
                          as: 's',
                          cond: { $eq: ['$$s.status', 'active'] },
                        },
                      },
                    },
                    {
                      $ifNull: [
                        {
                          $first: {
                            $filter: {
                              input: '$$subs',
                              as: 's',
                              cond: { $in: ['$$s.status', [...PENDING_PAYMENT_STATUSES]] },
                            },
                          },
                        },
                        { $arrayElemAt: ['$$subs', 0] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $addFields: {
        resolvedShopName: {
          $ifNull: ['$shopFromLookup.name', { $ifNull: ['$shopName', 'Dukaan Store'] }],
        },
        resolvedPhone: {
          $ifNull: ['$phone', { $ifNull: ['$shopFromLookup.company_phone', ''] }],
        },
        subPlan: {
          $toLower: {
            $ifNull: ['$effectiveSub.plan', { $ifNull: ['$subscription.plan', 'trial'] }],
          },
        },
        subStat: {
          $ifNull: ['$effectiveSub.status', { $ifNull: ['$subscription.status', 'in_trial'] }],
        },
        expiresAt: {
          $ifNull: [
            '$effectiveSub.expiry_date',
            {
              $ifNull: [
                '$effectiveSub.billing_cycle_end',
                { $ifNull: ['$subscription.expiresAt', now] },
              ],
            },
          ],
        },
        lastActivity: {
          $ifNull: [
            '$lastLogin',
            {
              $ifNull: [
                '$user_last_updated_at',
                {
                  $ifNull: [
                    '$updated_at',
                    { $ifNull: ['$created_at', '$createdAt'] },
                  ],
                },
              ],
            },
          ],
        },
        createdAt: {
          $ifNull: ['$created_at', { $ifNull: ['$createdAt', now] }],
        },
      },
    }
  );

  const postMatch: Record<string, unknown> = {};

  if (search.trim()) {
    const regex = { $regex: search.trim(), $options: 'i' };
    postMatch.$or = [
      { name: regex },
      { email: regex },
      { phone: regex },
      { shopName: regex },
      { resolvedShopName: regex },
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

  pipeline.push(
    {
      $lookup: {
        from: COLLECTIONS.ORDERS,
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$user_id', '$$uid'] } } },
          {
            $group: {
              _id: null,
              total: { $sum: '$total_amount' },
              count: { $sum: 1 },
            },
          },
        ],
        as: 'orderAgg',
      },
    },
    {
      $addFields: {
        monthlyRevenue: {
          $let: {
            vars: { agg: { $arrayElemAt: ['$orderAgg', 0] } },
            in: { $ifNull: ['$$agg.total', { $ifNull: ['$monthlyRevenue', 0] }] },
          },
        },
        totalTransactions: {
          $let: {
            vars: { agg: { $arrayElemAt: ['$orderAgg', 0] } },
            in: { $ifNull: ['$$agg.count', { $ifNull: ['$totalTransactions', 0] }] },
          },
        },
      },
    },
    {
      $facet: {
        metadata: [{ $count: 'totalUsers' }],
        data: [
          { $sort: { [sortField]: sortDirection, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: { $toString: '$_id' },
              name: { $ifNull: ['$name', 'Store Merchant'] },
              email: 1,
              role: { $ifNull: ['$role', 'user'] },
              status: { $ifNull: ['$status', 'active'] },
              shopName: '$resolvedShopName',
              phone: '$resolvedPhone',
              subscription: {
                plan: '$subPlan',
                status: '$subStat',
                expiresAt: '$expiresAt',
                amount: { $ifNull: ['$effectiveSub.amount', 0] },
                billingCycle: '$effectiveSub.billing_cycle',
              },
              monthlyRevenue: 1,
              totalTransactions: 1,
              lastActivity: 1,
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
