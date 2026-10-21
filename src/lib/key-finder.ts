/**
 * Finding a key a singer can sing. A song's melody has a lowest and highest note; a singer has a range they
 * sing comfortably. Moving the song up or down by some half steps moves the whole melody, so the question is
 * which moves keep it inside the range. Plain arithmetic on note numbers, no guessing.
 */

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A2" is 45, "C4" (middle C) is 60. Null for anything that isn't a note with an octave. */
export function noteNumber(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) return null;
  const pc = LETTER_PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return 12 * (Number(m[3]) + 1) + pc;
}

/** 45 is "A2". Black keys are written with sharps. */
export function noteLabel(n: number): string {
  return NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
}

/** The notes offered when entering a range: C2 up to C6 covers every voice. */
export const RANGE_NOTES: string[] = Array.from({ length: 49 }, (_, i) => noteLabel(36 + i));

export type Range = { low: string; high: string };

export type KeyOption = {
  /** Half steps the whole melody moves from where it is recorded (negative is lower). The nearest to zero for this key. */
  shift: number;
  /** The same move as a change of key only: -6 to +5 half steps. */
  keyShift: number;
  /** How many octaves of the move are only a change of register: 0 means no octave jump, 1 means sing it an octave higher. */
  octaves: number;
  /** The same as `shift`, as a number from 0 to 11, which is how a setlist stores a key change. */
  semitones: number;
  /** How many half steps of room are left at the tighter end of the singer's range. 0 means the top or bottom note is just reachable. */
  headroom: number;
};

export type KeyAdvice =
  | { status: "unknown"; reason: "song" | "singer" }
  | {
      status: "fits";
      /** Every key that fits, the nearest to the song's usual key first. */
      options: KeyOption[];
      /** How many half steps the melody spans, and how many the singer's range covers. */
      span: number;
      room: number;
      /** The fitting key with the most room at both ends. */
      comfortable: KeyOption;
    }
  | {
      status: "narrow";
      span: number;
      room: number;
      /** The move that centres the melody in the range, so it is out of reach by the least. */
      closest: KeyOption;
      /** How far the melody still goes beyond the range at the bottom and the top, in half steps, in that key. */
      belowBy: number;
      aboveBy: number;
    };

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Which keys of a song a singer can sing from start to finish. */
export function adviseKey(melody: Range, singer: Range): KeyAdvice {
  const lo = noteNumber(melody.low);
  const hi = noteNumber(melody.high);
  if (lo === null || hi === null || hi < lo) return { status: "unknown", reason: "song" };
  const rl = noteNumber(singer.low);
  const rh = noteNumber(singer.high);
  if (rl === null || rh === null || rh < rl) return { status: "unknown", reason: "singer" };

  const span = hi - lo;
  const room = rh - rl;
  const option = (shift: number): KeyOption => {
    const keyShift = ((mod12(shift) + 6) % 12) - 6;
    return {
    shift,
    keyShift,
    octaves: Math.round((shift - keyShift) / 12),
    semitones: mod12(shift),
    headroom: Math.min(lo + shift - rl, rh - (hi + shift)),
    };
  };

  // Moving up an octave is the same key, so only the nearest move for each key counts.
  const byKey = new Map<number, KeyOption>();
  for (let shift = -24; shift <= 24; shift++) {
    const o = option(shift);
    if (o.headroom < 0) continue;
    const have = byKey.get(o.semitones);
    if (!have || Math.abs(shift) < Math.abs(have.shift)) byKey.set(o.semitones, o);
  }
  const options = [...byKey.values()].sort((a, b) => Math.abs(a.shift) - Math.abs(b.shift) || b.headroom - a.headroom);

  if (options.length > 0) {
    const comfortable = [...options].sort((a, b) => b.headroom - a.headroom || Math.abs(a.shift) - Math.abs(b.shift))[0];
    return { status: "fits", options, span, room, comfortable };
  }

  // Nothing fits: centre the melody in the range and say how far it still overshoots.
  const centre = Math.round((rl + rh) / 2 - (lo + hi) / 2);
  const closest = option(centre);
  return {
    status: "narrow",
    span,
    room,
    closest,
    belowBy: Math.max(0, rl - (lo + centre)),
    aboveBy: Math.max(0, hi + centre - rh),
  };
}

/** "Sing it an octave higher", for the part of a move that is only a change of register. Empty when there is none. */
export function octaveWords(octaves: number): string {
  if (octaves === 0) return "";
  const n = Math.abs(octaves);
  return `${n === 1 ? "an octave" : `${n} octaves`} ${octaves > 0 ? "higher" : "lower"}`;
}

/** "up 2", "down 3" or "its usual key". */
export function shiftWords(shift: number): string {
  if (shift === 0) return "its usual key";
  return `${shift > 0 ? "up" : "down"} ${Math.abs(shift)} half step${Math.abs(shift) === 1 ? "" : "s"}`;
}
