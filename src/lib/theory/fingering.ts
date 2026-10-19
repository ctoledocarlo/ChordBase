/**
 * Standard piano fingerings for the major scales over one octave plus the top note (8 notes), the way
 * they are taught: the thumb never lands on a black key, and the thumb tucks under (or the hand crosses
 * over) after the 3rd or 4th finger so the hand keeps moving smoothly.
 */

type Fingering = { right: number[]; left: number[] };

const standard: Fingering = { right: [1, 2, 3, 1, 2, 3, 4, 5], left: [5, 4, 3, 2, 1, 3, 2, 1] };
const fourFour: Fingering = { right: [1, 2, 3, 4, 1, 2, 3, 4], left: [5, 4, 3, 2, 1, 3, 2, 1] };
const flatsLeft = [3, 2, 1, 4, 3, 2, 1, 3];

/** Major scales, by the note they start on. */
export const MAJOR_FINGERINGS: Record<string, Fingering> = {
  C: standard,
  G: standard,
  D: standard,
  A: standard,
  E: standard,
  B: { right: [1, 2, 3, 1, 2, 3, 4, 5], left: [4, 3, 2, 1, 4, 3, 2, 1] },
  "F#": { right: [2, 3, 4, 1, 2, 3, 1, 2], left: [4, 3, 2, 1, 3, 2, 1, 4] },
  Gb: { right: [2, 3, 4, 1, 2, 3, 1, 2], left: [4, 3, 2, 1, 3, 2, 1, 4] },
  Db: { right: [2, 3, 1, 2, 3, 4, 1, 2], left: flatsLeft },
  Ab: { right: [3, 4, 1, 2, 3, 1, 2, 3], left: flatsLeft },
  Eb: { right: [3, 1, 2, 3, 4, 1, 2, 3], left: flatsLeft },
  Bb: { right: [4, 1, 2, 3, 1, 2, 3, 4], left: flatsLeft },
  F: fourFour,
};

/** The natural minor scales that start on a white key use the same shapes as their neighbours. */
export const MINOR_FINGERINGS: Record<string, Fingering> = {
  A: standard,
  E: standard,
  D: standard,
};

/** The fingering for a scale, or null when there isn't a standard one in the table. Just the first octave. */
export function scaleFingering(root: string, type: string, hand: "R" | "L"): number[] | null {
  const table = type === "major" ? MAJOR_FINGERINGS : type === "natural-minor" ? MINOR_FINGERINGS : null;
  const found = table?.[root];
  return found ? (hand === "R" ? found.right : found.left) : null;
}
