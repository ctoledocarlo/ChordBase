import { LETTERS, noteName, parseNote, pretty, spell } from "./notes";

export type ChordQuality =
  | "major"
  | "minor"
  | "dim"
  | "aug"
  | "sus2"
  | "sus4"
  | "dom7"
  | "maj7"
  | "min7"
  | "m7b5"
  | "add9";

type Part = {
  /** Half steps above the root. */
  semis: number;
  /** How many letters above the root's letter (a 3rd is 2 letters up, a 5th is 4). */
  letters: number;
  /** What this note is called in the chord: "1", "♭3", "5"... */
  role: string;
};

export type QualityDef = {
  label: string;
  /** What gets written after the root: "", "m", "7"... */
  symbol: string;
  /** The recipe in plain numbers, like "1 ♭3 5". */
  formula: string;
  parts: Part[];
  /** One beginner-friendly sentence about how it sounds and where it is used. */
  blurb: string;
  /** Where it comes from, in words. */
  recipe: string;
};

const R: Part = { semis: 0, letters: 0, role: "1" };

export const QUALITIES: Record<ChordQuality, QualityDef> = {
  major: {
    label: "Major",
    symbol: "",
    formula: "1 3 5",
    parts: [R, { semis: 4, letters: 2, role: "3" }, { semis: 7, letters: 4, role: "5" }],
    blurb: "Bright and happy. The chord most songs lean on.",
    recipe: "The root, the note 4 half steps up (the major 3rd), and the note 7 half steps up (the 5th).",
  },
  minor: {
    label: "Minor",
    symbol: "m",
    formula: "1 ♭3 5",
    parts: [R, { semis: 3, letters: 2, role: "♭3" }, { semis: 7, letters: 4, role: "5" }],
    blurb: "Darker, softer, more thoughtful. It is the major chord with the middle note lowered one half step.",
    recipe: "The root, the note 3 half steps up (the minor 3rd), and the 5th.",
  },
  dim: {
    label: "Diminished",
    symbol: "dim",
    formula: "1 ♭3 ♭5",
    parts: [R, { semis: 3, letters: 2, role: "♭3" }, { semis: 6, letters: 4, role: "♭5" }],
    blurb: "Tense and unsettled, like a question that wants an answer. Used to pass from one chord to the next.",
    recipe: "A minor chord with the 5th lowered one half step.",
  },
  aug: {
    label: "Augmented",
    symbol: "aug",
    formula: "1 3 ♯5",
    parts: [R, { semis: 4, letters: 2, role: "3" }, { semis: 8, letters: 4, role: "♯5" }],
    blurb: "Dreamy and stretched, leaning forward. A major chord with the 5th raised one half step.",
    recipe: "A major chord with the 5th raised one half step.",
  },
  sus2: {
    label: "Suspended 2nd (sus2)",
    symbol: "sus2",
    formula: "1 2 5",
    parts: [R, { semis: 2, letters: 1, role: "2" }, { semis: 7, letters: 4, role: "5" }],
    blurb: "Open and airy, neither happy nor sad. A favourite in worship because it leaves room for the melody.",
    recipe: "The 3rd is swapped for the 2nd, so the chord is neither major nor minor.",
  },
  sus4: {
    label: "Suspended 4th (sus4)",
    symbol: "sus4",
    formula: "1 4 5",
    parts: [R, { semis: 5, letters: 3, role: "4" }, { semis: 7, letters: 4, role: "5" }],
    blurb: "Hanging and expectant; it usually wants to settle back onto the plain chord.",
    recipe: "The 3rd is swapped for the 4th.",
  },
  dom7: {
    label: "Dominant 7th",
    symbol: "7",
    formula: "1 3 5 ♭7",
    parts: [R, { semis: 4, letters: 2, role: "3" }, { semis: 7, letters: 4, role: "5" }, { semis: 10, letters: 6, role: "♭7" }],
    blurb: "A major chord with a bluesy, restless note on top that pulls toward the next chord.",
    recipe: "A major chord plus the note 10 half steps above the root.",
  },
  maj7: {
    label: "Major 7th",
    symbol: "maj7",
    formula: "1 3 5 7",
    parts: [R, { semis: 4, letters: 2, role: "3" }, { semis: 7, letters: 4, role: "5" }, { semis: 11, letters: 6, role: "7" }],
    blurb: "Smooth, warm and a little dreamy. A major chord with the note just under the octave added.",
    recipe: "A major chord plus the note 11 half steps above the root.",
  },
  min7: {
    label: "Minor 7th",
    symbol: "m7",
    formula: "1 ♭3 5 ♭7",
    parts: [R, { semis: 3, letters: 2, role: "♭3" }, { semis: 7, letters: 4, role: "5" }, { semis: 10, letters: 6, role: "♭7" }],
    blurb: "Mellow and soulful, a softer minor. Very common in gospel and modern worship.",
    recipe: "A minor chord plus the note 10 half steps above the root.",
  },
  m7b5: {
    label: "Half-diminished (m7♭5)",
    symbol: "m7♭5",
    formula: "1 ♭3 ♭5 ♭7",
    parts: [R, { semis: 3, letters: 2, role: "♭3" }, { semis: 6, letters: 4, role: "♭5" }, { semis: 10, letters: 6, role: "♭7" }],
    blurb: "Moody and unresolved. It appears naturally on the 7th step of a major key.",
    recipe: "A diminished chord plus the note 10 half steps above the root.",
  },
  add9: {
    label: "Add 9",
    symbol: "add9",
    formula: "1 3 5 9",
    parts: [R, { semis: 4, letters: 2, role: "3" }, { semis: 7, letters: 4, role: "5" }, { semis: 14, letters: 8, role: "9" }],
    blurb: "A major chord with a sparkly extra note on top (the 2nd, one octave up). It adds shimmer without changing the mood.",
    recipe: "A major chord plus the 2nd, played an octave higher.",
  },
};

export const TRIAD_QUALITIES: ChordQuality[] = ["major", "minor", "dim", "aug", "sus2", "sus4"];
export const COLOUR_QUALITIES: ChordQuality[] = ["dom7", "maj7", "min7", "m7b5", "add9"];

export type ChordNote = { name: string; pc: number; semis: number; role: string };

/** The notes of a chord above `root` ("G", "Bb"...), spelled correctly. Empty if the root isn't a note. */
export function chordNotes(root: string, quality: ChordQuality): ChordNote[] {
  const start = parseNote(root);
  if (!start) return [];
  const first = LETTERS.indexOf(start.letter);
  return QUALITIES[quality].parts.map((p) => {
    const note = spell(first + p.letters, start.pc + p.semis);
    return { name: noteName(note), pc: note.pc, semis: p.semis, role: p.role };
  });
}

/** How the chord is written on a chart: "Gm", "Bbmaj7"... with proper flat signs when `fancy`. */
export function chordSymbol(root: string, quality: ChordQuality, fancy = true): string {
  const text = root + QUALITIES[quality].symbol;
  return fancy ? pretty(text) : text;
}

export type Voicing = { midis: number[]; roles: string[]; names: string[] };

/**
 * The keys to press for a chord: root position, 1st or 2nd (or 3rd, for four-note chords) inversion.
 * `rootMidi` is where the root sits in root position; each inversion moves the lowest note up an octave.
 */
export function voicing(root: string, quality: ChordQuality, inversion: number, rootMidi: number): Voicing {
  const notes = chordNotes(root, quality);
  const count = Math.min(Math.max(0, inversion), notes.length - 1);
  const items = notes
    .map((n, i) => ({ midi: rootMidi + n.semis + (i < count ? 12 : 0), role: n.role, name: n.name }))
    .sort((a, b) => a.midi - b.midi);
  return { midis: items.map((i) => i.midi), roles: items.map((i) => i.role), names: items.map((i) => i.name) };
}

/** Names for each way of stacking the same notes. */
export const INVERSION_NAMES = ["Root position", "1st inversion", "2nd inversion", "3rd inversion"];

/**
 * A comfortable finger for each key of a chord, lowest key first. Triads use the classic 1-3-5 shape
 * (and 1-2-5 for a first inversion); four-note chords use 1-2-3-5. The left hand mirrors it.
 */
export function chordFingers(noteCount: number, inversion: number, hand: "R" | "L"): number[] {
  let right: number[];
  if (noteCount >= 4) right = [1, 2, 3, 5];
  else right = inversion === 1 ? [1, 2, 5] : [1, 3, 5];
  if (hand === "R") return right;
  // Left hand: the thumb is on the highest key, so the numbers run the other way round.
  if (noteCount >= 4) return [5, 3, 2, 1];
  return inversion === 1 ? [5, 2, 1] : [5, 3, 1];
}

/** The chords that belong to a key, by Roman numeral: I ii iii IV V vi vii° in major, i ii° III iv v VI VII in minor. */
export type KeyChord = { numeral: string; root: string; quality: ChordQuality; function: string };

const MAJOR_KEY: { numeral: string; quality: ChordQuality; function: string }[] = [
  { numeral: "I", quality: "major", function: "Home. Where the song feels settled." },
  { numeral: "ii", quality: "minor", function: "Gentle step away from home; often leads to V." },
  { numeral: "iii", quality: "minor", function: "A soft, in-between colour." },
  { numeral: "IV", quality: "major", function: "Lifts away from home; the “amen” chord." },
  { numeral: "V", quality: "major", function: "Tension that wants to return home to I." },
  { numeral: "vi", quality: "minor", function: "The relative minor: the sad cousin of I." },
  { numeral: "vii°", quality: "dim", function: "The most tense chord; rare in worship songs." },
];

const MINOR_KEY: { numeral: string; quality: ChordQuality; function: string }[] = [
  { numeral: "i", quality: "minor", function: "Home in a minor key." },
  { numeral: "ii°", quality: "dim", function: "Tense step away from home." },
  { numeral: "III", quality: "major", function: "Bright; it is the relative major." },
  { numeral: "iv", quality: "minor", function: "Deepens the mood." },
  { numeral: "v", quality: "minor", function: "A softer pull back to i." },
  { numeral: "VI", quality: "major", function: "Warm and hopeful." },
  { numeral: "VII", quality: "major", function: "Lifts toward the next chord." },
];

/** The seven chords of a key, each named by the notes of that key's scale. */
export function keyChords(root: string, mode: "major" | "minor"): KeyChord[] {
  const start = parseNote(root);
  if (!start) return [];
  const steps = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const table = mode === "major" ? MAJOR_KEY : MINOR_KEY;
  const first = LETTERS.indexOf(start.letter);
  return table.map((row, i) => {
    const note = spell(first + i, start.pc + steps[i]);
    return { numeral: row.numeral, root: noteName(note), quality: row.quality, function: row.function };
  });
}

export type Progression = { name: string; numerals: number[]; feel: string };

/** Progressions as positions in the key (0 is I), with a word on how they feel. */
export const PROGRESSIONS: { name: string; mode: "major" | "minor"; degrees: number[]; feel: string }[] = [
  { name: "I – V – vi – IV", mode: "major", degrees: [0, 4, 5, 3], feel: "The most-used pattern in modern songs: uplifting and familiar." },
  { name: "I – IV – V", mode: "major", degrees: [0, 3, 4], feel: "The three-chord classic: hymns, folk, rock." },
  { name: "vi – IV – I – V", mode: "major", degrees: [5, 3, 0, 4], feel: "The same chords starting on the sad one: reflective, building." },
  { name: "I – vi – IV – V", mode: "major", degrees: [0, 5, 3, 4], feel: "The old “fifties” loop: warm and nostalgic." },
  { name: "ii – V – I", mode: "major", degrees: [1, 4, 0], feel: "The smoothest way home; the heart of jazz and gospel turnarounds." },
  { name: "i – VI – III – VII", mode: "minor", degrees: [0, 5, 2, 6], feel: "A minor-key loop that feels cinematic and hopeful." },
  { name: "i – iv – v", mode: "minor", degrees: [0, 3, 4], feel: "A simple minor-key trio: serious and prayerful." },
];

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/**
 * The key to press for each chord of a progression so the hand moves as little as possible: for every chord after
 * the first, the inversion (and octave) whose notes sit closest to the chord before. The first chord is root position.
 * Notes stay between G3 (55) and G5 (79) so the hand stays in a comfortable middle of the keyboard.
 */
export function smoothVoicings(chords: { root: string; quality: ChordQuality }[]): (Voicing & { inversion: number })[] {
  const out: (Voicing & { inversion: number })[] = [];
  for (const chord of chords) {
    const pc = parseNote(chord.root)?.pc ?? 0;
    const home = 55 + mod12(pc - 55);
    const previous = out[out.length - 1];
    if (!previous) {
      out.push({ ...voicing(chord.root, chord.quality, 0, home), inversion: 0 });
      continue;
    }
    const size = chordNotes(chord.root, chord.quality).length;
    let best: (Voicing & { inversion: number }) | null = null;
    let bestDistance = Infinity;
    for (let inversion = 0; inversion < size; inversion++) {
      for (const shift of [-12, 0, 12]) {
        const v = voicing(chord.root, chord.quality, inversion, home + shift);
        if (v.midis[0] < 55 || v.midis[v.midis.length - 1] > 79) continue;
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
        // Compare note by note when both chords have the same number of notes; otherwise compare their centres.
        // On a tie, prefer the one where no single note leaps far (every note moving a little beats one moving a lot).
        const moves = v.midis.length === previous.midis.length ? v.midis.map((m, i) => Math.abs(m - previous.midis[i])) : null;
        const distance = moves
          ? moves.reduce((a, b) => a + b, 0) + 0.1 * Math.max(...moves)
          : Math.abs(mean(v.midis) - mean(previous.midis)) * v.midis.length;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { ...v, inversion };
        }
      }
    }
    out.push(best ?? { ...voicing(chord.root, chord.quality, 0, home), inversion: 0 });
  }
  return out;
}
