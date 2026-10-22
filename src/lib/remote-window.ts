/**
 * How long a phone remote stays on. It switches itself off four hours after it was started, so a PIN
 * that was shared and forgotten stops working on its own. With half an hour or less left, Media can add an hour.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const REMOTE_LIFETIME_MS = 4 * HOUR;
export const REMOTE_EXTENSION_MS = HOUR;
/** An hour can be added once this much or less is left. */
export const REMOTE_EXTEND_WINDOW_MS = 30 * MINUTE;

/** When a remote started at `startedAt` switches off. */
export const remoteEnd = (startedAt: number): string => new Date(startedAt + REMOTE_LIFETIME_MS).toISOString();

/**
 * When a remote switches off, from what the database holds. A remote started before the end time was kept has
 * only its start time, and ends four hours after it. With neither, it is off.
 */
export function endOf(row: { remote_pin?: string | null; remote_expires_at?: string | null; remote_started_at?: string | null }): string | null {
  if (!row.remote_pin) return null;
  if (row.remote_expires_at) return row.remote_expires_at;
  const started = row.remote_started_at ? Date.parse(row.remote_started_at) : NaN;
  return Number.isNaN(started) ? null : remoteEnd(started);
}

/** Milliseconds until it switches off; 0 when it is off, already over, or has no end time. */
export function leftMs(endsAt: string | null | undefined, now: number): number {
  if (!endsAt) return 0;
  const end = Date.parse(endsAt);
  return Number.isNaN(end) ? 0 : Math.max(0, end - now);
}

export const isOn = (row: Parameters<typeof endOf>[0], now: number): boolean => leftMs(endOf(row), now) > 0;

/** Whether the "add an hour" choice is offered: only near the end, and never once it is over. */
export const canExtend = (left: number): boolean => left > 0 && left <= REMOTE_EXTEND_WINDOW_MS;

/** The end time one hour later. */
export const extendedEnd = (endsAt: string): string => new Date(Date.parse(endsAt) + REMOTE_EXTENSION_MS).toISOString();

/** "3 h 20 min", "25 min", "under a minute". */
export function leftWords(ms: number): string {
  if (ms <= 0) return "0 min";
  const minutes = Math.ceil(ms / MINUTE);
  if (ms < MINUTE) return "under a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
