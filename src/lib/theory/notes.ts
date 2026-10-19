/**
 * Notes for the Practice section. Notes are spelled properly (F-sharp major has an E-sharp, not an F),
 * which is what makes scales and chords read correctly for a beginner. Rule-based, no guessing.
 */

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Letter = (typeof LETTERS)[number];

/** The pitch class (0 to 11, with C as 0) of each plain letter. */
const NATURAL: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A note written with a letter and sharps (positive) or flats (negative). */
export type Spelled = { letter: Letter; accidental: number; pc: number };

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The note with this letter (by position in C D E F G A B) that sounds at this pitch class. */
export function spell(letterIndex: number, pc: number): Spelled {
  const letter = LETTERS[mod(letterIndex, 7)];
  // How far the pitch is from the plain letter, taken the short way round (-6 to +5).
  const accidental = mod(pc - NATURAL[letter] + 6, 12) - 6;
  return { letter, accidental, pc: mod(pc, 12) };
}

/** "C", "F#", "Bb", "F##"... */
export function noteName(s: Pick<Spelled, "letter" | "accidental">): string {
  const a = s.accidental;
  return s.letter + (a > 0 ? "#".repeat(a) : a < 0 ? "b".repeat(-a) : "");
}

/** Reads "C", "F#", "Bb", "Ebb"... Returns null for anything else. */
export function parseNote(name: string): Spelled | null {
  const m = /^([A-G])(#{0,2}|b{0,2})$/.exec(name.trim());
  if (!m) return null;
  const letter = m[1] as Letter;
  const accidental = m[2].startsWith("#") ? m[2].length : m[2].startsWith("b") ? -m[2].length : 0;
  return { letter, accidental, pc: mod(NATURAL[letter] + accidental, 12) };
}

/** A note name with proper sharp and flat signs, for showing to people: "F#" becomes "F♯". */
export function pretty(name: string): string {
  return name.replace(/##/g, "𝄪").replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭").replace(/(?<=♭)b/g, "♭");
}

/** The note's number on a keyboard: C4 (middle C) is 60, and each key up is one more. */
export const midiOf = (pc: number, octave: number) => 12 * (octave + 1) + mod(pc, 12);

export const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(mod(midi, 12));

/** The name of a key by its number, with an octave: 60 is "C4". Black keys use sharps unless `flats`. */
export function keyName(midi: number, flats = false): string {
  const sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const flat = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return (flats ? flat : sharp)[mod(midi, 12)] + octave;
}

/** How high a key sounds, in hertz (A4 is 440). */
export const frequencyOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
