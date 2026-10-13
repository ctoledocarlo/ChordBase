import { createClient } from "@/lib/supabase/server";
import { normalizeSettings } from "./setlist-settings";
import type { PresetSettings } from "./songs";

export type Setlist = { id: string; name: string; service_date: string | null; expires_at: string };

export type SetlistSummary = Setlist & { songCount: number };

/** The song as it needs to be shown during the service. */
export type SetlistSong = {
  title: string;
  artist: string;
  original_key: string;
  default_capo: number;
  tempo: number | null;
  body: string;
};

/** One song in a setlist, with the settings that belong to this setlist only. */
export type SetlistItem = {
  id: string;
  song_id: string;
  settings: PresetSettings;
  song: SetlistSong;
};

/** Columns to select for an item together with its song. */
export const ITEM_COLUMNS =
  "id, song_id, position, settings, songs(title, artist, original_key, default_capo, tempo, body)";

type ItemRow = {
  id: string;
  song_id: string;
  settings: unknown;
  songs: SetlistSong | null;
};

export function toItem(row: ItemRow): SetlistItem | null {
  if (!row.songs) return null;
  return {
    id: row.id,
    song_id: row.song_id,
    settings: normalizeSettings(row.settings, row.songs.default_capo),
    song: row.songs,
  };
}

function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%_\\]/g, " ").trim();
}

/** Setlists for the church: upcoming ones first (soonest first), then the past (latest first). */
export async function listSetlists(query?: string): Promise<{ upcoming: SetlistSummary[]; past: SetlistSummary[] }> {
  const supabase = await createClient();
  // Setlists past their expiry are removed here, the next time anyone looks at the list.
  await supabase.from("setlists").delete().lt("expires_at", new Date().toISOString());
  let req = supabase
    .from("setlists")
    .select("id, name, service_date, expires_at, setlist_items(count)")
    .order("service_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const q = query ? sanitizeSearch(query) : "";
  if (q) req = req.ilike("name", `%${q}%`);
  const { data } = await req;

  const rows = ((data as unknown as (Setlist & { setlist_items: { count: number }[] })[] | null) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    service_date: r.service_date,
    expires_at: r.expires_at,
    songCount: r.setlist_items?.[0]?.count ?? 0,
  }));

  const today = new Date().toISOString().slice(0, 10);
  // No date means "not scheduled yet", which is as relevant as an upcoming one.
  const upcoming = rows
    .filter((r) => !r.service_date || r.service_date >= today)
    .sort((a, b) => (a.service_date ?? "9999").localeCompare(b.service_date ?? "9999"));
  const past = rows.filter((r) => r.service_date && r.service_date < today);
  return { upcoming, past };
}

export async function getSetlist(id: string): Promise<{ setlist: Setlist; items: SetlistItem[] } | null> {
  const supabase = await createClient();
  const { data: setlist } = await supabase
    .from("setlists")
    .select("id, name, service_date, expires_at")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<Setlist>();
  if (!setlist) return null;

  const { data } = await supabase
    .from("setlist_items")
    .select(ITEM_COLUMNS)
    .eq("setlist_id", id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const items = ((data as unknown as ItemRow[] | null) ?? []).map(toItem).filter((i): i is SetlistItem => i !== null);
  return { setlist, items };
}
