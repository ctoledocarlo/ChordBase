import { readLinks } from "./song-links";

/** A song as it was before a save changed it. The database keeps the latest 60 per song. */
export type SongVersion = {
  id: string;
  song_id: string;
  saved_at: string;
  title: string;
  artist: string;
  original_key: string;
  default_capo: number;
  tempo: number | null;
  time_signature: string;
  ccli_number: string;
  tags: string[];
  melody_low: string;
  melody_high: string;
  links: unknown;
  body: string;
};

export const VERSION_COLUMNS =
  "id, song_id, saved_at, title, artist, original_key, default_capo, tempo, time_signature, ccli_number, tags, melody_low, melody_high, links, body";

/** The parts of a song that a version keeps. */
export type Snapshot = Omit<SongVersion, "id" | "song_id" | "saved_at">;

/** What changed between two versions of a song, in plain words (empty = nothing). */
export function changedFields(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  if (before.body.replace(/\r\n?/g, "\n") !== after.body.replace(/\r\n?/g, "\n")) out.push("Chords and lyrics");
  if (before.title !== after.title) out.push("Title");
  if (before.artist !== after.artist) out.push("Artist");
  if (before.original_key !== after.original_key) out.push("Key");
  if (before.default_capo !== after.default_capo) out.push("Capo");
  if (before.tempo !== after.tempo) out.push("Tempo");
  if (before.time_signature !== after.time_signature) out.push("Time signature");
  if (before.ccli_number !== after.ccli_number) out.push("CCLI number");
  if ([...before.tags].sort().join("\n") !== [...after.tags].sort().join("\n")) out.push("Tags");
  if (before.melody_low !== after.melody_low || before.melody_high !== after.melody_high) out.push("Melody range");
  if (JSON.stringify(readLinks(before.links)) !== JSON.stringify(readLinks(after.links))) out.push("Links");
  return out;
}

/** The columns a restore writes back (never the id, the church or the dates). */
export function restoreFields(v: Snapshot) {
  return {
    title: v.title,
    artist: v.artist,
    original_key: v.original_key,
    default_capo: v.default_capo,
    tempo: v.tempo,
    time_signature: v.time_signature,
    ccli_number: v.ccli_number,
    tags: v.tags,
    melody_low: v.melody_low,
    melody_high: v.melody_high,
    links: v.links,
    body: v.body,
  };
}
