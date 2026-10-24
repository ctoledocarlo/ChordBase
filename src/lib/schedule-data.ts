import { addDays, type LogEntry, type Person, type ScheduleEvent } from "./schedule";
import { isScheduleRole } from "./schedule-roles";
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

type EventRow = Omit<ScheduleEvent, "assignments"> & { schedule_assignments: { id: string; person_id: string; role: string; note: string }[] | null };

/** Events between two dates (inclusive), each with who is on it. */
export async function listEvents(from: string, to: string): Promise<ScheduleEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_events")
    .select("id, kind, title, starts_on, starts_at, location, notes, created_by, schedule_assignments(id, person_id, role, note)")
    .gte("starts_on", from)
    .lte("starts_on", to)
    .order("starts_on", { ascending: true })
    .limit(1000);
  if (error) {
    console.error("listEvents failed:", error.message);
    return [];
  }
  return ((data as unknown as EventRow[] | null) ?? []).map(({ schedule_assignments, ...e }) => ({
    ...e,
    assignments: (schedule_assignments ?? []).filter((a) => isScheduleRole(a.role)).map((a) => ({ id: a.id, person_id: a.person_id, role: a.role as never, note: a.note })),
  }));
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

/** The window the schedule page loads: a little of the past (so "earlier" works) and a year ahead. */
export function scheduleWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -60), to: addDays(today, 400) };
}

/** The event a setlist is for, with who is on it, or null when it isn't linked to one (or the update hasn't been run). */
export async function getSetlistTeam(setlistId: string): Promise<ScheduleEvent | null> {
  const supabase = await createClient();
  const { data: link, error } = await supabase.from("setlists").select("event_id").eq("id", setlistId).maybeSingle<{ event_id: string | null }>();
  if (error || !link?.event_id) return null;
  const { data } = await supabase
    .from("schedule_events")
    .select("id, kind, title, starts_on, starts_at, location, notes, created_by, schedule_assignments(id, person_id, role, note)")
    .eq("id", link.event_id)
    .maybeSingle();
  const row = data as unknown as EventRow | null;
  if (!row) return null;
  const { schedule_assignments, ...e } = row;
  return {
    ...e,
    assignments: (schedule_assignments ?? []).filter((a) => isScheduleRole(a.role)).map((a) => ({ id: a.id, person_id: a.person_id, role: a.role as never, note: a.note })),
  };
}
