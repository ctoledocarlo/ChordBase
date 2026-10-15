import { createClient } from "@/lib/supabase/server";
import { setlistMatches } from "./setlist-search";
import { normalizeSettings } from "./setlist-settings";
import { DEFAULT_TRANSITION, isTransitionMode, type Transition } from "./setlist-transition";
import type { PresetSettings } from "./songs";

export type Setlist = {
  id: string;
  name: string;
  service_date: string | null;
  expires_at: string;
  /** The song on stage right now (Media screens choose it; Stage and Viewer follow). Null = nothing chosen yet. */
  active_item_id: string | null;
};

export type SetlistSummary = Omit<Setlist, "active_item_id"> & { songCount: number };

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
  /** This setlist's own version of the song's chords and layout, in the song's original key. Null = the song as it is. */
  body_override: string | null;
  /** How this song leads into the next one in the setlist. */
  transition: Transition;
  song: SetlistSong;
};

/** Columns to select for an item together with its song. */
export const ITEM_COLUMNS =
  "id, song_id, position, settings, body_override, transition_mode, transition_chords, songs(title, artist, original_key, default_capo, tempo, body)";

type ItemRow = {
  id: string;
  song_id: string;
  settings: unknown;
  body_override: string | null;
  transition_mode?: string | null;
  transition_chords?: string | null;
  songs: SetlistSong | null;
};

export function toItem(row: ItemRow): SetlistItem | null {
  if (!row.songs) return null;
  return {
    id: row.id,
    song_id: row.song_id,
    settings: normalizeSettings(row.settings, row.songs.default_capo),
    body_override: row.body_override,
    transition: {
      mode: isTransitionMode(row.transition_mode) ? row.transition_mode : DEFAULT_TRANSITION.mode,
      chords: row.transition_chords ?? "",
    },
    song: row.songs,
  };
}

/**
 * Setlists for the church: upcoming ones first (soonest first), then the past (latest first).
 * `query` matches a setlist's name or its date (see setlistMatches); `range` limits it to
 * setlists whose service date falls between two dates ("2026-10-01"). Setlists are few and
 * expire within a year, so the text matching is done here rather than in the database.
 */
export async function listSetlists(
  query?: string,
  range?: { from?: string; to?: string },
): Promise<{ upcoming: SetlistSummary[]; past: SetlistSummary[] }> {
  const supabase = await createClient();
  // Setlists past their expiry are removed here, the next time anyone looks at the list.
  await supabase.from("setlists").delete().lt("expires_at", new Date().toISOString());
  let req = supabase
    .from("setlists")
    // setlists.active_item_id also points at setlist_items, so say which link to count along.
    .select("id, name, service_date, expires_at, setlist_items!setlist_id(count)")
    .order("service_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (range?.from) req = req.gte("service_date", range.from);
  if (range?.to) req = req.lte("service_date", range.to);
  const { data, error } = await req;
  if (error) console.error("listSetlists failed:", error.message);

  const rows = ((data as unknown as (Setlist & { setlist_items: { count: number }[] })[] | null) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    service_date: r.service_date,
    expires_at: r.expires_at,
    songCount: r.setlist_items?.[0]?.count ?? 0,
  })).filter((r) => setlistMatches(query ?? "", r.name, r.service_date));

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
    .select("id, name, service_date, expires_at, active_item_id")
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

/** One line of the session chat. */
export type ChatMessage = {
  id: string;
  /** "stage", "media" or "viewer": what kind of screen sent it. */
  sender_role: string;
  /** The sending tab's id, to tell "mine" from the others'. */
  sender: string;
  body: string;
  created_at: string;
};

export const MESSAGE_COLUMNS = "id, sender_role, sender, body, created_at";
export const CHAT_HISTORY = 100;

/** The latest messages for a setlist, oldest first. */
export async function listMessages(setlistId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("setlist_messages")
    .select(MESSAGE_COLUMNS)
    .eq("setlist_id", setlistId)
    .order("created_at", { ascending: false })
    .limit(CHAT_HISTORY);
  return ((data as ChatMessage[] | null) ?? []).reverse();
}
