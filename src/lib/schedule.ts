import { fullName } from "./ministries";
import type { ScheduleRole } from "./schedule-roles";

/**
 * The schedule's data and the date work around it. Dates are plain "2026-10-25" text, with no time zone, so a Sunday
 * is the same Sunday for everyone; the browser says what "today" is.
 */

export type Person = { id: string; first_name: string; last_name: string; ministries: string[]; user_id: string | null };

export type Assignment = { id: string; person_id: string; role: ScheduleRole; note: string };

export type ScheduleEvent = {
  id: string;
  kind: "sunday" | "event";
  title: string;
  starts_on: string;
  starts_at: string | null;
  location: string;
  notes: string;
  created_by: string | null;
  assignments: Assignment[];
};

export type LogEntry = { id: string; actor_name: string; action: string; summary: string; created_at: string; event_id: string | null };

/** A date on the schedule: a real event, or a Sunday that nothing has been put on yet. */
export type Slot = {
  /** Null for a Sunday that exists only because it is a Sunday. */
  id: string | null;
  kind: "sunday" | "event";
  title: string;
  date: string;
  time: string | null;
  location: string;
  notes: string;
  created_by: string | null;
  assignments: Assignment[];
};

export const personName = (p: Pick<Person, "first_name" | "last_name">): string => fullName(p.first_name, p.last_name);

/** "09:30:00" as "09:30". */
export const shortTime = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

// ---- Dates ----------------------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** The date of a JavaScript Date, in the browser's own calendar. */
export const isoOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

/** Noon on that day: never close enough to midnight for a time zone shift to change the date. */
const at = (iso: string) => {
  const { y, m, d } = parts(iso);
  return new Date(y, m - 1, d, 12);
};

export const addDays = (iso: string, days: number): string => {
  const date = at(iso);
  date.setDate(date.getDate() + days);
  return isoOf(date);
};

/** 0 for Sunday. */
export const weekday = (iso: string): number => at(iso).getDay();

export const isSunday = (iso: string): boolean => weekday(iso) === 0;

/** This Sunday if `iso` is one, otherwise the next. */
export const thisOrNextSunday = (iso: string): string => addDays(iso, (7 - weekday(iso)) % 7);

/** The Sundays from `from` (inclusive) on, `count` of them. */
export function sundaysFrom(from: string, count: number): string[] {
  const first = thisOrNextSunday(from);
  return Array.from({ length: count }, (_, i) => addDays(first, i * 7));
}

export const isIsoDate = (value: unknown): boolean => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { y, m, d } = parts(value);
  const date = new Date(y, m - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

/** "Sunday, Oct 25" (with the year when it isn't this one). */
export function dayText(iso: string, today?: string): string {
  const date = at(iso);
  const sameYear = !today || parts(today).y === date.getFullYear();
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export const monthShort = (iso: string): string => at(iso).toLocaleDateString("en-US", { month: "short" });
export const weekdayShort = (iso: string): string => at(iso).toLocaleDateString("en-US", { weekday: "short" });
export const dayNumber = (iso: string): number => parts(iso).d;

/** "9:30 AM". */
export function timeText(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "today", "tomorrow", "in 3 days", "yesterday", "2 weeks ago", for a date compared with today. */
export function relativeDay(iso: string, today: string): string {
  const days = Math.round((at(iso).getTime() - at(today).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  const n = Math.abs(days);
  const unit = n % 7 === 0 && n >= 14 ? `${n / 7} weeks` : n === 7 ? "1 week" : `${n} days`;
  return days > 0 ? `in ${unit}` : `${unit} ago`;
}

// ---- Slots ------------------------------------------------------------------------------------------------------------

/**
 * Every Sunday in the window (the default schedule) and every event, in date order. A Sunday that has a service
 * saved in the database uses it; the others are shown empty, and become real the first time someone is put on them.
 */
export function buildSlots(events: ScheduleEvent[], from: string, to: string): Slot[] {
  const inRange = events.filter((e) => e.starts_on >= from && e.starts_on <= to);
  const sundayEvents = new Map(inRange.filter((e) => e.kind === "sunday").map((e) => [e.starts_on, e]));
  const slots: Slot[] = [];
  for (let date = thisOrNextSunday(from); date <= to; date = addDays(date, 7)) {
    const saved = sundayEvents.get(date);
    slots.push(
      saved
        ? toSlot(saved)
        : { id: null, kind: "sunday", title: "Sunday service", date, time: null, location: "", notes: "", created_by: null, assignments: [] },
    );
  }
  for (const e of inRange) if (e.kind === "event") slots.push(toSlot(e));
  // Within a day: the Sunday service first, then by time, then by name.
  return slots.sort((a, b) => a.date.localeCompare(b.date) || Number(b.kind === "sunday") - Number(a.kind === "sunday") || (a.time ?? "99").localeCompare(b.time ?? "99") || a.title.localeCompare(b.title));
}

const toSlot = (e: ScheduleEvent): Slot => ({
  id: e.id,
  kind: e.kind,
  title: e.title,
  date: e.starts_on,
  time: shortTime(e.starts_at),
  location: e.location,
  notes: e.notes,
  created_by: e.created_by,
  assignments: e.assignments,
});

/** The people on a slot, by role, in the order the roles are listed. */
export function byRole(assignments: Assignment[], people: Map<string, Person>): Map<ScheduleRole, { assignment: Assignment; person: Person }[]> {
  const out = new Map<ScheduleRole, { assignment: Assignment; person: Person }[]>();
  for (const a of assignments) {
    const person = people.get(a.person_id);
    if (!person) continue;
    out.set(a.role, [...(out.get(a.role) ?? []), { assignment: a, person }].sort((x, y) => personName(x.person).localeCompare(personName(y.person))));
  }
  return out;
}

export const onSlot = (slot: Slot, personId: string | null): boolean => !!personId && slot.assignments.some((a) => a.person_id === personId);

/** Initials for a person's avatar: "MR". */
export function initials(p: Pick<Person, "first_name" | "last_name">): string {
  const letters = [p.first_name, p.last_name].map((s) => s.trim()[0]).filter(Boolean).join("");
  return (letters || "?").toUpperCase();
}

/** A steady colour for a person (the same each time), as a hue for hsl(). */
export function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
