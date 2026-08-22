export const PENDING_PAYMENT_STATUSES = ['payment_pending', 'payment_expire'] as const;

export type BillingCycle = 'monthly' | 'yearly';
export type AccessStatus =
  | 'active'
  | 'trial'
  | 'payment_pending'
  | 'payment_expire'
  | 'login_blocked'
  | 'expired';

export const PRO_MONTHLY_AMOUNT = 1000;
export const PRO_YEARLY_AMOUNT = 10000;

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  active: 'Active',
  trial: 'Trial',
  payment_pending: 'Payment Pending',
  payment_expire: 'Payment Expired',
  login_blocked: 'Login Blocked',
  expired: 'Expired',
};

export function getCycleDays(billingCycle: BillingCycle): number {
  return billingCycle === 'yearly' ? 365 : 30;
}

export function getPlanAmount(billingCycle: BillingCycle): number {
  return billingCycle === 'yearly' ? PRO_YEARLY_AMOUNT : PRO_MONTHLY_AMOUNT;
}

export function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function computeNextCycleEnd(billingCycleEnd: Date, cycleDays: number, now: Date): Date {
  if (now <= billingCycleEnd) {
    return addDays(billingCycleEnd, cycleDays);
  }
  const daysPassed = daysBetween(billingCycleEnd, now);
  return addDays(now, cycleDays - daysPassed);
}

export function computeNextCycleStart(billingCycleEnd: Date, now: Date): Date {
  return now <= billingCycleEnd ? billingCycleEnd : now;
}

export function getAccessStatus(input: {
  userStatus?: string;
  subPlan?: string;
  subStatus?: string;
  expiresAt?: Date | string | null;
  now?: Date;
}): AccessStatus {
  const now = input.now ?? new Date();
  const userStatus = (input.userStatus || '').toLowerCase();
  const subStatus = (input.subStatus || 'active').toLowerCase();
  const subPlan = (input.subPlan || 'trial').toLowerCase();

  if (
    userStatus === 'suspended' ||
    userStatus === 'blocked' ||
    subStatus === 'login_blocked'
  ) {
    return 'login_blocked';
  }

  if (subStatus === 'payment_pending') {
    return 'payment_pending';
  }

  if (subStatus === 'payment_expire') {
    return 'payment_expire';
  }

  const expiryDate = input.expiresAt ? new Date(input.expiresAt) : null;
  const isExpired = expiryDate ? expiryDate < now : false;
  if (isExpired || subStatus === 'expired') {
    return 'expired';
  }

  if (subPlan === 'trial' || subStatus === 'trial' || subStatus === 'in_trial') {
    return 'trial';
  }

  return 'active';
}

export function isPendingPaymentStatus(status?: string): boolean {
  return PENDING_PAYMENT_STATUSES.includes(status as (typeof PENDING_PAYMENT_STATUSES)[number]);
}

export type SubscriptionRecord = {
  status?: string;
  plan?: string;
  created_at?: Date | string;
  expiry_date?: Date | string;
};

export function getEffectiveSubscription<T extends SubscriptionRecord>(subs: T[]): T | undefined {
  if (!subs.length) return undefined;

  const sorted = [...subs].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  return (
    sorted.find((s) => s.plan === 'pro' && s.status === 'active') ||
    sorted.find((s) => s.status === 'active') ||
    sorted.find((s) => isPendingPaymentStatus(s.status)) ||
    sorted[0]
  );
}

export function isUserBlocked(userStatus?: string, subStatus?: string): boolean {
  const userStatusLower = (userStatus || '').toLowerCase();
  const subStatusLower = (subStatus || '').toLowerCase();
  return (
    userStatusLower === 'suspended' ||
    userStatusLower === 'blocked' ||
    subStatusLower === 'login_blocked'
  );
}

export function isSubscriptionExpired(
  expiresAt?: Date | string | null,
  subStatus?: string,
  now: Date = new Date()
): boolean {
  const subStatusLower = (subStatus || '').toLowerCase();
  if (subStatusLower === 'expired') return true;
  if (!expiresAt) return false;
  return new Date(expiresAt) < now;
}

export function canDeleteMerchant(input: {
  role?: string;
  userStatus?: string;
  subStatus?: string;
  expiresAt?: Date | string | null;
  lastActivity?: Date | string | null;
  createdAt?: Date | string | null;
  now?: Date;
}): boolean {
  if (input.role === 'admin') return false;

  const now = input.now ?? new Date();
  const blockedOrExpired =
    isUserBlocked(input.userStatus, input.subStatus) ||
    isSubscriptionExpired(input.expiresAt, input.subStatus, now);

  if (!blockedOrExpired) return false;

  const reference = input.lastActivity || input.createdAt;
  if (!reference) return false;

  const daysSinceActivity = Math.floor(
    (now.getTime() - new Date(reference).getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceActivity > 60;
}
