import { noteName, parseChord, pitchClass, spellingForKey, type Spelling } from "./chord";

export type KeyChord = {
  /** Roman numeral for the step of the scale: "I", "ii", "vii°". */
  numeral: string;
  /** The plain chord on that step: "G", "Am", "Bdim". */
  triad: string;
  /** The same step as a seventh chord: "Gmaj7", "Am7", "D7". */
  seventh: string;
  /** Pitch class (0-11) of the root, for matching chords used in a song. */
  pc: number;
};

const MAJOR = {
  intervals: [0, 2, 4, 5, 7, 9, 11],
  triads: ["", "m", "m", "", "", "m", "dim"],
  sevenths: ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"],
  numerals: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
};

// The natural minor scale.
const MINOR = {
  intervals: [0, 2, 3, 5, 7, 8, 10],
  triads: ["m", "dim", "", "m", "m", "", ""],
  sevenths: ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"],
  numerals: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
};

/**
 * The seven chords that belong to a key, step by step, spelled the way that key is usually written
 * (flats in F, sharps in G). Returns an empty list when the key isn't one we can read.
 */
export function chordsInKey(key: string, spelling?: Spelling): KeyChord[] {
  const chord = parseChord(key);
  if (!chord) return [];
  const minor = /^m(?!aj|a)/.test(chord.quality);
  const scale = minor ? MINOR : MAJOR;
  const root = pitchClass(chord.root);
  const names = spelling ?? spellingForKey(key);
  return scale.intervals.map((interval, i) => {
    const pc = (root + interval) % 12;
    const name = noteName(pc, names);
    return {
      numeral: scale.numerals[i],
      triad: name + scale.triads[i],
      seventh: name + scale.sevenths[i],
      pc,
    };
  });
}
