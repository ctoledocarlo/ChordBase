import { parseChord, transposeChordText, type Spelling } from "./chord";

export interface Segment {
  /** Chord sounding at the start of this lyric fragment, if any. */
  chord?: string;
  lyric: string;
}

export type SongLine =
  | { type: "lyrics"; segments: Segment[] }
  | { type: "comment"; text: string }
  | { type: "section"; label: string }
  | { type: "blank" };

export interface SongMeta {
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  time?: string;
  [directive: string]: string | number | undefined;
}

export interface ParsedSong {
  meta: SongMeta;
  lines: SongLine[];
}

const DIRECTIVE_RE = /^\{\s*([a-zA-Z_]+)\s*(?::\s*(.*?))?\s*\}$/;
const INLINE_CHORD_RE = /\[([^\]]*)\]/g;

const META_ALIASES: Record<string, string> = {
  t: "title",
  st: "artist",
  subtitle: "artist",
};
const SECTION_STARTS: Record<string, string> = {
  start_of_verse: "Verse",
  sov: "Verse",
  start_of_chorus: "Chorus",
  soc: "Chorus",
  start_of_bridge: "Bridge",
  sob: "Bridge",
};
const SECTION_ENDS = new Set([
  "end_of_verse",
  "eov",
  "end_of_chorus",
  "eoc",
  "end_of_bridge",
  "eob",
]);
const COMMENTS = new Set(["comment", "c", "comment_italic", "ci"]);
const NUMERIC_META = new Set(["capo", "tempo"]);

/** Splits "[G]Amazing [C]grace" into aligned chord/lyric segments. */
export function parseLyricLine(line: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let pending: string | undefined;
  for (const m of line.matchAll(INLINE_CHORD_RE)) {
    const lyric = line.slice(last, m.index);
    if (lyric !== "" || pending !== undefined) segments.push({ chord: pending, lyric });
    pending = m[1].trim();
    last = m.index + m[0].length;
  }
  const tail = line.slice(last);
  if (tail !== "" || pending !== undefined || segments.length === 0) {
    segments.push({ chord: pending, lyric: tail });
  }
  return segments;
}

export function parseChordPro(source: string): ParsedSong {
  const meta: SongMeta = {};
  const lines: SongLine[] = [];

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trimStart().startsWith("#")) continue; // ChordPro comment

    const d = DIRECTIVE_RE.exec(line.trim());
    if (d) {
      const name = d[1].toLowerCase();
      const value = d[2] ?? "";
      if (name in SECTION_STARTS) {
        lines.push({ type: "section", label: value || SECTION_STARTS[name] });
      } else if (SECTION_ENDS.has(name)) {
        // Sections are shown by their label only.
      } else if (COMMENTS.has(name)) {
        lines.push({ type: "comment", text: value });
      } else {
        const key = META_ALIASES[name] ?? name;
        if (NUMERIC_META.has(key)) {
          const n = Number(value);
          if (Number.isFinite(n)) meta[key] = n;
        } else {
          meta[key] = value;
        }
      }
      continue;
    }

    if (line.trim() === "") lines.push({ type: "blank" });
    else lines.push({ type: "lyrics", segments: parseLyricLine(line) });
  }

  return { meta, lines };
}

/**
 * Rewrites every [chord] in ChordPro text, leaving lyrics, directives and
 * non-chord brackets (e.g. [N.C.]) untouched. A {key: X} directive moves too.
 */
export function transposeChordPro(
  source: string,
  semitones: number,
  spelling: Spelling,
): string {
  const out = source.replace(
    INLINE_CHORD_RE,
    (_, text: string) => `[${transposeChordText(text, semitones, spelling)}]`,
  );
  return out.replace(
    /^(\s*\{\s*key\s*:\s*)([^}]*?)(\s*\})/gim,
    (_, a: string, key: string, c: string) =>
      `${a}${parseChord(key) ? transposeChordText(key, semitones, spelling) : key}${c}`,
  );
}

/** Unique chords used in a song, in order of first appearance. */
export function chordsInSong(song: ParsedSong): string[] {
  const seen = new Set<string>();
  for (const l of song.lines) {
    if (l.type !== "lyrics") continue;
    for (const s of l.segments) if (s.chord && parseChord(s.chord)) seen.add(s.chord);
  }
  return [...seen];
}
