import { createClient } from "@/lib/supabase/server";
import type { ChordStyle } from "./chords";
import { lyricSnippet, searchTokens } from "./lyric-search";
import { PAGE_SIZE, type SongFacets, type SongFilters } from "./song-filters";

export type Song = {
  id: string;
  church_id: string;
  title: string;
  artist: string;
  original_key: string;
  default_capo: number;
  tempo: number | null;
  time_signature: string;
  ccli_number: string;
  tags: string[];
  body: string;
  updated_at: string;
};

export type SongSummary = Pick<Song, "id" | "title" | "artist" | "original_key" | "tempo"> & {
  /** When a search matched the words of the song (not its title or artist), the line that matched. */
  snippet?: string;
};

/** Characters that are special in a PostgREST `or` filter or an ilike pattern. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%_\\]/g, " ").trim();
}

/** Reads the request cookies, so call it inside <Suspense>. RLS scopes to the church. */
export async function listSongs(query?: string): Promise<SongSummary[]> {
  const supabase = await createClient();
  let req = supabase
    .from("songs")
    .select("id, title, artist, original_key, tempo")
    .order("title", { ascending: true });
  const q = query ? sanitizeSearch(query) : "";
  if (q) req = req.or(`title.ilike.%${q}%,artist.ilike.%${q}%`);
  const { data } = await req;
  return data ?? [];
}

/**
 * What to match a search against: the title or artist containing what was typed, or the lyrics
 * containing every word of it. Returns a PostgREST `or` filter, or null for an empty search.
 */
function textFilter(query: string): string | null {
  const q = sanitizeSearch(query);
  if (!q) return null;
  const parts = [`title.ilike.%${q}%`, `artist.ilike.%${q}%`];
  // The tokens are only letters and numbers, so they can't break the filter.
  const tokens = searchTokens(query);
  if (tokens.length > 0) parts.push(`and(${tokens.map((t) => `lyrics.ilike.%${t}%`).join(",")})`);
  return parts.join(",");
}

/** Adds the line that matched to songs found through their words, and drops the song text. */
function withSnippets(rows: (SongSummary & { body?: string })[], query: string): SongSummary[] {
  const q = query.trim().toLowerCase();
  const tokens = searchTokens(query);
  return rows.map(({ body, ...song }) => {
    // A match on the title or artist is obvious; only explain the ones that matched on the words.
    const named = q !== "" && `${song.title} ${song.artist}`.toLowerCase().includes(q);
    const snippet = !named && body ? lyricSnippet(body, tokens) : null;
    return snippet ? { ...song, snippet } : song;
  });
}

/** Songs matching what was typed (title, artist or words), best few first. Call it inside <Suspense> or an action. */
export async function findSongs(query: string, limit = 8): Promise<SongSummary[]> {
  const filter = textFilter(query);
  if (!filter) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("songs")
    .select("id, title, artist, original_key, tempo, body")
    .or(filter)
    .order("title", { ascending: true })
    .limit(limit);
  return withSnippets((data as (SongSummary & { body?: string })[] | null) ?? [], query);
}

/** A minor key is a root with an "m" that isn't the start of "maj" (Am, F#m7). */
const MINOR_KEY = "^[A-G][#b]?m($|[^a])";

export type SongPage = { songs: SongSummary[]; total: number; page: number; pages: number };

/** One page of the library, narrowed and ordered by the filters. Call it inside <Suspense>. */
export async function searchSongs(f: SongFilters): Promise<SongPage> {
  const supabase = await createClient();

  async function fetchPage(page: number) {
    let req = supabase
      .from("songs")
      // The song text comes along only when searching, to show which line matched.
      .select(f.q ? "id, title, artist, original_key, tempo, body" : "id, title, artist, original_key, tempo", { count: "exact" })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const filter = f.q ? textFilter(f.q) : null;
    if (filter) req = req.or(filter);
    if (f.keys.length > 0) req = req.in("original_key", f.keys);
    if (f.artist) req = req.eq("artist", f.artist);
    if (f.mode === "minor") req = req.filter("original_key", "match", MINOR_KEY);
    if (f.mode === "major") req = req.neq("original_key", "").not("original_key", "match", MINOR_KEY);
    if (f.tempoMin !== null) req = req.gte("tempo", f.tempoMin);
    if (f.tempoMax !== null) req = req.lte("tempo", f.tempoMax);
    if (f.timeSig) req = req.eq("time_signature", f.timeSig);
    if (f.capo !== null) req = req.eq("default_capo", f.capo);

    switch (f.sort) {
      case "artist":
        req = req.order("artist", { ascending: true }).order("title", { ascending: true });
        break;
      case "key":
        req = req.order("original_key", { ascending: true }).order("title", { ascending: true });
        break;
      case "tempo":
        req = req.order("tempo", { ascending: true, nullsFirst: false }).order("title", { ascending: true });
        break;
      case "recent":
        req = req.order("updated_at", { ascending: false });
        break;
      default:
        req = req.order("title", { ascending: true });
    }
    // The id keeps the order stable between pages when titles match.
    return req.order("id", { ascending: true });
  }

  let page = f.page;
  const first = await fetchPage(page);
  let data = first.data;
  const count = first.count;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A page number past the end (after filtering, say) shows the last page instead of nothing.
  if (page > pages) {
    page = pages;
    ({ data } = await fetchPage(page));
  }
  const rows = (data as unknown as (SongSummary & { body?: string })[] | null) ?? [];
  return { songs: f.q ? withSnippets(rows, f.q) : rows, total, page, pages };
}

/** The keys, artists, time signatures and capos that exist, for the filter choices. */
export async function getSongFacets(): Promise<SongFacets> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("song_facets");
  const raw = (data ?? {}) as Record<string, unknown>;
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    keys: list<string>(raw.keys),
    artists: list<string>(raw.artists),
    timeSignatures: list<string>(raw.time_signatures),
    capos: list<number>(raw.capos),
  };
}

export async function getSong(id: string): Promise<Song | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("songs").select("*").eq("id", id).maybeSingle<Song>();
  return data;
}

export type PresetSettings = {
  /** Semitones above the original key. */
  semitones: number;
  capo: number;
  spelling: "auto" | "sharp" | "flat";
  showChords: boolean;
  /** Text size in pixels; 0 means fit to screen. */
  fontSize: number;
  /** How the chords are dressed (original, classic, jazzy, gospel). Missing means original. */
  style?: ChordStyle;
};

export type Preset = { id: string; name: string; settings: PresetSettings };

export async function listPresets(songId: string): Promise<Preset[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("song_presets")
    .select("id, name, settings")
    .eq("song_id", songId)
    .order("created_at", { ascending: true });
  return (data as Preset[] | null) ?? [];
}

export type ChordShortcut = { id: string; chord: string };

export async function listChordShortcuts(): Promise<ChordShortcut[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chord_shortcuts")
    .select("id, chord")
    .order("created_at", { ascending: true });
  return (data as ChordShortcut[] | null) ?? [];
}

export type SongName = { title: string; artist: string };

/** Titles already in the library, for spotting songs that would be imported twice. */
export async function listSongNames(): Promise<SongName[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("songs").select("title, artist");
  return (data as SongName[] | null) ?? [];
}
