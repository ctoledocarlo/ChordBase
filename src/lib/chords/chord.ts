export type Accidental = "#" | "b" | "";
export type Spelling = "sharp" | "flat";

export interface Note {
  letter: string;
  accidental: Accidental;
}

export interface Chord {
  root: Note;
  /** Everything between the root and the slash bass, e.g. "m7", "sus4", "add9". */
  quality: string;
  bass?: Note;
}

const LETTER_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Major keys conventionally spelled with flats: F Bb Eb Ab Db Gb. */
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1, 6]);

const CHORD_RE = /^([A-G])([#b]?)([\w#+\-°ø()/]*?)(?:\/([A-G])([#b]?))?$/;

export function pitchClass(note: Note): number {
  const offset = note.accidental === "#" ? 1 : note.accidental === "b" ? -1 : 0;
  return (LETTER_PC[note.letter] + offset + 12) % 12;
}

export function noteName(pc: number, spelling: Spelling): string {
  const i = ((pc % 12) + 12) % 12;
  return spelling === "flat" ? FLAT_NAMES[i] : SHARP_NAMES[i];
}

function toNote(name: string): Note {
  return { letter: name[0], accidental: (name[1] ?? "") as Accidental };
}

/** Returns null when the text is not a chord (e.g. "N.C.", "Intro"). */
export function parseChord(text: string): Chord | null {
  const m = CHORD_RE.exec(text.trim());
  if (!m) return null;
  const [, letter, acc, quality, bassLetter, bassAcc] = m;
  return {
    root: { letter, accidental: acc as Accidental },
    quality,
    bass: bassLetter
      ? { letter: bassLetter, accidental: bassAcc as Accidental }
      : undefined,
  };
}

/** Quality part of a chord: optional m/maj/dim/aug, a number, then sus/add/alteration extras. */
const QUALITY_RE = /^(?:maj|min|dim|aug|m|M|ø|°|\+|-)?\d{0,2}(?:sus[24]?|add\d{1,2}|no\d|[#b+-]\d{1,2}|\([^)]*\))*$/;

/** True for chords the app can transpose, plus "N.C." (no chord). */
export function isValidChord(text: string): boolean {
  const t = text.trim();
  if (/^N\.?C\.?$/i.test(t)) return true;
  const chord = parseChord(t);
  if (!chord) return false;
  return chord.quality === "6/9" || QUALITY_RE.test(chord.quality);
}

export function formatChord(chord: Chord): string {
  const note = (n: Note) => n.letter + n.accidental;
  return note(chord.root) + chord.quality + (chord.bass ? "/" + note(chord.bass) : "");
}

/** True for "m", "m7", "min" ... but not "maj7" / "M7". */
export function isMinorQuality(quality: string): boolean {
  return /^m(?!aj|a)/.test(quality);
}

/** Which accidental style reads naturally for a song in this key, e.g. "Eb" or "Gm". */
export function spellingForKey(key: string): Spelling {
  const chord = parseChord(key);
  if (!chord) return "sharp";
  const pc = pitchClass(chord.root);
  // A minor key shares its signature with the major key 3 semitones up.
  const majorPc = isMinorQuality(chord.quality) ? (pc + 3) % 12 : pc;
  return FLAT_MAJOR_KEYS.has(majorPc) ? "flat" : "sharp";
}

/** The chords that naturally belong to a key (plus the dominant 7th / major V), for quick picking. */
export function diatonicChords(key: string): string[] {
  const chord = parseChord(key);
  if (!chord) return [];
  const pc = pitchClass(chord.root);
  const spelling = spellingForKey(key);
  const steps: [number, string][] = isMinorQuality(chord.quality)
    ? [[0, "m"], [3, ""], [5, "m"], [7, "m"], [8, ""], [10, ""], [7, ""]]
    : [[0, ""], [2, "m"], [4, "m"], [5, ""], [7, ""], [9, "m"], [7, "7"]];
  return steps.map(([interval, quality]) => noteName(pc + interval, spelling) + quality);
}

/** Semitones to move a song from one key to another (0-11, always upward). */
export function semitonesBetween(fromKey: string, toKey: string): number | null {
  const from = parseChord(fromKey);
  const to = parseChord(toKey);
  if (!from || !to) return null;
  return (pitchClass(to.root) - pitchClass(from.root) + 12) % 12;
}

export function transposeChord(chord: Chord, semitones: number, spelling: Spelling): Chord {
  const move = (n: Note) => toNote(noteName(pitchClass(n) + semitones, spelling));
  return {
    root: move(chord.root),
    quality: chord.quality,
    bass: chord.bass ? move(chord.bass) : undefined,
  };
}

/** Transposes chord text; returns the input unchanged if it is not a chord. */
export function transposeChordText(text: string, semitones: number, spelling: Spelling): string {
  const chord = parseChord(text);
  return chord ? formatChord(transposeChord(chord, semitones, spelling)) : text;
}

/** The note a bass player plays: the slash bass if present, otherwise the root. */
export function bassNote(chord: Chord, spelling: Spelling = "sharp"): string {
  return noteName(pitchClass(chord.bass ?? chord.root), spelling);
}
