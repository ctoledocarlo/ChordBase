"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentChurch } from "@/lib/church";
import { DEFAULT_KEEP_MONTHS, expiryFrom, isKeepMonths } from "@/lib/setlist-expiry";
import { defaultSettings, validSettings } from "@/lib/setlist-settings";
import {
  ITEM_COLUMNS,
  MESSAGE_COLUMNS,
  getSetlist,
  listMessages,
  toItem,
  type ChatMessage,
  type Setlist,
  type SetlistItem,
} from "@/lib/setlists";
import type { PresetSettings } from "@/lib/songs";
import { createClient } from "@/lib/supabase/server";

export type SetlistResult = { error?: string };

const NOT_SIGNED_IN = "You're not signed in to a church.";

/** The id a browser tab makes up for itself, saved with a change so that tab can ignore its own echo. */
const screenId = (id: string | undefined) => (typeof id === "string" && id.length > 0 ? id.slice(0, 64) : null);

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

/** A date from a date input ("2026-10-18"), or null when it is empty. */
function parseDate(value: string): string | null | undefined {
  const v = value.trim();
  if (v === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined;
}

export async function createSetlist(formData: FormData) {
  const church = await getCurrentChurch();
  if (!church) redirect("/login");

  const name = text(formData, "name").trim().slice(0, 80);
  const date = parseDate(text(formData, "service_date"));
  if (!name || date === undefined) redirect("/setlists");
  const keep = Number(text(formData, "keep_months")) || DEFAULT_KEEP_MONTHS;
  if (!isKeepMonths(keep)) redirect("/setlists");

  const supabase = await createClient();
  const { data } = await supabase
    .from("setlists")
    .insert({ church_id: church.id, name, service_date: date, expires_at: expiryFrom(keep).toISOString() })
    .select("id")
    .single<{ id: string }>();
  if (!data) redirect("/setlists");

  revalidatePath("/setlists");
  redirect(`/setlists/${data.id}`);
}

/** Makes a new setlist and puts a song in it, for the "Add to setlist" button on a song. */
export async function createSetlistWithSong(
  name: string,
  serviceDate: string,
  songId: string,
  keepMonths: number = DEFAULT_KEEP_MONTHS,
): Promise<{ setlistId?: string; error?: string }> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) return { error: "Give the setlist a short name." };
  const date = parseDate(serviceDate);
  if (date === undefined) return { error: "That date isn't valid." };
  if (!isKeepMonths(keepMonths)) return { error: "A setlist can be kept for up to a year." };

  const supabase = await createClient();
  const { data } = await supabase
    .from("setlists")
    .insert({
      church_id: church.id,
      name: trimmed,
      service_date: date,
      expires_at: expiryFrom(keepMonths).toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (!data) return { error: "Couldn't create the setlist. Please try again." };

  const added = await addSetlistItem(data.id, songId, null);
  revalidatePath("/setlists");
  if (added.error && !added.item) {
    await supabase.from("setlists").delete().eq("id", data.id);
    return { error: added.error };
  }
  return { setlistId: data.id };
}

/** Puts a song at the end of an existing setlist. */
export async function addSongToSetlist(setlistId: string, songId: string): Promise<SetlistResult> {
  const added = await addSetlistItem(setlistId, songId, null);
  if (!added.item) return { error: added.error ?? "Couldn't add that song." };
  revalidatePath("/setlists");
  return {};
}

/**
 * Saves a setlist's name and date. `keepMonths` re-sets how long it is kept, counted from
 * today (1 month up to 1 year); leave it null to keep the current expiry.
 */
export async function updateSetlist(
  id: string,
  name: string,
  serviceDate: string,
  keepMonths: number | null = null,
  clientId?: string,
): Promise<SetlistResult & { expires_at?: string }> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) return { error: "Give the setlist a short name." };
  const date = parseDate(serviceDate);
  if (date === undefined) return { error: "That date isn't valid." };

  const supabase = await createClient();
  if (keepMonths !== null && !isKeepMonths(keepMonths)) return { error: "A setlist can be kept for up to a year." };
  const fields: { name: string; service_date: string | null; expires_at?: string; edited_by: string | null } = {
    name: trimmed,
    service_date: date,
    edited_by: screenId(clientId),
  };
  if (keepMonths !== null) fields.expires_at = expiryFrom(keepMonths).toISOString();
  const { error } = await supabase.from("setlists").update(fields).eq("id", id);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/setlists");
  return { expires_at: fields.expires_at };
}

export async function deleteSetlist(formData: FormData) {
  const church = await getCurrentChurch();
  if (!church) redirect("/login");
  const id = text(formData, "id");
  if (id) {
    const supabase = await createClient();
    await supabase.from("setlists").delete().eq("id", id);
  }
  revalidatePath("/setlists");
  redirect("/setlists");
}

/** Writes the order: each id gets its place in the list as its position. */
async function renumber(setlistId: string, ids: string[], clientId?: string): Promise<boolean> {
  const supabase = await createClient();
  const results = await Promise.all(
    ids.map((id, position) =>
      supabase
        .from("setlist_items")
        .update({ position, edited_by: screenId(clientId) })
        .eq("id", id)
        .eq("setlist_id", setlistId),
    ),
  );
  return results.every((r) => !r.error);
}

/**
 * Adds a song to a setlist at `index` (or at the end), starting from the song's own
 * usual key and capo. Works during a live presentation, so it only touches what it must.
 */
export async function addSetlistItem(
  setlistId: string,
  songId: string,
  index: number | null,
  clientId?: string,
): Promise<{ item?: SetlistItem; error?: string }> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };

  const supabase = await createClient();
  // RLS hides other churches' songs and setlists, so these also prove both are theirs.
  const [{ data: song }, { data: setlist }] = await Promise.all([
    supabase.from("songs").select("default_capo").eq("id", songId).maybeSingle<{ default_capo: number }>(),
    supabase.from("setlists").select("id").eq("id", setlistId).maybeSingle<{ id: string }>(),
  ]);
  if (!song || !setlist) return { error: "That song or setlist no longer exists." };

  const { data: existing } = await supabase
    .from("setlist_items")
    .select("id")
    .eq("setlist_id", setlistId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const ids = (existing ?? []).map((r: { id: string }) => r.id);
  const at = index === null || index < 0 || index > ids.length ? ids.length : index;

  const { data, error } = await supabase
    .from("setlist_items")
    .insert({
      church_id: church.id,
      setlist_id: setlistId,
      song_id: songId,
      position: at,
      settings: defaultSettings(song.default_capo),
      edited_by: screenId(clientId),
    })
    .select(ITEM_COLUMNS)
    .single();
  if (error || !data) return { error: "Couldn't add that song. Please try again." };

  const item = toItem(data as unknown as Parameters<typeof toItem>[0]);
  if (!item) return { error: "Couldn't add that song. Please try again." };

  if (at < ids.length) {
    ids.splice(at, 0, item.id);
    if (!(await renumber(setlistId, ids, clientId))) return { item, error: "Added, but the order may be off. Reload to check." };
  }
  return { item };
}

export async function removeSetlistItem(setlistId: string, itemId: string): Promise<SetlistResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  const supabase = await createClient();
  const { error } = await supabase.from("setlist_items").delete().eq("id", itemId).eq("setlist_id", setlistId);
  return error ? { error: "Couldn't remove that song." } : {};
}

export async function reorderSetlistItems(setlistId: string, ids: string[], clientId?: string): Promise<SetlistResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  if (ids.length > 500) return { error: "That setlist is too long." };
  return (await renumber(setlistId, ids, clientId)) ? {} : { error: "Couldn't save the new order." };
}

/** Saves how one song is set up in this setlist (key, capo, text size, chords on or off). */
export async function saveItemSettings(itemId: string, settings: PresetSettings, clientId?: string): Promise<SetlistResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  if (!validSettings(settings)) return { error: "Those settings aren't valid." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("setlist_items")
    .update({ settings, edited_by: screenId(clientId) })
    .eq("id", itemId);
  return error ? { error: "Couldn't save these settings." } : {};
}

const MAX_BODY = 200_000;

/** Saves this setlist's own version of a song's chords (null goes back to the song as it is). */
export async function saveItemBody(itemId: string, body: string | null, clientId?: string): Promise<SetlistResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  if (body !== null && (typeof body !== "string" || body.length > MAX_BODY)) return { error: "That song is too long." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("setlist_items")
    .update({
      edited_by: screenId(clientId),
      body_override: body === null ? null : body.replace(/\r\n?/g, "\n") })
    .eq("id", itemId);
  return error ? { error: "Couldn't save the chords." } : {};
}

/** The setlist as it is now, for a screen catching up with changes made elsewhere. Null if it is gone. */
export async function getSetlistState(
  setlistId: string,
): Promise<{ setlist: Setlist; items: SetlistItem[]; messages: ChatMessage[] } | null> {
  const church = await getCurrentChurch();
  if (!church) return null;
  const [found, messages] = await Promise.all([getSetlist(setlistId), listMessages(setlistId)]);
  return found ? { ...found, messages } : null;
}

const MAX_MESSAGE = 500;

/** Sends a line to the session chat. */
export async function sendMessage(
  setlistId: string,
  body: string,
  role: string,
  clientId: string,
): Promise<{ message?: ChatMessage; error?: string }> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { error: "Type a message first." };
  if (text.length > MAX_MESSAGE) return { error: `Keep it under ${MAX_MESSAGE} characters.` };
  if (role !== "stage" && role !== "media" && role !== "viewer") return { error: "Unknown screen type." };
  const sender = screenId(clientId);
  if (!sender) return { error: "Couldn't send that." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("setlist_messages")
    .insert({ church_id: church.id, setlist_id: setlistId, sender_role: role, sender, body: text })
    .select(MESSAGE_COLUMNS)
    .single<ChatMessage>();
  if (error || !data) return { error: "Couldn't send that. Please try again." };
  return { message: data };
}

/** Puts a song on stage: Stage and Viewer screens switch to it. Null clears the choice. */
export async function setActiveItem(setlistId: string, itemId: string | null, clientId?: string): Promise<SetlistResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  const supabase = await createClient();
  const { error } = await supabase
    .from("setlists")
    .update({ active_item_id: itemId, edited_by: screenId(clientId) })
    .eq("id", setlistId);
  return error ? { error: "Couldn't change the song on stage." } : {};
}

/** Saves how one song leads into the next: suggested chords, typed-in chords, or none. */
export async function saveItemTransition(
  itemId: string,
  mode: string,
  chords: string,
  clientId?: string,
): Promise<SetlistResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  if (mode !== "auto" && mode !== "manual" && mode !== "none") return { error: "Choose auto, manual or none." };
  const text = typeof chords === "string" ? chords.trim() : "";
  if (text.length > 200) return { error: "Keep the transition under 200 characters." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("setlist_items")
    .update({ transition_mode: mode, transition_chords: text, edited_by: screenId(clientId) })
    .eq("id", itemId);
  return error ? { error: "Couldn't save the transition." } : {};
}
