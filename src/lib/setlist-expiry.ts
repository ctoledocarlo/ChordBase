/** How long a setlist can be kept for. The first is the default; a year is the longest. */
export const KEEP_OPTIONS = [
  { months: 1, label: "1 month" },
  { months: 2, label: "2 months" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
] as const;

export const DEFAULT_KEEP_MONTHS = 1;

export function isKeepMonths(value: number): boolean {
  return KEEP_OPTIONS.some((o) => o.months === value);
}

/** The moment a setlist expires if kept for `months` from `from`. Jan 31 + 1 month is Feb 28, not Mar 3. */
export function expiryFrom(months: number, from: Date = new Date()): Date {
  const result = new Date(from);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** "Sun, Oct 18, 2026" from "2026-10-18" or a timestamp, read as a plain date so the time zone can't shift it. */
export function formatDay(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
