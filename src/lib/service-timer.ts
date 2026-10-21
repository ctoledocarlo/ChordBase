/**
 * The service clock: the time of day, and a countdown to when the set should end. The end time is shared by
 * every screen (it is saved with the setlist); each screen counts down against its own clock, which is close
 * enough that nobody will notice a second.
 */

export type TimerView =
  | { kind: "none" }
  | { kind: "running"; seconds: number; urgent: boolean }
  | { kind: "over"; seconds: number };

/** Under this many seconds left the countdown turns urgent. */
export const URGENT_SECONDS = 5 * 60;

export function timerView(endsAt: string | null, now: number): TimerView {
  if (!endsAt) return { kind: "none" };
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return { kind: "none" };
  const seconds = Math.round((end - now) / 1000);
  if (seconds >= 0) return { kind: "running", seconds, urgent: seconds <= URGENT_SECONDS };
  return { kind: "over", seconds: -seconds };
}

/** "18 min left", "45 s left", "2 min over". */
export function timerText(view: TimerView): string {
  if (view.kind === "none") return "";
  const s = view.seconds;
  const amount = s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`;
  // Past the end, count whole minutes lost, not a rounded-up one.
  const over = s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`;
  return view.kind === "running" ? `${amount} left` : `${over} over`;
}

/** The time of day as 24-hour "09:05", in this device's own time. */
export function clockText(now: number): string {
  const d = new Date(now);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Lengths to offer for "the set ends in…", in minutes. */
export const TIMER_PRESETS = [15, 30, 45, 60, 75, 90];

/** The moment `minutes` from now, as saved text. */
export const endsInMinutes = (minutes: number, now: number) => new Date(now + minutes * 60_000).toISOString();

/**
 * The next time the clock reads "10:30" (from a time box), as saved text: later today, or tomorrow if that time
 * has already gone. Null if the text isn't a time.
 */
export function endsAtClock(hhmm: string, now: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  // A time that is a few minutes in the past is "now, a bit late"; one many hours back means tomorrow.
  if (d.getTime() < now - 60 * 60_000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}
