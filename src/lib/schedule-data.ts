import { addDays, type LogEntry, type Person, type ScheduleEvent } from "./schedule";
import { STARTER_AS_COLUMNS, type ColumnKind, type ScheduleColumn } from "./schedule-columns";
import { cleanMinistries } from "./ministries";
import { createClient } from "./supabase/server";
import { getUserId } from "./church";

/** Reading the schedule. The changes themselves are in app/(app)/schedule/actions.ts. */

const PERSON_COLUMNS = "id, first_name, last_name, ministries, user_id";

const toPerson = (row: Person): Person => ({ ...row, ministries: cleanMinistries(row.ministries) });

/** Everyone who can be scheduled, by name. Empty when the schedule update hasn't been run. */
export async function listPeople(): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").select(PERSON_COLUMNS).order("first_name", { ascending: true }).order("last_name", { ascending: true });
  if (error) {
    console.error("listPeople failed:", error.message);
    return [];
  }
  return ((data as Person[] | null) ?? []).map(toPerson);
}

/** The people not linked to an account yet, for linking one to someone who has just applied. */
export async function listUnlinkedPeople(): Promise<Person[]> {
  return (await listPeople()).filter((p) => p.user_id === null);
}

/** The signed-in person's own entry on the people list. */
export async function getMyPersonId(): Promise<string | null> {
  const user = await getUserId();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("id").eq("user_id", user).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

const COLUMN_FIELDS = "id, key, label, kind, section, options, ministries, optional, position, archived";

/** The church's schedule columns, hidden ones included (they keep their history). The starter set until the update has been run. */
export async function listColumns(): Promise<ScheduleColumn[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("schedule_columns").select(COLUMN_FIELDS).order("position", { ascending: true }).limit(100);
  if (error) {
    console.error("listColumns failed:", error.message);
    return STARTER_AS_COLUMNS;
  }
  const rows = (data as (Omit<ScheduleColumn, "kind"> & { kind: string })[] | null) ?? [];
  if (rows.length === 0) return STARTER_AS_COLUMNS;
  return rows.map((r) => ({ ...r, kind: (["people", "choice", "text"].includes(r.kind) ? r.kind : "people") as ColumnKind, ministries: cleanMinistries(r.ministries) }));
}

const EVENT_FIELDS = "id, kind, title, starts_on, starts_at, location, notes, created_by, fields, schedule_assignments(id, person_id, role, note)";
// Before the columns update has been run there is no `fields` column yet; the schedule still loads without it.
const EVENT_FIELDS_BEFORE_COLUMNS = EVENT_FIELDS.replace(" fields,", "");

type EventRow = Omit<ScheduleEvent, "assignments"> & { schedule_assignments: { id: string; person_id: string; role: string; note: string }[] | null };

const toEvent = ({ schedule_assignments, ...e }: EventRow): ScheduleEvent => ({
  ...e,
  fields: e.fields && typeof e.fields === "object" ? e.fields : {},
  assignments: (schedule_assignments ?? []).map((a) => ({ id: a.id, person_id: a.person_id, role: a.role, note: a.note })),
});

/** Events between two dates (inclusive), each with who is on it. */
export async function listEvents(from: string, to: string): Promise<ScheduleEvent[]> {
  const supabase = await createClient();
  const load = (columns: string) =>
    supabase.from("schedule_events").select(columns).gte("starts_on", from).lte("starts_on", to).order("starts_on", { ascending: true }).limit(1000);
  let { data, error } = await load(EVENT_FIELDS);
  if (error) ({ data, error } = await load(EVENT_FIELDS_BEFORE_COLUMNS));
  if (error) {
    console.error("listEvents failed:", error.message);
    return [];
  }
  return ((data as unknown as EventRow[] | null) ?? []).map(toEvent);
}

/** A setlist that is linked to an event on the schedule. */
export type LinkedSetlist = { id: string; name: string; service_date: string | null; event_id: string };

/** The setlists that are linked to a service or event, for showing them on the schedule. Empty before the schedule update has been run. */
export async function listSetlistLinks(): Promise<LinkedSetlist[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("setlists")
    .select("id, name, service_date, event_id")
    .not("event_id", "is", null)
    .gt("expires_at", new Date().toISOString())
    .limit(500);
  if (error) {
    console.error("listSetlistLinks failed:", error.message);
    return [];
  }
  return (data as LinkedSetlist[] | null) ?? [];
}

/** A service or event a setlist can be linked to. */
export type EventChoice = { id: string; kind: "sunday" | "event"; title: string; starts_on: string };

/** The services and events around now (a little behind, a few months ahead), for choosing which one a setlist is for. */
export async function listEventChoices(from: string, to: string): Promise<EventChoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_events")
    .select("id, kind, title, starts_on")
    .gte("starts_on", from)
    .lte("starts_on", to)
    .order("starts_on", { ascending: true })
    .limit(120);
  if (error) {
    console.error("listEventChoices failed:", error.message);
    return [];
  }
  return (data as EventChoice[] | null) ?? [];
}

/** The most recent changes to the schedule, newest first. */
export async function listLog(limit = 200): Promise<LogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_log")
    .select("id, actor_name, action, summary, created_at, event_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listLog failed:", error.message);
    return [];
  }
  return (data as LogEntry[] | null) ?? [];
}

/** The window the schedule page loads: a year of the past (for "last served" and the counts) and a year ahead. */
export function scheduleWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -366), to: addDays(today, 400) };
}

/** The event a setlist is for, with who is on it, or null when it isn't linked to one (or the update hasn't been run). */
export async function getSetlistTeam(setlistId: string): Promise<ScheduleEvent | null> {
  const supabase = await createClient();
  const { data: link, error } = await supabase.from("setlists").select("event_id").eq("id", setlistId).maybeSingle<{ event_id: string | null }>();
  if (error || !link?.event_id) return null;
  const load = (columns: string) => supabase.from("schedule_events").select(columns).eq("id", link.event_id as string).maybeSingle();
  const first = await load(EVENT_FIELDS);
  const { data } = first.error ? await load(EVENT_FIELDS_BEFORE_COLUMNS) : first;
  const row = data as unknown as EventRow | null;
  return row ? toEvent(row) : null;
}
