import { createClient } from "@/lib/supabase/server";

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

export type SongSummary = Pick<Song, "id" | "title" | "artist" | "original_key">;

/** Characters that are special in a PostgREST `or` filter or an ilike pattern. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%_\\]/g, " ").trim();
}

/** Reads the request cookies, so call it inside <Suspense>. RLS scopes to the church. */
export async function listSongs(query?: string): Promise<SongSummary[]> {
  const supabase = await createClient();
  let req = supabase
    .from("songs")
    .select("id, title, artist, original_key")
    .order("title", { ascending: true });
  const q = query ? sanitizeSearch(query) : "";
  if (q) req = req.or(`title.ilike.%${q}%,artist.ilike.%${q}%`);
  const { data } = await req;
  return data ?? [];
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
