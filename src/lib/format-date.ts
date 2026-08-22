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
