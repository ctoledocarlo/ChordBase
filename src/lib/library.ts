import { createClient } from "@/lib/supabase/server";
import type { SongLite } from "./duplicates";
import type { Play, SongRef } from "./history";

/** Supabase hands back at most this many rows per request, so bigger lists are read in pages. */
const PAGE = 1000;

/** Reads every row of a query, a page at a time. `make` builds the query for a range of rows. */
async function readAll<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, label: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) {
      console.error(`${label} failed:`, error.message);
      break;
    }
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Every song's title, artist and key, for finding duplicates and building the history. */
export async function listAllSongs(): Promise<SongLite[]> {
  const supabase = await createClient();
  return readAll<SongLite>(
    (from, to) => supabase.from("songs").select("id, title, artist, original_key").order("title").order("id").range(from, to),
    "listAllSongs",
  );
}

/** Every song, as the history needs to name it. */
export const listSongRefs = (): Promise<SongRef[]> => listAllSongs().then((songs) => songs.map(({ id, title, artist }) => ({ id, title, artist })));

/** The plays from a date on (everything, if no date). */
export async function listPlays(since?: string): Promise<Play[]> {
  const supabase = await createClient();
  return readAll<Play>((from, to) => {
    let q = supabase.from("song_history").select("song_id, played_on, setlist_name").order("played_on", { ascending: false }).order("song_id").range(from, to);
    if (since) q = q.gte("played_on", since);
    return q;
  }, "listPlays");
}

/** How many times one song was played, and when last. */
export async function getSongPlays(songId: string): Promise<{ count: number; last: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("song_history").select("played_on").eq("song_id", songId).order("played_on", { ascending: false }).limit(500);
  if (error) return { count: 0, last: null };
  const rows = (data as { played_on: string }[] | null) ?? [];
  return { count: rows.length, last: rows[0]?.played_on ?? null };
}
