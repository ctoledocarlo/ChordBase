import { describe, expect, it } from "vitest";
import { INVERSION_NAMES, QUALITIES, chordFingers, chordNotes, chordSymbol, keyChords, smoothVoicings, voicing } from "./chords";
import { INTERVALS } from "./intervals";
import { scaleFingering } from "./fingering";
import { frequencyOf, isBlack, keyName, midiOf, noteName, parseNote, pretty, spell } from "./notes";
import { SCALES, keySignature, relativeMinor, scaleNotes, stepPattern, type ScaleType } from "./scales";

const names = (root: string, type: ScaleType) => scaleNotes(root, type).map((n) => n.name);

describe("notes", () => {
  it("reads and writes note names", () => {
    expect(parseNote("F#")).toMatchObject({ letter: "F", accidental: 1, pc: 6 });
    expect(parseNote("Bb")).toMatchObject({ letter: "B", accidental: -1, pc: 10 });
    expect(parseNote("Cb")?.pc).toBe(11);
    expect(parseNote("H")).toBeNull();
    expect(parseNote("")).toBeNull();
    expect(noteName(spell(2, 3))).toBe("Eb");
    expect(noteName(spell(3, 4))).toBe("Fb");
    expect(noteName(spell(2, 5))).toBe("E#");
  });

  it("shows proper sharp and flat signs", () => {
    expect(pretty("Bb")).toBe("B♭");
    expect(pretty("F#m7")).toBe("F♯m7");
    expect(pretty("Ebb")).toBe("E♭♭");
    expect(pretty("Bbmaj7")).toBe("B♭maj7");
  });

  it("numbers the keys like a keyboard", () => {
    expect(midiOf(0, 4)).toBe(60);
    expect(keyName(60)).toBe("C4");
    expect(keyName(61)).toBe("C#4");
    expect(keyName(61, true)).toBe("Db4");
    expect(isBlack(61)).toBe(true);
    expect(isBlack(62)).toBe(false);
    expect(frequencyOf(69)).toBeCloseTo(440);
    expect(frequencyOf(57)).toBeCloseTo(220);
  });
});

describe("scales", () => {
  it("spells every major key correctly, using each letter once", () => {
    expect(names("C", "major")).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(names("G", "major")).toEqual(["G", "A", "B", "C", "D", "E", "F#"]);
    expect(names("F", "major")).toEqual(["F", "G", "A", "Bb", "C", "D", "E"]);
    expect(names("Bb", "major")).toEqual(["Bb", "C", "D", "Eb", "F", "G", "A"]);
    expect(names("F#", "major")).toEqual(["F#", "G#", "A#", "B", "C#", "D#", "E#"]);
    expect(names("Db", "major")).toEqual(["Db", "Eb", "F", "Gb", "Ab", "Bb", "C"]);
    for (const root of ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"]) {
      const letters = scaleNotes(root, "major").map((n) => n.name[0]);
      expect(new Set(letters).size, root).toBe(7);
    }
  });

  it("builds the minor scales and the pentatonic and blues scales", () => {
    expect(names("A", "natural-minor")).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(names("Eb", "natural-minor")).toEqual(["Eb", "F", "Gb", "Ab", "Bb", "Cb", "Db"]);
    expect(names("A", "harmonic-minor")).toEqual(["A", "B", "C", "D", "E", "F", "G#"]);
    expect(names("A", "melodic-minor")).toEqual(["A", "B", "C", "D", "E", "F#", "G#"]);
    expect(names("C", "major-pentatonic")).toEqual(["C", "D", "E", "G", "A"]);
    expect(names("A", "minor-pentatonic")).toEqual(["A", "C", "D", "E", "G"]);
    expect(names("C", "blues")).toEqual(["C", "Eb", "F", "Gb", "G", "Bb"]);
  });

  it("gives every note its place in the scale", () => {
    expect(scaleNotes("C", "natural-minor").map((n) => n.degree)).toEqual(["1", "2", "♭3", "4", "5", "♭6", "♭7"]);
    expect(scaleNotes("nonsense", "major")).toEqual([]);
    for (const type of Object.keys(SCALES) as ScaleType[]) {
      expect(SCALES[type].steps.length).toBe(SCALES[type].letters.length);
      expect(SCALES[type].steps.length).toBe(SCALES[type].degrees.length);
    }
  });

  it("shows the whole and half steps", () => {
    expect(stepPattern("major")).toEqual(["W", "W", "H", "W", "W", "W", "H"]);
    expect(stepPattern("natural-minor")).toEqual(["W", "H", "W", "W", "H", "W", "W"]);
    expect(stepPattern("harmonic-minor")).toEqual(["W", "H", "W", "W", "H", "W+H", "H"]);
  });

  it("knows the key signatures, in the order they are written", () => {
    expect(keySignature("C", "major")).toEqual({ sharps: [], flats: [], count: 0 });
    expect(keySignature("G", "major").sharps).toEqual(["F"]);
    expect(keySignature("D", "major").sharps).toEqual(["F", "C"]);
    expect(keySignature("F#", "major")).toMatchObject({ count: 6, sharps: ["F", "C", "G", "D", "A", "E"] });
    expect(keySignature("F", "major").flats).toEqual(["B"]);
    expect(keySignature("Bb", "major").flats).toEqual(["B", "E"]);
    expect(keySignature("Db", "major").flats).toEqual(["B", "E", "A", "D", "G"]);
    expect(keySignature("A", "minor").count).toBe(0);
    expect(keySignature("D", "minor").flats).toEqual(["B"]);
    expect(keySignature("E", "minor").sharps).toEqual(["F"]);
  });

  it("finds the relative minor, the 6th note", () => {
    expect(relativeMinor("C")).toBe("A");
    expect(relativeMinor("Eb")).toBe("C");
    expect(relativeMinor("A")).toBe("F#");
    expect(relativeMinor("Db")).toBe("Bb");
  });
});

describe("chords", () => {
  const spelled = (root: string, q: Parameters<typeof chordNotes>[1]) => chordNotes(root, q).map((n) => n.name);

  it("spells triads with the right letters", () => {
    expect(spelled("C", "major")).toEqual(["C", "E", "G"]);
    expect(spelled("G", "minor")).toEqual(["G", "Bb", "D"]);
    expect(spelled("F#", "major")).toEqual(["F#", "A#", "C#"]);
    expect(spelled("Bb", "major")).toEqual(["Bb", "D", "F"]);
    expect(spelled("B", "dim")).toEqual(["B", "D", "F"]);
    expect(spelled("C", "aug")).toEqual(["C", "E", "G#"]);
    expect(spelled("D", "sus2")).toEqual(["D", "E", "A"]);
    expect(spelled("D", "sus4")).toEqual(["D", "G", "A"]);
  });

  it("spells seventh and added-note chords", () => {
    expect(spelled("C", "dom7")).toEqual(["C", "E", "G", "Bb"]);
    expect(spelled("E", "maj7")).toEqual(["E", "G#", "B", "D#"]);
    expect(spelled("A", "min7")).toEqual(["A", "C", "E", "G"]);
    expect(spelled("C", "m7b5")).toEqual(["C", "Eb", "Gb", "Bb"]);
    expect(spelled("D", "add9")).toEqual(["D", "F#", "A", "E"]);
  });

  it("writes chord names the way a chart does", () => {
    expect(chordSymbol("Bb", "maj7", false)).toBe("Bbmaj7");
    expect(chordSymbol("F#", "minor")).toBe("F♯m");
    expect(chordSymbol("C", "major")).toBe("C");
    expect(chordSymbol("B", "m7b5", false)).toBe("Bm7♭5");
  });

  it("stacks inversions, moving the lowest note up an octave each time", () => {
    expect(voicing("C", "major", 0, 60).midis).toEqual([60, 64, 67]);
    expect(voicing("C", "major", 1, 60)).toMatchObject({ midis: [64, 67, 72], roles: ["3", "5", "1"], names: ["E", "G", "C"] });
    expect(voicing("C", "major", 2, 60).midis).toEqual([67, 72, 76]);
    expect(voicing("C", "dom7", 3, 60).midis).toEqual([70, 72, 76, 79]);
    // Asking for more inversions than the chord has notes just gives the last one.
    expect(voicing("C", "major", 9, 60).midis).toEqual([67, 72, 76]);
    expect(INVERSION_NAMES[0]).toBe("Root position");
  });

  it("suggests a finger for each key, thumb on the lowest note in the right hand", () => {
    expect(chordFingers(3, 0, "R")).toEqual([1, 3, 5]);
    expect(chordFingers(3, 1, "R")).toEqual([1, 2, 5]);
    expect(chordFingers(3, 0, "L")).toEqual([5, 3, 1]);
    expect(chordFingers(4, 0, "R")).toEqual([1, 2, 3, 5]);
    expect(chordFingers(4, 0, "L")).toEqual([5, 3, 2, 1]);
    // One finger per key, never more than five.
    for (const n of [3, 4]) for (const hand of ["R", "L"] as const) expect(chordFingers(n, 0, hand)).toHaveLength(n);
  });

  it("has a recipe for every kind, matching the notes", () => {
    for (const q of Object.keys(QUALITIES) as (keyof typeof QUALITIES)[]) {
      expect(QUALITIES[q].formula.split(" ")).toHaveLength(QUALITIES[q].parts.length);
      expect(chordNotes("C", q)).toHaveLength(QUALITIES[q].parts.length);
    }
  });

  it("names the chords of a key", () => {
    expect(keyChords("C", "major").map((c) => c.root)).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(keyChords("C", "major").map((c) => c.numeral)).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
    expect(keyChords("G", "major").map((c) => `${c.root}${QUALITIES[c.quality].symbol}`)).toEqual(["G", "Am", "Bm", "C", "D", "Em", "F#dim"]);
    expect(keyChords("Bb", "major").map((c) => c.root)).toEqual(["Bb", "C", "D", "Eb", "F", "G", "A"]);
    expect(keyChords("A", "minor").map((c) => `${c.root}${QUALITIES[c.quality].symbol}`)).toEqual(["Am", "Bdim", "C", "Dm", "Em", "F", "G"]);
  });
});

describe("fingerings", () => {
  it("has the standard scale fingerings", () => {
    expect(scaleFingering("C", "major", "R")).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(scaleFingering("C", "major", "L")).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
    expect(scaleFingering("F", "major", "R")).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    expect(scaleFingering("A", "natural-minor", "R")).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(scaleFingering("C", "blues", "R")).toBeNull();
    expect(scaleFingering("C#", "major", "R")).toBeNull();
  });

  it("never puts the thumb on a black key in the right hand's major scales", () => {
    for (const root of ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"]) {
      const fingers = scaleFingering(root, "major", "R")!;
      const notes = scaleNotes(root, "major");
      expect(fingers).toHaveLength(8);
      fingers.forEach((f, i) => {
        const black = [1, 3, 6, 8, 10].includes(notes[i % 7].pc);
        // The thumb (1) stays on white keys, except in the scales whose white keys are few (Db, Ab, Eb... never use it on black).
        if (f === 1) expect(black, `${root} note ${i + 1}`).toBe(false);
      });
    }
  });
});

describe("intervals", () => {
  it("covers every distance from a unison to an octave", () => {
    expect(INTERVALS.map((i) => i.semis)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(INTERVALS.map((i) => i.short)).size).toBe(13);
  });
});

describe("smooth chord changes", () => {
  const total = (vs: { midis: number[] }[]) => vs.slice(1).reduce((sum, v, i) => sum + v.midis.reduce((s, m, j) => s + Math.abs(m - vs[i].midis[j]), 0), 0);

  it("starts in root position and keeps the notes of each chord", () => {
    const chords = [
      { root: "C", quality: "major" as const },
      { root: "F", quality: "major" as const },
      { root: "G", quality: "major" as const },
      { root: "A", quality: "minor" as const },
    ];
    const smooth = smoothVoicings(chords);
    expect(smooth[0].inversion).toBe(0);
    smooth.forEach((v, i) => {
      const wanted = chordNotes(chords[i].root, chords[i].quality).map((n) => n.pc).sort((a, b) => a - b);
      expect([...new Set(v.midis.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b)).toEqual(wanted);
    });
  });

  it("moves the hand less than playing every chord in root position", () => {
    const chords = [
      { root: "C", quality: "major" as const },
      { root: "F", quality: "major" as const },
      { root: "G", quality: "major" as const },
      { root: "C", quality: "major" as const },
    ];
    const smooth = smoothVoicings(chords);
    const plain = chords.map((c) => voicing(c.root, c.quality, 0, 55 + ((((parseNote(c.root)?.pc ?? 0) - 55) % 12) + 12) % 12));
    expect(total(smooth)).toBeLessThan(total(plain));
    // The classic: C, then F with C on the bottom, then G with D on the bottom.
    expect(smooth[1].names).toEqual(["C", "F", "A"]);
    expect(smooth[2].names).toEqual(["D", "G", "B"]);
  });

  it("keeps every chord within a comfortable reach", () => {
    const smooth = smoothVoicings(["C", "Eb", "F#", "A", "B", "Db"].map((root) => ({ root, quality: "major" as const })));
    for (const v of smooth) {
      expect(v.midis[0]).toBeGreaterThanOrEqual(55);
      expect(v.midis[v.midis.length - 1]).toBeLessThanOrEqual(79);
    }
  });
});
