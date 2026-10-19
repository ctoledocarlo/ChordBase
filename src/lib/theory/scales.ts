import { LETTERS, noteName, parseNote, spell } from "./notes";

export type ScaleType =
  | "major"
  | "natural-minor"
  | "harmonic-minor"
  | "melodic-minor"
  | "major-pentatonic"
  | "minor-pentatonic"
  | "blues";

type ScaleDef = {
  label: string;
  /** Half steps up from the first note, for each note of the scale. */
  steps: number[];
  /** Which letter each note uses, counted from the first note's letter (so every letter is used once in a 7-note scale). */
  letters: number[];
  /** What each note is called by its place in the scale: "1", "2", "b3"... */
  degrees: string[];
  /** One plain sentence on what makes it sound the way it does. */
  blurb: string;
};

export const SCALES: Record<ScaleType, ScaleDef> = {
  major: {
    label: "Major",
    steps: [0, 2, 4, 5, 7, 9, 11],
    letters: [0, 1, 2, 3, 4, 5, 6],
    degrees: ["1", "2", "3", "4", "5", "6", "7"],
    blurb: "The bright, settled sound most songs are built on.",
  },
  "natural-minor": {
    label: "Natural minor",
    steps: [0, 2, 3, 5, 7, 8, 10],
    letters: [0, 1, 2, 3, 4, 5, 6],
    degrees: ["1", "2", "♭3", "4", "5", "♭6", "♭7"],
    blurb: "The darker, more serious cousin of major.",
  },
  "harmonic-minor": {
    label: "Harmonic minor",
    steps: [0, 2, 3, 5, 7, 8, 11],
    letters: [0, 1, 2, 3, 4, 5, 6],
    degrees: ["1", "2", "♭3", "4", "5", "♭6", "7"],
    blurb: "Minor with a raised 7th, so the last note leans strongly home.",
  },
  "melodic-minor": {
    label: "Melodic minor (going up)",
    steps: [0, 2, 3, 5, 7, 9, 11],
    letters: [0, 1, 2, 3, 4, 5, 6],
    degrees: ["1", "2", "♭3", "4", "5", "6", "7"],
    blurb: "Minor with the 6th and 7th raised, which smooths the climb. Coming down, it is usually played as natural minor.",
  },
  "major-pentatonic": {
    label: "Major pentatonic",
    steps: [0, 2, 4, 7, 9],
    letters: [0, 1, 2, 4, 5],
    degrees: ["1", "2", "3", "5", "6"],
    blurb: "Five notes from the major scale with no awkward ones. Almost everything you play on it sounds good.",
  },
  "minor-pentatonic": {
    label: "Minor pentatonic",
    steps: [0, 3, 5, 7, 10],
    letters: [0, 2, 3, 4, 6],
    degrees: ["1", "♭3", "4", "5", "♭7"],
    blurb: "The five-note minor sound behind a lot of rock, gospel and blues.",
  },
  blues: {
    label: "Blues",
    steps: [0, 3, 5, 6, 7, 10],
    letters: [0, 2, 3, 4, 4, 6],
    degrees: ["1", "♭3", "4", "♭5", "5", "♭7"],
    blurb: "The minor pentatonic plus the “blue note”, the ♭5, for that bending, leaning feel.",
  },
};

export type ScaleNote = { name: string; pc: number; degree: string; step: number };

/** The notes of a scale starting on `root` ("F#", "Bb"...), spelled correctly. Empty if the root isn't a note. */
export function scaleNotes(root: string, type: ScaleType): ScaleNote[] {
  const start = parseNote(root);
  if (!start) return [];
  const def = SCALES[type];
  const first = LETTERS.indexOf(start.letter);
  return def.steps.map((step, i) => {
    const note = spell(first + def.letters[i], start.pc + step);
    return { name: noteName(note), pc: note.pc, degree: def.degrees[i], step };
  });
}

/** The gaps between neighbouring notes of a seven-note scale (and back to the top), in half steps: W is 2, H is 1. */
export function stepPattern(type: ScaleType): string[] {
  const { steps } = SCALES[type];
  return steps.map((s, i) => {
    const gap = (i + 1 < steps.length ? steps[i + 1] : 12) - s;
    return gap === 1 ? "H" : gap === 2 ? "W" : gap === 3 ? "W+H" : `${gap}`;
  });
}

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

export type KeySignature = { sharps: string[]; flats: string[]; count: number };

/** The sharps or flats in a key's signature (in the order they are written), for a major or a minor key. */
export function keySignature(root: string, mode: "major" | "minor"): KeySignature {
  const notes = scaleNotes(root, mode === "major" ? "major" : "natural-minor");
  const sharpLetters = new Set(notes.filter((n) => n.name.includes("#")).map((n) => n.name[0]));
  const flatLetters = new Set(notes.filter((n) => /^[A-G]b/.test(n.name)).map((n) => n.name[0]));
  const sharps = SHARP_ORDER.filter((l) => sharpLetters.has(l));
  const flats = FLAT_ORDER.filter((l) => flatLetters.has(l));
  return { sharps, flats, count: sharps.length + flats.length };
}

/** The minor key that shares a major key's notes: it starts on the 6th note. */
export function relativeMinor(majorRoot: string): string {
  return scaleNotes(majorRoot, "major")[5]?.name ?? "";
}
