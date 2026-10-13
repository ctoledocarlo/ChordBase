import { isMinorQuality, noteName, parseChord, pitchClass, spellingForKey } from "@/lib/chords";

type Quality = "major" | "minor";

/** Chords that belong to a key, as steps above the tonic. */
const MAJOR_KEY: [number, Quality][] = [
  [0, "major"],
  [2, "minor"],
  [4, "minor"],
  [5, "major"],
  [7, "major"],
  [9, "minor"],
];
// Natural minor, plus the major V that minor-key songs often use.
const MINOR_KEY: [number, Quality][] = [
  [0, "minor"],
  [3, "major"],
  [5, "minor"],
  [7, "minor"],
  [7, "major"],
  [8, "major"],
  [10, "major"],
];

export interface DetectedKey {
  key: string;
  /** "high" when one key clearly fits better than any other. */
  confidence: "high" | "low";
}

interface Heard {
  pc: number;
  quality: Quality;
}

function hear(chord: string): Heard | null {
  const parsed = parseChord(chord);
  if (!parsed) return null;
  return { pc: pitchClass(parsed.root), quality: isMinorQuality(parsed.quality) ? "minor" : "major" };
}

function score(chords: Heard[], tonic: number, mode: Quality): number {
  const degrees = mode === "major" ? MAJOR_KEY : MINOR_KEY;
  let total = 0;
  for (const c of chords) {
    const step = (c.pc - tonic + 12) % 12;
    if (degrees.some(([s, q]) => s === step && q === c.quality)) total += 2;
    else if (degrees.some(([s]) => s === step)) total += 0.5;
  }
  // Songs usually begin and end on the home chord.
  const first = chords[0];
  const last = chords[chords.length - 1];
  if (first.pc === tonic && first.quality === mode) total += 3;
  if (last.pc === tonic && last.quality === mode) total += 2;
  return total;
}

/**
 * Works out the most likely key from the chords used, in the order they appear.
 * Only a guess: the chords of a major key and of its relative minor are the same,
 * so the song's first and last chords decide between them.
 */
export function detectKey(chordNames: string[]): DetectedKey | null {
  const chords = chordNames.map(hear).filter((c): c is Heard => c !== null);
  if (chords.length === 0) return null;

  const candidates: { tonic: number; mode: Quality; score: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"] as const) {
      candidates.push({ tonic, mode, score: score(chords, tonic, mode) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const [best, second] = candidates;

  const suffix = best.mode === "minor" ? "m" : "";
  // Name the key the way the song's own home chord is written (F# or Gb), if that chord appears.
  const written = chordNames
    .map((name) => parseChord(name))
    .find((c) => c && pitchClass(c.root) === best.tonic && isMinorQuality(c.quality) === (best.mode === "minor"));
  const name = written
    ? written.root.letter + written.root.accidental
    : noteName(best.tonic, spellingForKey(noteName(best.tonic, "sharp") + suffix));
  return { key: name + suffix, confidence: best.score - second.score >= 3 ? "high" : "low" };
}
