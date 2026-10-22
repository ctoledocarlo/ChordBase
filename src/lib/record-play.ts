import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveSong } from "./setlist-derive";
import { normalizeSettings } from "./setlist-settings";

/** The day to file a play under: the Media screen's own day when it is believable, else today's date on the server. */
export function playDay(localDay: string | undefined): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!localDay || !/^\d{4}-\d{2}-\d{2}$/.test(localDay)) return today;
  const apart = Math.abs(Date.parse(localDay) - Date.parse(today)) / 86_400_000;
  return apart <= 2 ? localDay : today;
}

/**
 * Writes a song to the permanent history (once per song per day). `churchId` is for a client that isn't signed in
 * (the phone remote); a signed-in client leaves it out and the database fills it in.
 */
export async function recordPlayWith(supabase: SupabaseClient, setlistId: string, itemId: string, localDay: string | undefined, churchId?: string) {
  try {
    const [{ data: setlist }, { data: item }] = await Promise.all([
      supabase.from("setlists").select("name").eq("id", setlistId).maybeSingle<{ name: string }>(),
      supabase
        .from("setlist_items")
        .select("song_id, settings, songs(original_key, default_capo)")
        .eq("id", itemId)
        .eq("setlist_id", setlistId)
        .maybeSingle(),
    ]);
    const row = item as unknown as { song_id: string; settings: unknown; songs: { original_key: string; default_capo: number } | null } | null;
    if (!setlist || !row || !row.songs) return;
    const key = deriveSong(row.songs.original_key, normalizeSettings(row.settings, row.songs.default_capo)).soundingKey;
    // A second play of the same song on the same day changes nothing.
    await supabase
      .from("song_history")
      .upsert(
        { ...(churchId ? { church_id: churchId } : {}), song_id: row.song_id, played_on: playDay(localDay), setlist_name: setlist.name, key },
        { onConflict: "song_id,played_on", ignoreDuplicates: true },
      );
  } catch (e) {
    console.error("recordPlay failed", e);
  }
}
