const DISPLAY_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DISPLAY_DATETIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function toDate(input?: Date | string | null): Date | null {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** e.g. 30 April 2026 */
export function formatDisplayDate(input?: Date | string | null, fallback = '—'): string {
  const date = toDate(input);
  if (!date) return fallback;
  return DISPLAY_DATE.format(date);
}

/** e.g. 30 April 2026, 3:45 pm */
export function formatDisplayDateTime(input?: Date | string | null, fallback = '—'): string {
  const date = toDate(input);
  if (!date) return fallback;
  return DISPLAY_DATETIME.format(date);
}

/** e.g. 5m ago, 3h ago, 2d ago, or Never sent */
export function formatTimeAgo(input?: Date | string | null, fallback = 'Never sent'): string {
  const date = toDate(input);
  if (!date) return fallback;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return DISPLAY_DATE.format(date);
}
