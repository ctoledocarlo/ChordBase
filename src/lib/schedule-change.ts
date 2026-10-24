import type { LinkedSetlist } from "./schedule-data";
import type { Person, ScheduleEvent } from "./schedule";
import { slugKey, type ScheduleColumn } from "./schedule-columns";

/**
 * Changes to the schedule as plain functions on the data the page shows. The page applies one the moment someone acts,
 * so the screen answers at once, and asks the server to make the same change in the background. Each function returns
 * a new copy and never touches the one it was given. A change made twice leaves the same result as once.
 */

export type ScheduleData = { events: ScheduleEvent[]; people: Person[]; columns: ScheduleColumn[]; links: LinkedSetlist[] };

/** An event (by id) or a Sunday that may not be saved yet (by its date). */
export type Target = { eventId: string } | { sunday: string };

export const isTemp = (id: string) => id.startsWith("tmp-");

let counter = 0;
/** An id for something the server hasn't made yet. */
export const tempId = (kind: string) => `tmp-${kind}-${++counter}`;
export const tempSunday = (date: string) => `tmp-sun-${date}`;

/** The date of a Sunday that hasn't been saved: "tmp-sun-2026-11-01" is "2026-11-01". */
export const sundayOf = (id: string): string | null => (id.startsWith("tmp-sun-") ? id.slice("tmp-sun-".length) : null);

const newSunday = (date: string): ScheduleEvent => ({ id: tempSunday(date), kind: "sunday", title: "Sunday service", starts_on: date, starts_at: null, location: "", notes: "", created_by: null, fields: {}, assignments: [] });

/** The event a target means, if it is there. */
export function findEvent(d: ScheduleData, t: Target): ScheduleEvent | undefined {
  return "eventId" in t ? d.events.find((e) => e.id === t.eventId) : d.events.find((e) => e.kind === "sunday" && e.starts_on === t.sunday);
}

/** Changes the event a target means. A Sunday that isn't there yet is made first. */
function onEvent(d: ScheduleData, t: Target, change: (e: ScheduleEvent) => ScheduleEvent): ScheduleData {
  const found = findEvent(d, t);
  if (found) return { ...d, events: d.events.map((e) => (e === found ? change(e) : e)) };
  if ("sunday" in t) return { ...d, events: [...d.events, change(newSunday(t.sunday))] };
  return d;
}

/** The person is on the column, replacing whoever was there. */
export function assign(d: ScheduleData, t: Target, personId: string, role: string, id = tempId("a")): ScheduleData {
  return onEvent(d, t, (e) => {
    if (e.assignments.some((a) => a.person_id === personId && a.role === role)) return e;
    return { ...e, assignments: [...e.assignments.filter((a) => a.role !== role), { id, person_id: personId, role, note: "" }] };
  });
}

export function unassign(d: ScheduleData, assignmentId: string): ScheduleData {
  return { ...d, events: d.events.map((e) => (e.assignments.some((a) => a.id === assignmentId) ? { ...e, assignments: e.assignments.filter((a) => a.id !== assignmentId) } : e)) };
}

export function setField(d: ScheduleData, t: Target, key: string, value: string): ScheduleData {
  return onEvent(d, t, (e) => {
    const fields = { ...e.fields };
    if (value.trim()) fields[key] = value.trim();
    else delete fields[key];
    return { ...e, fields };
  });
}

/** The setlist is linked to the event. A service has one setlist, so any other one is unlinked. */
export function linkSetlist(d: ScheduleData, t: Target, setlist: { id: string; name: string; service_date: string | null }): ScheduleData {
  const withEvent = onEvent(d, t, (e) => e);
  const event = findEvent(withEvent, t);
  if (!event) return d;
  const link: LinkedSetlist = { id: setlist.id, name: setlist.name, service_date: setlist.service_date ?? event.starts_on, event_id: event.id };
  return { ...withEvent, links: [...withEvent.links.filter((l) => l.id !== setlist.id && l.event_id !== event.id), link] };
}

export const unlinkSetlist = (d: ScheduleData, setlistId: string): ScheduleData => ({ ...d, links: d.links.filter((l) => l.id !== setlistId) });

/** What the server called an event the page made up an id for. */
export function renameEvent(d: ScheduleData, from: string, to: string): ScheduleData {
  if (from === to) return d;
  return { ...d, events: d.events.map((e) => (e.id === from ? { ...e, id: to } : e)), links: d.links.map((l) => (l.event_id === from ? { ...l, event_id: to } : l)) };
}

export function renameAssignment(d: ScheduleData, from: string, to: string): ScheduleData {
  return { ...d, events: d.events.map((e) => (e.assignments.some((a) => a.id === from) ? { ...e, assignments: e.assignments.map((a) => (a.id === from ? { ...a, id: to } : a)) } : e)) };
}

export type EventInput = { title: string; date: string; time: string; location: string; notes: string };

export function addEvent(d: ScheduleData, id: string, input: EventInput, createdBy: string | null): ScheduleData {
  const event: ScheduleEvent = { id, kind: "event", title: input.title, starts_on: input.date, starts_at: input.time ? `${input.time}:00` : null, location: input.location, notes: input.notes, created_by: createdBy, fields: {}, assignments: [] };
  return { ...d, events: [...d.events, event] };
}

/** A Sunday service keeps its name and date; the rest can change. */
export function updateEvent(d: ScheduleData, id: string, input: EventInput): ScheduleData {
  return {
    ...d,
    events: d.events.map((e) =>
      e.id === id ? { ...e, title: e.kind === "sunday" ? e.title : input.title, starts_on: e.kind === "sunday" ? e.starts_on : input.date, starts_at: input.time ? `${input.time}:00` : null, location: input.location, notes: input.notes } : e,
    ),
  };
}

/** The time, place and notes of a Sunday that may not be saved yet (its name and date stay). */
export function updateSunday(d: ScheduleData, date: string, input: EventInput): ScheduleData {
  return onEvent(d, { sunday: date }, (e) => ({ ...e, starts_at: input.time ? `${input.time}:00` : null, location: input.location, notes: input.notes }));
}

export const deleteEvent = (d: ScheduleData, id: string): ScheduleData => ({ ...d, events: d.events.filter((e) => e.id !== id), links: d.links.filter((l) => l.event_id !== id) });

// ---- People ----------------------------------------------------------------------------------------------------------

export const addPerson = (d: ScheduleData, person: Person): ScheduleData => ({ ...d, people: [...d.people, person] });

export const updatePerson = (d: ScheduleData, id: string, change: Pick<Person, "first_name" | "last_name" | "ministries">): ScheduleData => ({ ...d, people: d.people.map((p) => (p.id === id ? { ...p, ...change } : p)) });

export const renamePerson = (d: ScheduleData, from: string, to: string): ScheduleData => ({
  ...d,
  people: d.people.map((p) => (p.id === from ? { ...p, id: to } : p)),
  events: d.events.map((e) => (e.assignments.some((a) => a.person_id === from) ? { ...e, assignments: e.assignments.map((a) => (a.person_id === from ? { ...a, person_id: to } : a)) } : e)),
});

/** A person taken off the list is taken off every event. */
export const deletePerson = (d: ScheduleData, id: string): ScheduleData => ({
  ...d,
  people: d.people.filter((p) => p.id !== id),
  events: d.events.map((e) => (e.assignments.some((a) => a.person_id === id) ? { ...e, assignments: e.assignments.filter((a) => a.person_id !== id) } : e)),
});

// ---- Columns ---------------------------------------------------------------------------------------------------------

export type ColumnDraft = Pick<ScheduleColumn, "label" | "kind" | "section" | "options" | "ministries" | "optional">;

export function addColumn(d: ScheduleData, id: string, draft: ColumnDraft): ScheduleData {
  const taken = new Set(d.columns.map((c) => c.key));
  const base = slugKey(draft.label);
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base.slice(0, 36)}-${n}`;
  const position = Math.max(0, ...d.columns.map((c) => c.position)) + 10;
  const column: ScheduleColumn = { id, key, ...draft, options: draft.kind === "choice" ? draft.options : [], ministries: draft.kind === "people" ? draft.ministries : [], optional: draft.kind === "people" && draft.optional, position, archived: false };
  return { ...d, columns: [...d.columns, column] };
}

export const updateColumn = (d: ScheduleData, id: string, draft: Omit<ColumnDraft, "kind">): ScheduleData => ({
  ...d,
  columns: d.columns.map((c) => (c.id === id ? { ...c, label: draft.label, section: draft.section, options: c.kind === "choice" ? draft.options : [], ministries: c.kind === "people" ? draft.ministries : [], optional: c.kind === "people" && draft.optional } : c)),
});

/** Moves a column one place earlier (-1) or later (1) among the columns under the same heading. */
export function moveColumn(d: ScheduleData, id: string, direction: -1 | 1): ScheduleData {
  const col = d.columns.find((c) => c.id === id);
  if (!col) return d;
  const siblings = d.columns.filter((c) => !c.archived && c.section === col.section).sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
  const at = siblings.findIndex((c) => c.id === id);
  const other = siblings[at + direction];
  if (!other) return d;
  return { ...d, columns: d.columns.map((c) => (c.id === col.id ? { ...c, position: other.position } : c.id === other.id ? { ...c, position: col.position } : c)) };
}

export const archiveColumn = (d: ScheduleData, id: string, archived: boolean): ScheduleData => ({ ...d, columns: d.columns.map((c) => (c.id === id ? { ...c, archived } : c)) });

/** A deleted column takes everyone put on it, and its values, with it. */
export function deleteColumn(d: ScheduleData, id: string): ScheduleData {
  const col = d.columns.find((c) => c.id === id);
  if (!col) return d;
  return {
    ...d,
    columns: d.columns.filter((c) => c.id !== id),
    events: d.events.map((e) => {
      const hasField = col.key in e.fields;
      const hasPeople = e.assignments.some((a) => a.role === col.key);
      if (!hasField && !hasPeople) return e;
      const fields = { ...e.fields };
      delete fields[col.key];
      return { ...e, fields, assignments: e.assignments.filter((a) => a.role !== col.key) };
    }),
  };
}

export const renameColumn = (d: ScheduleData, from: string, to: { id: string; key: string }): ScheduleData => ({ ...d, columns: d.columns.map((c) => (c.id === from ? { ...c, id: to.id, key: to.key } : c)) });
