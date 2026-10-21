import { getUserId } from "@/lib/church";
import { createClient } from "@/lib/supabase/server";
import type { ChordStyle } from "./chords";
import { lyricSnippet, normalizeText, searchTokens } from "./lyric-search";
import { PAGE_SIZE, type SongFacets, type SongFilters } from "./song-filters";
import { readLinks, type SongLink } from "./song-links";

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
  /** The lowest and highest note of the melody in the song's usual key (like "A3" and "D5"), or empty. */
  melody_low: string;
  melody_high: string;
  /** Raw from the database; use songLinks(song) to read it. */
  links: unknown;
  body: string;
  updated_at: string;
};

/** A song's saved links, checked. */
export const songLinks = (song: Pick<Song, "links">): SongLink[] => readLinks(song.links);

export type SongSummary = Pick<Song, "id" | "title" | "artist" | "original_key" | "tempo"> & {
  tags?: string[];
  /** When a search matched the words of the song (not its title or artist), the line that matched. */
  snippet?: string;
};

/** What the songs_page function returns for each song (the text only when asked for, to show a match). */
type PageRow = SongSummary & { body: string | null; total: number | string };

type PageOptions = {
  q?: string;
  keys?: string[];
  artist?: string;
  mode?: string;
  tempoMin?: number | null;
  tempoMax?: number | null;
  timeSig?: string;
  capo?: number | null;
  tags?: string[];
  sort?: string;
  limit: number;
  offset: number;
};

/**
 * One request for a page of songs and how many there are in all (the songs_page database function).
 * It runs the search where the search indexes can be used, and counts in the same pass. A search also
 * brings back each song's text, so the line that matched can be shown.
 */
async function songsPage(o: PageOptions): Promise<{ rows: PageRow[]; total: number | null }> {
  const supabase = await createClient();
  const q = (o.q ?? "").trim();
  const params = {
    p_q: q,
    p_tokens: q ? searchTokens(q) : [],
    p_keys: o.keys ?? [],
    p_artist: o.artist ?? "",
    p_mode: o.mode ?? "",
    p_tempo_min: o.tempoMin ?? null,
    p_tempo_max: o.tempoMax ?? null,
    p_ts: o.timeSig ?? "",
    p_capo: o.capo ?? null,
    p_sort: o.sort ?? "title",
    p_limit: o.limit,
    p_offset: o.offset,
    p_with_body: q !== "",
    p_phrase: q ? normalizeText(q) : "",
  };
  let { data, error } = await supabase.rpc("songs_page", { ...params, p_tags: o.tags ?? [] });
  // PGRST202: no function with the tags parameter, so the tags migration (20261028000001) hasn't been run.
  // Search the way it used to be rather than showing an empty library.
  if (error?.code === "PGRST202") ({ data, error } = await supabase.rpc("songs_page", params));
  if (error) console.error("songs_page failed:", error.message);
  const rows = (data as PageRow[] | null) ?? [];
  // The total comes with every row, so a page past the end (no rows) doesn't know it.
  return { rows, total: rows.length > 0 ? Number(rows[0].total) : null };
}

/** A row as a plain song summary, without the text and the running total. */
function plain({ body, total, ...song }: PageRow): SongSummary {
  void body;
  void total;
  return song;
}

/** Adds the line that matched to songs found through their words, and drops the song text. */
function withSnippets(rows: PageRow[], query: string): SongSummary[] {
  const q = query.trim().toLowerCase();
  const tokens = searchTokens(query);
  return rows.map((row) => {
    const { body } = row;
    const song = plain(row);
    // A match on the title or artist is obvious; only explain the ones that matched on the words.
    const named = q !== "" && `${song.title} ${song.artist}`.toLowerCase().includes(q);
    const snippet = !named && body ? lyricSnippet(body, tokens) : null;
    return snippet ? { ...song, snippet } : song;
  });
}

/** Songs matching what was typed (title, artist or words), best few first. Call it inside <Suspense> or an action. */
export async function findSongs(query: string, limit = 8): Promise<SongSummary[]> {
  if (!query.trim()) return [];
  const { rows } = await songsPage({ q: query, limit, offset: 0, sort: "relevance" });
  return withSnippets(rows, query);
}

export type SongPage = { songs: SongSummary[]; total: number; page: number; pages: number };

/** One page of the library, narrowed and ordered by the filters. Call it inside <Suspense>. */
export async function searchSongs(f: SongFilters): Promise<SongPage> {
  const options = {
    q: f.q,
    keys: f.keys,
    artist: f.artist,
    mode: f.mode,
    tempoMin: f.tempoMin,
    tempoMax: f.tempoMax,
    timeSig: f.timeSig,
    capo: f.capo,
    tags: f.tags,
    sort: f.sort,
    limit: PAGE_SIZE,
  };

  let page = f.page;
  let { rows, total } = await songsPage({ ...options, offset: (page - 1) * PAGE_SIZE });
  if (total === null && page > 1) {
    // A page number past the end (after filtering, say) shows the last page instead of nothing.
    const count = (await songsPage({ ...options, limit: 1, offset: 0 })).total ?? 0;
    page = Math.max(1, Math.ceil(count / PAGE_SIZE));
    ({ rows, total } = await songsPage({ ...options, offset: (page - 1) * PAGE_SIZE }));
  }
  const count = total ?? 0;
  return {
    songs: f.q ? withSnippets(rows, f.q) : rows.map(plain),
    total: count,
    page,
    pages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
  };
}

const FACETS_FOR_MS = 60_000;
const facetCache = new Map<string, { at: number; value: SongFacets }>();

/** Forget the remembered filter choices (a song was added, changed or removed on this server). */
export function forgetSongFacets() {
  facetCache.clear();
}

/**
 * The keys, artists, time signatures and capos that exist, for the filter choices. They only change when
 * a song is added or edited, and the list asks for them on every search and page turn, so they are kept
 * for a minute on this server, separately for each login.
 */
export async function getSongFacets(): Promise<SongFacets> {
  const user = await getUserId();
  const hit = user ? facetCache.get(user) : undefined;
  if (hit && Date.now() - hit.at < FACETS_FOR_MS) return hit.value;

  const supabase = await createClient();
  const { data } = await supabase.rpc("song_facets");
  const raw = (data ?? {}) as Record<string, unknown>;
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const value: SongFacets = {
    keys: list<string>(raw.keys),
    artists: list<string>(raw.artists),
    timeSignatures: list<string>(raw.time_signatures),
    capos: list<number>(raw.capos),
    tags: list<string>(raw.tags),
  };
  if (user) {
    if (facetCache.size > 200) facetCache.clear();
    facetCache.set(user, { at: Date.now(), value });
  }
  return value;
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
