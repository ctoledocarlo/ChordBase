"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentChurch } from "@/lib/church";
import { DEFAULT_KEEP_MONTHS, expiryFrom, isKeepMonths } from "@/lib/setlist-expiry";
import { defaultSettings, validSettings } from "@/lib/setlist-settings";
import { ITEM_COLUMNS, toItem, type SetlistItem } from "@/lib/setlists";
import type { PresetSettings } from "@/lib/songs";
import { createClient } from "@/lib/supabase/server";

export type SetlistResult = { error?: string };

const NOT_SIGNED_IN = "You're not signed in to a church.";

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
): Promise<SetlistResult & { expires_at?: string }> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) return { error: "Give the setlist a short name." };
  const date = parseDate(serviceDate);
  if (date === undefined) return { error: "That date isn't valid." };

  const supabase = await createClient();
  if (keepMonths !== null && !isKeepMonths(keepMonths)) return { error: "A setlist can be kept for up to a year." };
  const fields: { name: string; service_date: string | null; expires_at?: string } = { name: trimmed, service_date: date };
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
async function renumber(setlistId: string, ids: string[]): Promise<boolean> {
  const supabase = await createClient();
  const results = await Promise.all(
    ids.map((id, position) =>
      supabase.from("setlist_items").update({ position }).eq("id", id).eq("setlist_id", setlistId),
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
    })
    .select(ITEM_COLUMNS)
    .single();
  if (error || !data) return { error: "Couldn't add that song. Please try again." };

  const item = toItem(data as unknown as Parameters<typeof toItem>[0]);
  if (!item) return { error: "Couldn't add that song. Please try again." };

  if (at < ids.length) {
    ids.splice(at, 0, item.id);
    if (!(await renumber(setlistId, ids))) return { item, error: "Added, but the order may be off. Reload to check." };
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

export async function reorderSetlistItems(setlistId: string, ids: string[]): Promise<SetlistResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  if (ids.length > 500) return { error: "That setlist is too long." };
  return (await renumber(setlistId, ids)) ? {} : { error: "Couldn't save the new order." };
}

/** Saves how one song is set up in this setlist (key, capo, text size, chords on or off). */
export async function saveItemSettings(itemId: string, settings: PresetSettings): Promise<SetlistResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: NOT_SIGNED_IN };
  if (!validSettings(settings)) return { error: "Those settings aren't valid." };
  const supabase = await createClient();
  const { error } = await supabase.from("setlist_items").update({ settings }).eq("id", itemId);
  return error ? { error: "Couldn't save these settings." } : {};
}
