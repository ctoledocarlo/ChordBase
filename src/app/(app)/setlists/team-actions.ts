"use server";

import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/church";
import { deriveSong } from "@/lib/setlist-derive";
import { normalizeSettings } from "@/lib/setlist-settings";
import {
  MAX_NOTE,
  MAX_TASK,
  MAX_VIEW_NAME,
  DEFAULT_TASKS,
  NOTE_COLUMNS,
  TASK_COLUMNS,
  VIEW_COLUMNS,
  type SetlistNote,
  type SetlistTask,
  type SetlistView,
} from "@/lib/setlist-team";
import { createClient } from "@/lib/supabase/server";

const NOT_SIGNED_IN = "You're not signed in to a church.";

/** The id a browser tab makes up for itself, saved with a change so that tab can ignore its own echo. */
const screenId = (id: string | undefined) => (typeof id === "string" && id.length > 0 ? id.slice(0, 64) : null);

type Failure = { error: string };
const fail = (error: string): Failure => ({ error });

/** The next free place in a list, counting on from the highest. */
async function nextPosition(table: "setlist_views" | "setlist_tasks", setlistId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("position").eq("setlist_id", setlistId).order("position", { ascending: false }).limit(1);
  const top = (data as { position: number }[] | null)?.[0]?.position;
  return typeof top === "number" ? top + 1 : 0;
}

// ---- Views for each instrument ----------------------------------------------------------------------------

/** Adds a view for an instrument ("Drums") to a setlist. */
export async function addView(setlistId: string, name: string, showChords: boolean, clientId?: string): Promise<{ view: SetlistView } | Failure> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > MAX_VIEW_NAME) return fail(`Give it a name up to ${MAX_VIEW_NAME} characters.`);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("setlist_views").select("name").eq("setlist_id", setlistId);
  if ((existing as { name: string }[] | null)?.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())) {
    return fail(`There is already a view called “${trimmed}”.`);
  }
  const { data, error } = await supabase
    .from("setlist_views")
    .insert({ setlist_id: setlistId, name: trimmed, kind: "instrument", show_chords: !!showChords, position: await nextPosition("setlist_views", setlistId), edited_by: screenId(clientId) })
    .select(VIEW_COLUMNS)
    .single<SetlistView>();
  if (error || !data) return fail("Couldn't add that view. Please try again.");
  return { view: data };
}

/** Renames a view, or turns its chords on or off. */
export async function updateView(viewId: string, patch: { name?: string; show_chords?: boolean }, clientId?: string): Promise<{ error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const fields: { name?: string; show_chords?: boolean; edited_by: string | null } = { edited_by: screenId(clientId) };
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed || trimmed.length > MAX_VIEW_NAME) return fail(`Give it a name up to ${MAX_VIEW_NAME} characters.`);
    fields.name = trimmed;
  }
  if (patch.show_chords !== undefined) fields.show_chords = !!patch.show_chords;
  const supabase = await createClient();
  const { error } = await supabase.from("setlist_views").update(fields).eq("id", viewId);
  return error ? fail("Couldn't save that. Please try again.") : {};
}

/** Removes an instrument's view, with its notes and tasks. The shared "Everyone" view can't be removed. */
export async function deleteView(viewId: string): Promise<{ error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const supabase = await createClient();
  const { error } = await supabase.from("setlist_views").delete().eq("id", viewId).eq("kind", "instrument");
  return error ? fail("Couldn't remove that view.") : {};
}

// ---- Notes -----------------------------------------------------------------------------------------------

/** Saves the note for one song on one view. An empty note removes it. */
export async function saveNote(
  setlistId: string,
  itemId: string,
  viewId: string,
  body: string,
  clientId?: string,
): Promise<{ note: SetlistNote | null } | Failure> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  if (typeof body !== "string" || body.length > MAX_NOTE) return fail(`Keep a note under ${MAX_NOTE} characters.`);
  const supabase = await createClient();
  if (body.trim() === "") {
    const { error } = await supabase.from("setlist_notes").delete().eq("item_id", itemId).eq("view_id", viewId);
    return error ? fail("Couldn't clear that note.") : { note: null };
  }
  const { data, error } = await supabase
    .from("setlist_notes")
    .upsert(
      { setlist_id: setlistId, item_id: itemId, view_id: viewId, body: body.replace(/\r\n?/g, "\n"), edited_by: screenId(clientId) },
      { onConflict: "item_id,view_id" },
    )
    .select(NOTE_COLUMNS)
    .single<SetlistNote>();
  if (error || !data) return fail("Couldn't save that note.");
  return { note: data };
}

// ---- The pre-service checklist ----------------------------------------------------------------------------

export async function addTask(setlistId: string, label: string, viewId: string | null, clientId?: string): Promise<{ task: SetlistTask } | Failure> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const trimmed = typeof label === "string" ? label.trim() : "";
  if (!trimmed || trimmed.length > MAX_TASK) return fail(`Keep it under ${MAX_TASK} characters.`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("setlist_tasks")
    .insert({ setlist_id: setlistId, view_id: viewId, label: trimmed, position: await nextPosition("setlist_tasks", setlistId), edited_by: screenId(clientId) })
    .select(TASK_COLUMNS)
    .single<SetlistTask>();
  if (error || !data) return fail("Couldn't add that. Please try again.");
  return { task: data };
}

/** Starts a checklist with the usual items. */
export async function addDefaultTasks(setlistId: string, clientId?: string): Promise<{ tasks: SetlistTask[] } | Failure> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const supabase = await createClient();
  const start = await nextPosition("setlist_tasks", setlistId);
  const { data, error } = await supabase
    .from("setlist_tasks")
    .insert(DEFAULT_TASKS.map((label, i) => ({ setlist_id: setlistId, view_id: null, label, position: start + i, edited_by: screenId(clientId) })))
    .select(TASK_COLUMNS);
  if (error || !data) return fail("Couldn't add the usual list. Please try again.");
  return { tasks: data as SetlistTask[] };
}

/** Ticks or unticks an item, noting who did it (the name of their view). */
export async function setTaskDone(taskId: string, done: boolean, by: string | null, clientId?: string): Promise<{ error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const supabase = await createClient();
  const { error } = await supabase
    .from("setlist_tasks")
    .update({
      done: !!done,
      done_by: done ? (typeof by === "string" ? by.slice(0, 40) : null) : null,
      done_at: done ? new Date().toISOString() : null,
      edited_by: screenId(clientId),
    })
    .eq("id", taskId);
  return error ? fail("Couldn't save that. Please try again.") : {};
}

export async function deleteTask(taskId: string): Promise<{ error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const supabase = await createClient();
  const { error } = await supabase.from("setlist_tasks").delete().eq("id", taskId);
  return error ? fail("Couldn't remove that.") : {};
}

// ---- The service timer ------------------------------------------------------------------------------------

/** Sets when the set should end (every screen counts down to it), or clears the timer with null. */
export async function setServiceTimer(setlistId: string, endsAt: string | null, clientId?: string): Promise<{ error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  if (endsAt !== null && (typeof endsAt !== "string" || Number.isNaN(Date.parse(endsAt)))) return fail("That time isn't valid.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("setlists")
    .update({ timer_ends_at: endsAt, timer_started_at: endsAt ? new Date().toISOString() : null, edited_by: screenId(clientId) })
    .eq("id", setlistId);
  return error ? fail("Couldn't set the timer. Please try again.") : {};
}

// ---- Singers ---------------------------------------------------------------------------------------------

/** Who sings a song in this setlist (a singer's id), or nobody with null. */
export async function setItemSinger(itemId: string, singerId: string | null, clientId?: string): Promise<{ error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const supabase = await createClient();
  const { error } = await supabase.from("setlist_items").update({ singer_id: singerId, edited_by: screenId(clientId) }).eq("id", itemId);
  return error ? fail("Couldn't save that. Please try again.") : {};
}

// ---- History ----------------------------------------------------------------------------------------------

/** Writes every song of a setlist to the history, for a service that wasn't run through Go live. */
export async function addServiceToHistory(setlistId: string, localDay: string): Promise<{ added?: number; error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDay)) return fail("That date isn't valid.");
  const supabase = await createClient();
  const [{ data: setlist }, { data: items }] = await Promise.all([
    supabase.from("setlists").select("name, service_date").eq("id", setlistId).maybeSingle<{ name: string; service_date: string | null }>(),
    supabase.from("setlist_items").select("song_id, settings, songs(original_key, default_capo)").eq("setlist_id", setlistId),
  ]);
  if (!setlist || !items) return fail("That setlist no longer exists.");
  const day = setlist.service_date ?? localDay;
  type Row = { song_id: string; settings: unknown; songs: { original_key: string; default_capo: number } | null };
  const rows = (items as unknown as Row[]).map((i) => ({
    song_id: i.song_id,
    played_on: day,
    setlist_name: setlist.name,
    key: i.songs ? deriveSong(i.songs.original_key, normalizeSettings(i.settings, i.songs.default_capo)).soundingKey : "",
  }));
  if (rows.length === 0) return { added: 0 };
  const { error } = await supabase.from("song_history").upsert(rows, { onConflict: "song_id,played_on", ignoreDuplicates: true });
  if (error) return fail("Couldn't save to the history. Please try again.");
  revalidatePath("/songs/history");
  return { added: rows.length };
}
