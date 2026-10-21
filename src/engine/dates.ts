// ISO date (YYYY-MM-DD) helpers. All arithmetic is done in UTC so local
// timezone / DST never shifts a calendar day.

const MS_PER_DAY = 86_400_000;

function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  // Feb 29 falls back to Feb 28 in non-leap years.
  const target = new Date(Date.UTC(y + years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) return fromUtcMs(Date.UTC(y + years, m - 1, 28));
  return fromUtcMs(target.getTime());
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtcMs(toUtcMs(value)) === value;
}
