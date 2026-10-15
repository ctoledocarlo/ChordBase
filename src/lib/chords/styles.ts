import { formatChord, parseChord, pitchClass } from "./chord";
import type { EditorSection } from "./sections";

/**
 * How the chords of a song are dressed. "Original" leaves them as written. The others swap in
 * simple, rule-based alternatives; they are a starting point to play from, not arrangements.
 */
export type ChordStyle = "original" | "classic" | "jazzy" | "gospel";

export const CHORD_STYLES: { value: ChordStyle; label: string; hint: string }[] = [
  { value: "original", label: "Original", hint: "The chords as written" },
  { value: "classic", label: "Classic", hint: "Plain triads and dominant sevenths" },
  { value: "jazzy", label: "Jazzy", hint: "Sevenths and ninths" },
  { value: "gospel", label: "Gospel", hint: "Added ninths, minor sevenths and ninths" },
];

export const isChordStyle = (value: unknown): value is ChordStyle =>
  value === "original" || value === "classic" || value === "jazzy" || value === "gospel";

/** Qualities that are already as plain as a chord gets (or that classic keeps as they are). */
const CLASSIC_KEEPS = new Set(["", "m", "7", "dim", "aug", "sus4", "sus2", "sus"]);

function classic(quality: string): string {
  if (CLASSIC_KEEPS.has(quality)) return quality;
  if (/^m7b5/.test(quality)) return "dim";
  if (/^m(?!aj|a)/.test(quality)) return "m";
  if (/^(maj|M)/.test(quality) || /^(add|6)/.test(quality)) return "";
  // Dominant extensions (9, 11, 13) become a plain seventh; 7sus4 becomes sus4.
  if (/^7sus/.test(quality)) return "sus4";
  if (/^(9|11|13)/.test(quality)) return "7";
  return quality;
}

/**
 * `degree` is the chord's root counted in semitones above the key's tonic; `minor` says whether
 * the key is minor. "Home" chords are the ones that sound settled: I and IV in a major key,
 * III and VI in a minor key.
 */
function jazzy(quality: string, degree: number, minor: boolean): string {
  const home = minor ? degree === 3 || degree === 8 : degree === 0 || degree === 5;
  if (quality === "") return home ? "maj7" : "7";
  if (quality === "m") return "m7";
  if (quality === "7") return "9";
  if (quality === "sus4" || quality === "sus") return "7sus4";
  if (quality === "dim") return "m7b5";
  return quality;
}

function gospel(quality: string, degree: number, minor: boolean): string {
  const home = minor ? degree === 3 || degree === 8 : degree === 0 || degree === 5;
  const fifth = !minor && degree === 7;
  if (quality === "") return home ? "add9" : fifth ? "9" : "";
  if (quality === "m") return degree === 2 && !minor ? "m9" : "m7";
  if (quality === "7") return "9";
  return quality;
}

function restyleOne(text: string, style: ChordStyle, tonic: number | null, minor: boolean): string {
  const chord = parseChord(text);
  if (!chord) return text;
  const degree = tonic === null ? 0 : (pitchClass(chord.root) - tonic + 12) % 12;
  const quality =
    style === "classic"
      ? classic(chord.quality)
      : style === "jazzy"
        ? jazzy(chord.quality, degree, minor)
        : gospel(chord.quality, degree, minor);
  return quality === chord.quality ? text : formatChord({ ...chord, quality });
}

/**
 * A chord (or several over one spot, like "G D") in the chosen style. `key` is the key the chords
 * are written in; it decides which chords count as the home chords. Anything that isn't a chord is left alone.
 */
export function restyleChord(text: string, style: ChordStyle, key: string): string {
  if (style === "original") return text;
  const k = parseChord(key);
  const tonic = k ? pitchClass(k.root) : null;
  const minor = k ? /^m(?!aj|a)/.test(k.quality) : false;
  if (/\s/.test(text.trim())) {
    return text.trim().split(/(\s+)/).map((part) => (/\s/.test(part) ? part : restyleOne(part, style, tonic, minor))).join("");
  }
  return restyleOne(text, style, tonic, minor);
}

/** The sections of a song with every chord in the chosen style. */
export function restyleSections(sections: EditorSection[], style: ChordStyle, key: string): EditorSection[] {
  if (style === "original") return sections;
  return sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => ({ ...l, chords: l.chords.map((c) => ({ ...c, chord: restyleChord(c.chord, style, key) })) })),
  }));
}
