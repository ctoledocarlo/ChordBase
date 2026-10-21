import { createClient } from "@/lib/supabase/server";
import { setlistMatches } from "./setlist-search";
import { normalizeSettings } from "./setlist-settings";
import { DEFAULT_TRANSITION, isTransitionMode, type Transition } from "./setlist-transition";
import {
  NOTE_COLUMNS,
  SINGER_COLUMNS,
  TASK_COLUMNS,
  VIEW_COLUMNS,
  type SetlistNote,
  type SetlistTask,
  type SetlistView,
  type Singer,
  type TeamExtras,
} from "./setlist-team";
import type { PresetSettings } from "./songs";

export type Setlist = {
  id: string;
  name: string;
  service_date: string | null;
  expires_at: string;
  /** The song on stage right now (Media screens choose it; Stage and Viewer follow). Null = nothing chosen yet. */
  active_item_id: string | null;
  /** When the set should end, shared by every screen (null = no timer). */
  timer_ends_at: string | null;
};

export type SetlistSummary = Omit<Setlist, "active_item_id" | "timer_ends_at"> & { songCount: number };

/** The song as it needs to be shown during the service. */
export type SetlistSong = {
  title: string;
  artist: string;
  original_key: string;
  /** The melody's lowest and highest note in the usual key, for finding a singer's key. */
  melody_low?: string;
  melody_high?: string;
  links?: unknown;
  default_capo: number;
  tempo: number | null;
  time_signature?: string;
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
  /** Who sings it (a singer's id), or null. */
  singer_id?: string | null;
  song: SetlistSong;
};

/** Columns to select for an item together with its song. */
export const ITEM_COLUMNS =
  "id, song_id, position, settings, body_override, transition_mode, transition_chords, singer_id, songs(title, artist, original_key, melody_low, melody_high, links, default_capo, tempo, time_signature, body)";

type ItemRow = {
  id: string;
  song_id: string;
  settings: unknown;
  body_override: string | null;
  transition_mode?: string | null;
  transition_chords?: string | null;
  singer_id?: string | null;
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
    singer_id: row.singer_id ?? null,
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
  const now = new Date().toISOString();
  let req = supabase
    .from("setlists")
    // setlists.active_item_id also points at setlist_items, so say which link to count along.
    .select("id, name, service_date, expires_at, setlist_items!setlist_id(count)")
    // Expired setlists are hidden whether or not they have been removed yet.
    .gt("expires_at", now)
    .order("service_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (range?.from) req = req.gte("service_date", range.from);
  if (range?.to) req = req.lte("service_date", range.to);
  // Removing the expired ones (the database also does this every hour, where it can) happens alongside
  // the read, not before it, since nothing in the list depends on it.
  const [{ data, error }] = await Promise.all([req, supabase.from("setlists").delete().lt("expires_at", now)]);
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

/** The setlist coming up next (soonest date, or one with no date yet), with its song count. */
export async function getNextSetlist(): Promise<SetlistSummary | null> {
  const supabase = await createClient();
  const now = new Date();
  const { data, error } = await supabase
    .from("setlists")
    .select("id, name, service_date, expires_at, setlist_items!setlist_id(count)")
    .gt("expires_at", now.toISOString())
    .or(`service_date.is.null,service_date.gte.${now.toISOString().slice(0, 10)}`)
    .order("service_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) console.error("getNextSetlist failed:", error.message);
  const r = (data as unknown as (Setlist & { setlist_items: { count: number }[] })[] | null)?.[0];
  return r
    ? { id: r.id, name: r.name, service_date: r.service_date, expires_at: r.expires_at, songCount: r.setlist_items?.[0]?.count ?? 0 }
    : null;
}

/** Names and dates of the setlists a song can be added to (no counts, nothing removed). */
export async function listSetlistChoices(): Promise<Pick<Setlist, "id" | "name" | "service_date">[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("setlists")
    .select("id, name, service_date")
    .gt("expires_at", new Date().toISOString())
    .order("service_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  return (data as Pick<Setlist, "id" | "name" | "service_date">[] | null) ?? [];
}

/** What a setlist and its songs were made of before the team-tools update, for a database that hasn't had it yet. */
const LEGACY_SETLIST_COLUMNS = "id, name, service_date, expires_at, active_item_id";
const LEGACY_ITEM_COLUMNS =
  "id, song_id, position, settings, body_override, transition_mode, transition_chords, songs(title, artist, original_key, default_capo, tempo, time_signature, body)";

export async function getSetlist(id: string): Promise<{ setlist: Setlist; items: SetlistItem[] } | null> {
  const supabase = await createClient();
  const read = (setlistColumns: string, itemColumns: string) =>
    // The setlist and its songs are read together; the songs of a setlist that turns out not to exist are simply dropped.
    Promise.all([
      supabase
        .from("setlists")
        .select(setlistColumns)
        .eq("id", id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle<Setlist>(),
      supabase
        .from("setlist_items")
        .select(itemColumns)
        .eq("setlist_id", id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
  const first = await read("id, name, service_date, expires_at, active_item_id, timer_ends_at", ITEM_COLUMNS);
  let setlist = first[0].data;
  let data = first[1].data;
  // 42703 is "no such column": the team-tools migration hasn't been run, so read it the way it used to be.
  if (first[0].error?.code === "42703" || first[1].error?.code === "42703") {
    console.error("The team-tools migration (20261028000000) hasn't been run: reading the setlist without it.");
    const legacy = await read(LEGACY_SETLIST_COLUMNS, LEGACY_ITEM_COLUMNS);
    setlist = legacy[0].data;
    data = legacy[1].data;
  }
  if (!setlist) return null;

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

/**
 * The views, notes and checklist of a setlist. A setlist always has the shared "Everyone" view: it is made the
 * first time anything asks (two screens asking at once is fine, the database only allows one).
 */
export async function getTeamExtras(setlistId: string): Promise<TeamExtras> {
  const supabase = await createClient();
  const read = () =>
    Promise.all([
      supabase.from("setlist_views").select(VIEW_COLUMNS).eq("setlist_id", setlistId).order("position", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("setlist_notes").select(NOTE_COLUMNS).eq("setlist_id", setlistId),
      supabase.from("setlist_tasks").select(TASK_COLUMNS).eq("setlist_id", setlistId).order("position", { ascending: true }).order("created_at", { ascending: true }),
    ]);
  let [views, notes, tasks] = await read();
  if (views.error) {
    // The team tables aren't there yet (the migration hasn't been run): the setlist still works without them.
    console.error("getTeamExtras failed:", views.error.message);
    return { views: [], notes: [], tasks: [] };
  }
  if (!((views.data as SetlistView[] | null) ?? []).some((v) => v.kind === "all")) {
    const { error } = await supabase.from("setlist_views").insert({ setlist_id: setlistId, name: "Everyone", kind: "all", position: 0 });
    // 23505 means another screen made it a moment ago, which is just as good.
    if (error && error.code !== "23505") console.error("making the Everyone view failed:", error.message);
    [views, notes, tasks] = await read();
  }
  return {
    views: (views.data as SetlistView[] | null) ?? [],
    notes: (notes.data as SetlistNote[] | null) ?? [],
    tasks: (tasks.data as SetlistTask[] | null) ?? [],
  };
}

/** The church's singers, by name. Empty if the singers table isn't there yet. */
export async function listSingers(): Promise<Singer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("singers").select(SINGER_COLUMNS).order("name", { ascending: true });
  if (error) console.error("listSingers failed:", error.message);
  return (data as Singer[] | null) ?? [];
}
