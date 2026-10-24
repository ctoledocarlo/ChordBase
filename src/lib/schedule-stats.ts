import { addDays, buildSlots, personName, type Person, type ScheduleEvent, type Slot, weekday } from "./schedule";
import { activeColumns, type ScheduleColumn } from "./schedule-columns";

/**
 * What a scheduler wants to know before putting someone on: when they last served (and in what), how often lately,
 * how they have been spread across the kinds of Sunday, who is free of duty for a while, and what is still empty.
 * Everything is worked out from the events already loaded, so it needs no extra requests.
 */

export type Period = { id: string; label: string; days: number };

export const PERIODS: Period[] = [
  { id: "4w", label: "4 weeks", days: 28 },
  { id: "3m", label: "3 months", days: 91 },
  { id: "6m", label: "6 months", days: 182 },
  { id: "12m", label: "12 months", days: 365 },
];

export const DEFAULT_PERIOD = "3m";

/** The soonest stretch looked at for people who are on a lot. */
export const SOON_DAYS = 28;

export type ColumnHistory = {
  /** Times on this column in all the history loaded. */
  count: number;
  /** Times on it within the chosen period (up to today). */
  inPeriod: number;
  last: string | null;
};

export type Appearance = { date: string; title: string; columns: string[] };

export type PersonSummary = {
  person: Person;
  /** The most recent service on or before today. */
  last: Appearance | null;
  /** The next service after today. */
  next: Appearance | null;
  /** Whole days since `last`. */
  daysSince: number | null;
  /** Services within the chosen period, up to today. */
  inPeriod: number;
  /** Services scheduled after today. */
  upcoming: number;
  /** Services in the next four weeks. */
  soon: number;
  /** The longest run of Sundays in a row, from two weeks back to four weeks ahead. */
  run: number;
  byColumn: Map<string, ColumnHistory>;
  /** For the chosen choice column: services in the period by option ("Communion Sunday" → 2). */
  byChoice: Map<string, number>;
  /** The last time they were on each option. */
  lastChoice: Map<string, string>;
};

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a: string, b: string): number => Math.round((parse(b) - parse(a)) / 86_400_000);

/** "3 weeks ago", "yesterday", "just now" for a gap in days. */
export function agoText(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 700) return `${Math.round(days / 30.4)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/** The people on each event, with the columns they are on. */
function appearances(events: ScheduleEvent[]): Map<string, { event: ScheduleEvent; columns: string[] }[]> {
  const out = new Map<string, { event: ScheduleEvent; columns: string[] }[]>();
  for (const event of events) {
    const mine = new Map<string, string[]>();
    for (const a of event.assignments) mine.set(a.person_id, [...(mine.get(a.person_id) ?? []), a.role]);
    for (const [id, columns] of mine) out.set(id, [...(out.get(id) ?? []), { event, columns }]);
  }
  for (const list of out.values()) list.sort((a, b) => a.event.starts_on.localeCompare(b.event.starts_on));
  return out;
}

/** The longest run of consecutive Sundays (a service on the Sunday) within a window. */
function longestRun(dates: string[], from: string, to: string): number {
  const sundays = new Set(dates.filter((d) => weekday(d) === 0 && d >= from && d <= to));
  let best = 0;
  let run = 0;
  for (let d = addDays(from, (7 - weekday(from)) % 7); d <= to; d = addDays(d, 7)) {
    run = sundays.has(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function summarize(
  events: ScheduleEvent[],
  people: Person[],
  today: string,
  options: { periodDays: number; choiceKey: string | null },
): Map<string, PersonSummary> {
  const since = addDays(today, -options.periodDays);
  const soonEnd = addDays(today, SOON_DAYS);
  const shown = appearances(events);
  const out = new Map<string, PersonSummary>();

  for (const person of people) {
    const list = shown.get(person.id) ?? [];
    const past = list.filter((x) => x.event.starts_on <= today);
    const future = list.filter((x) => x.event.starts_on > today);
    const toAppearance = (x: { event: ScheduleEvent; columns: string[] }): Appearance => ({ date: x.event.starts_on, title: x.event.title, columns: x.columns });

    const byColumn = new Map<string, ColumnHistory>();
    const byChoice = new Map<string, number>();
    const lastChoice = new Map<string, string>();
    for (const x of past) {
      const inPeriod = x.event.starts_on >= since;
      for (const key of x.columns) {
        const h = byColumn.get(key) ?? { count: 0, inPeriod: 0, last: null };
        h.count++;
        if (inPeriod) h.inPeriod++;
        if (!h.last || x.event.starts_on > h.last) h.last = x.event.starts_on;
        byColumn.set(key, h);
      }
      const type = options.choiceKey ? x.event.fields?.[options.choiceKey] : undefined;
      if (type) {
        if (inPeriod) byChoice.set(type, (byChoice.get(type) ?? 0) + 1);
        if (!lastChoice.has(type) || x.event.starts_on > lastChoice.get(type)!) lastChoice.set(type, x.event.starts_on);
      }
    }

    const last = past.length > 0 ? toAppearance(past[past.length - 1]) : null;
    out.set(person.id, {
      person,
      last,
      next: future.length > 0 ? toAppearance(future[0]) : null,
      daysSince: last ? daysBetween(last.date, today) : null,
      inPeriod: past.filter((x) => x.event.starts_on >= since).length,
      upcoming: future.length,
      soon: future.filter((x) => x.event.starts_on <= soonEnd).length,
      run: longestRun(list.map((x) => x.event.starts_on), addDays(today, -14), soonEnd),
      byColumn,
      byChoice,
      lastChoice,
    });
  }
  return out;
}

export type OpenSpot = { slot: Slot; missing: ScheduleColumn[] };

/** The coming services with people columns nobody is on yet (optional columns are left out). */
export function openSpots(events: ScheduleEvent[], columns: ScheduleColumn[], today: string, days = SOON_DAYS): OpenSpot[] {
  const required = activeColumns(columns).filter((c) => c.kind === "people" && !c.optional);
  if (required.length === 0) return [];
  return buildSlots(events, today, addDays(today, days - 1))
    .map((slot) => ({ slot, missing: required.filter((c) => !slot.assignments.some((a) => a.role === c.key)) }))
    .filter((x) => x.missing.length > 0);
}

export type Watch = { person: Person; reason: string };

/** People who are on a lot: three or more services in the next four weeks, or three Sundays in a row. */
export function watchList(summaries: Map<string, PersonSummary>): Watch[] {
  const out: Watch[] = [];
  for (const s of summaries.values()) {
    if (s.run >= 3) out.push({ person: s.person, reason: `${s.run} Sundays in a row` });
    else if (s.soon >= 3) out.push({ person: s.person, reason: `on ${s.soon} services in the next 4 weeks` });
  }
  return out.sort((a, b) => personName(a.person).localeCompare(personName(b.person)));
}

export type Order = "rested" | "busiest" | "name";

/** The people in the order a scheduler wants: longest since they served first, busiest first, or by name. */
export function sortSummaries(list: PersonSummary[], order: Order): PersonSummary[] {
  const name = (a: PersonSummary, b: PersonSummary) => personName(a.person).localeCompare(personName(b.person));
  const copy = [...list];
  if (order === "name") return copy.sort(name);
  if (order === "busiest") return copy.sort((a, b) => b.inPeriod + b.upcoming - (a.inPeriod + a.upcoming) || name(a, b));
  // Never scheduled counts as the most rested; people already coming up soon go later.
  return copy.sort((a, b) => (b.daysSince ?? 10_000) - (a.daysSince ?? 10_000) || a.upcoming - b.upcoming || name(a, b));
}

/** How many services of each kind there were in the period (for context beside a person's own counts). */
export function typeTotals(events: ScheduleEvent[], choiceKey: string | null, today: string, periodDays: number): Map<string, number> {
  const out = new Map<string, number>();
  if (!choiceKey) return out;
  const since = addDays(today, -periodDays);
  for (const e of events) {
    const v = e.fields?.[choiceKey];
    if (v && e.starts_on >= since && e.starts_on <= today) out.set(v, (out.get(v) ?? 0) + 1);
  }
  return out;
}
