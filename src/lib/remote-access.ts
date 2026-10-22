import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isUuid, remoteCookie, verifyRemote } from "./remote-token";
import { NOTE_COLUMNS, TASK_COLUMNS, VIEW_COLUMNS, type SetlistNote, type SetlistTask, type SetlistView, type TeamExtras } from "./setlist-team";
import { CHAT_HISTORY, MESSAGE_COLUMNS, toItem, type ChatMessage, type Setlist, type SetlistItem } from "./setlists";
import { serviceClient, serviceKey } from "./supabase/service";

/**
 * What a phone that joined with the PIN is allowed to touch. Nobody is signed in, so the database's row level
 * security can't do the limiting: this does. Every request first proves the phone holds a good ticket for
 * one setlist, and everything it then reads or changes is limited to that setlist.
 */

export type RemoteSetlist = Setlist & { church_id: string; remote_pin: string };
export type Access = { db: SupabaseClient; setlist: RemoteSetlist };
export type RemoteState = { setlist: Setlist; items: SetlistItem[]; messages: ChatMessage[]; extras: TeamExtras };

/** "unavailable": this server can't run the remote. "denied": no good ticket (never joined, PIN changed, switched off, or the setlist is gone). */
export type Refusal = "unavailable" | "denied";

const SETLIST_COLUMNS = "id, church_id, name, service_date, expires_at, active_item_id, timer_ends_at, remote_pin";

export async function remoteAccess(setlistId: unknown): Promise<{ access: Access } | { refusal: Refusal }> {
  const db = serviceClient();
  const secret = serviceKey();
  if (!db || !secret) return { refusal: "unavailable" };
  if (!isUuid(setlistId)) return { refusal: "denied" };

  const ticket = (await cookies()).get(remoteCookie(setlistId))?.value;
  // Without a ticket there is nothing to look up.
  if (!ticket) return { refusal: "denied" };

  const { data, error } = await db.from("setlists").select(SETLIST_COLUMNS).eq("id", setlistId).maybeSingle<RemoteSetlist | (Omit<RemoteSetlist, "remote_pin"> & { remote_pin: null })>();
  if (error) {
    console.error("remoteAccess failed:", error.message);
    return { refusal: "unavailable" };
  }
  if (!data || !data.remote_pin || Date.parse(data.expires_at) <= Date.now()) return { refusal: "denied" };
  if (!verifyRemote(secret, ticket, setlistId, data.remote_pin, Date.now())) return { refusal: "denied" };
  return { access: { db, setlist: data as RemoteSetlist } };
}

/** The setlist as the phone shows it: the songs (without their chords, which the remote doesn't need), the chat, the notes and the checklist. */
export async function readRemoteState({ db, setlist }: Access): Promise<RemoteState> {
  const id = setlist.id;
  const [items, messages, views, notes, tasks] = await Promise.all([
    db
      .from("setlist_items")
      .select("id, song_id, position, settings, songs(title, artist, original_key, default_capo, tempo)")
      .eq("setlist_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    db.from("setlist_messages").select(MESSAGE_COLUMNS).eq("setlist_id", id).order("created_at", { ascending: false }).limit(CHAT_HISTORY),
    db.from("setlist_views").select(VIEW_COLUMNS).eq("setlist_id", id).order("position", { ascending: true }).order("created_at", { ascending: true }),
    db.from("setlist_notes").select(NOTE_COLUMNS).eq("setlist_id", id),
    db.from("setlist_tasks").select(TASK_COLUMNS).eq("setlist_id", id).order("position", { ascending: true }).order("created_at", { ascending: true }),
  ]);

  type Row = Parameters<typeof toItem>[0] & { songs: { title: string; artist: string; original_key: string; default_capo: number; tempo: number | null } | null };
  const list = ((items.data as unknown as Row[] | null) ?? [])
    .map((row) => toItem({ ...row, songs: row.songs && { ...row.songs, body: "" } }))
    .filter((i): i is SetlistItem => i !== null);

  return {
    setlist: {
      id,
      name: setlist.name,
      service_date: setlist.service_date,
      expires_at: setlist.expires_at,
      active_item_id: setlist.active_item_id,
      timer_ends_at: setlist.timer_ends_at ?? null,
    },
    items: list,
    messages: ((messages.data as ChatMessage[] | null) ?? []).reverse(),
    // The team tables may not exist yet (the update hasn't been run): the remote still works without them.
    extras: {
      views: (views.data as SetlistView[] | null) ?? [],
      notes: (notes.data as SetlistNote[] | null) ?? [],
      tasks: (tasks.data as SetlistTask[] | null) ?? [],
    },
  };
}
