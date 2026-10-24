"use server";

import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/church";
import { cleanMinistries, MAX_NAME } from "@/lib/ministries";
import { isIsoDate } from "@/lib/schedule";
import { MAX_IMPORT_ROWS, type ImportRow } from "@/lib/schedule-grid";
import { isScheduleRole } from "@/lib/schedule-roles";
import { createClient } from "@/lib/supabase/server";

/**
 * Changing the schedule. Each call asks a database function to do it, and the function checks who is asking and
 * writes the change log; these checks only give a friendlier answer sooner.
 */

const NOT_SIGNED_IN = "Sign in first.";
const NEEDS_UPDATE = "The schedule needs the latest database update (run migration 20261103000000_schedule.sql).";

export type ScheduleResult =
  | { ok: true; event_id?: string; already?: boolean; events?: number; assignments?: number; created_people?: number; unknown?: string[]; skipped_rows?: number }
  | { error: string };
type Result = ScheduleResult;

function answer(data: unknown, error: { code?: string; message: string } | null): Result {
  if (error) {
    console.error("schedule call failed:", error.message);
    return { error: error.code === "PGRST202" || error.code === "42883" ? NEEDS_UPDATE : "Something went wrong. Please try again." };
  }
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  return r.ok ? (r as Result) : { error: r.error ?? "Something went wrong. Please try again." };
}

async function call(name: string, args: Record<string, unknown>, paths: string[] = ["/schedule"]): Promise<Result> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  const res = answer(data, error);
  if ("ok" in res) for (const p of paths) revalidatePath(p);
  return res;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Makes a Sunday's service on the schedule (it exists as soon as someone is put on it). */
export async function ensureSunday(date: string): Promise<Result> {
  if (!isIsoDate(date)) return { error: "That isn't a date." };
  return call("schedule_ensure_sunday", { p_date: date }, []);
}

export async function addEvent(title: string, date: string, time: string, location: string, notes: string): Promise<Result> {
  if (!isIsoDate(date)) return { error: "Choose a date." };
  return call("schedule_add_event", { p_title: text(title, 80), p_date: date, p_time: text(time, 5), p_location: text(location, 120), p_notes: text(notes, 1000) });
}

export async function updateEvent(id: string, title: string, date: string, time: string, location: string, notes: string): Promise<Result> {
  if (!isIsoDate(date)) return { error: "Choose a date." };
  return call("schedule_update_event", { p_id: id, p_title: text(title, 80), p_date: date, p_time: text(time, 5), p_location: text(location, 120), p_notes: text(notes, 1000) }, ["/schedule", "/setlists"]);
}

export async function deleteEvent(id: string): Promise<Result> {
  return call("schedule_delete_event", { p_id: id }, ["/schedule", "/setlists"]);
}

/** Puts a person on a role for an event. */
export async function assignPerson(eventId: string, personId: string, role: string): Promise<Result> {
  if (!isScheduleRole(role)) return { error: "Choose a role." };
  return call("schedule_assign", { p_event: eventId, p_person: personId, p_role: role }, ["/schedule", "/setlists"]);
}

/** Puts a person on a role for a Sunday that may not be on the schedule yet: it is made first. */
export async function assignToSunday(date: string, personId: string, role: string): Promise<Result> {
  const made = await ensureSunday(date);
  if ("error" in made) return made;
  return assignPerson(made.event_id ?? "", personId, role);
}

export async function unassign(assignmentId: string): Promise<Result> {
  return call("schedule_unassign", { p_id: assignmentId }, ["/schedule", "/setlists"]);
}

export async function addPerson(first: string, last: string, ministries: string[]): Promise<Result> {
  return call("people_add", { p_first: text(first, MAX_NAME), p_last: text(last, MAX_NAME), p_ministries: cleanMinistries(ministries) });
}

export async function updatePerson(id: string, first: string, last: string, ministries: string[]): Promise<Result> {
  return call("people_update", { p_id: id, p_first: text(first, MAX_NAME), p_last: text(last, MAX_NAME), p_ministries: cleanMinistries(ministries) });
}

export async function deletePerson(id: string): Promise<Result> {
  return call("people_delete", { p_id: id });
}

/** Adds what an Excel file holds (it was read in the browser). It only adds, and can add unknown names as people. */
export async function importSchedule(rows: ImportRow[], createPeople: boolean): Promise<Result> {
  if (!Array.isArray(rows) || rows.length === 0) return { error: "There is nothing to import." };
  if (rows.length > MAX_IMPORT_ROWS) return { error: `Up to ${MAX_IMPORT_ROWS} rows can be imported at once.` };
  const clean = rows.map((r) => ({
    date: isIsoDate(r?.date) ? r.date : "",
    title: text(r?.title, 80),
    time: text(r?.time, 5),
    location: text(r?.location, 120),
    notes: text(r?.notes, 1000),
    assign: Object.fromEntries(
      Object.entries(r?.assign ?? {})
        .filter(([role, names]) => isScheduleRole(role) && Array.isArray(names))
        .map(([role, names]) => [role, (names as unknown[]).slice(0, 40).map((n) => text(n, 120)).filter(Boolean)]),
    ),
  }));
  return call("schedule_import", { p_rows: clean, p_create_people: !!createPeople }, ["/schedule", "/setlists"]);
}

/** Points a setlist at the event it is for (the one on its date, or one chosen), making one if asked. */
export async function linkSetlistEvent(setlistId: string, eventId: string | null, create: boolean): Promise<Result> {
  return call("setlist_link_event", { p_setlist: setlistId, p_event: eventId, p_create: !!create }, ["/schedule", `/setlists/${setlistId}`]);
}
