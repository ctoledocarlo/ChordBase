import type { EditorSection } from "@/lib/chords";

export type SongInfo = {
  title: string;
  artist: string;
  key: string;
  tempo: string;
  timeSignature: string;
  capo: string;
  ccli: string;
  /** Tags typed as "Easter, communion". */
  tags: string;
  /** The melody's lowest and highest note in the usual key ("A3"), or empty. */
  melodyLow: string;
  melodyHigh: string;
};

export type EditorTab = "lyrics" | "chords" | "preview";

/** Where a chord is being typed: a line of a part, before the character at `pos`. */
export type Target = { sid: string; line: number; pos: number };

export type Sections = EditorSection[];

export const PART_PRESETS = ["Verse", "Chorus", "Pre-Chorus", "Bridge", "Intro", "Outro", "Tag", "Interlude", "Instrumental"];

export const TIME_SIGNATURES = ["4/4", "3/4", "6/8", "2/4", "12/8", "5/4", "7/8"];

export const KEYS = (() => {
  const major = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  return [...major, ...major.map((k) => k + "m")];
})();

/** Height of the area that holds the chord and preview screens: the viewport minus the app chrome. */
export const SCREEN_HEIGHT = "h-[calc(100dvh-11rem)] lg:h-[calc(100dvh-7.5rem)]";

/** Stands in for a chord that is being typed but isn't saved yet. */
export const PENDING = "\u200b";
