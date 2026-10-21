import { describe, expect, it } from "vitest";
import { RANGE_NOTES, adviseKey, noteLabel, noteNumber, octaveWords, shiftWords } from "./key-finder";

describe("note numbers", () => {
  it("reads notes with an octave, middle C being 60", () => {
    expect(noteNumber("C4")).toBe(60);
    expect(noteNumber("A2")).toBe(45);
    expect(noteNumber("C#4")).toBe(61);
    expect(noteNumber("Db4")).toBe(61);
    expect(noteNumber("B3")).toBe(59);
    expect(noteNumber("C")).toBeNull();
    expect(noteNumber("H4")).toBeNull();
    expect(noteNumber("")).toBeNull();
  });

  it("writes them back", () => {
    expect(noteLabel(60)).toBe("C4");
    expect(noteLabel(45)).toBe("A2");
    expect(noteLabel(61)).toBe("C#4");
    expect(RANGE_NOTES[0]).toBe("C2");
    expect(RANGE_NOTES[RANGE_NOTES.length - 1]).toBe("C6");
    expect(RANGE_NOTES.every((n) => noteNumber(n) !== null)).toBe(true);
  });
});

describe("finding a key for a singer", () => {
  it("says it can't tell without the melody's range, or the singer's", () => {
    expect(adviseKey({ low: "", high: "" }, { low: "A2", high: "E4" })).toEqual({ status: "unknown", reason: "song" });
    expect(adviseKey({ low: "C4", high: "G4" }, { low: "", high: "" })).toEqual({ status: "unknown", reason: "singer" });
    expect(adviseKey({ low: "G4", high: "C4" }, { low: "A2", high: "E4" })).toEqual({ status: "unknown", reason: "song" });
  });

  it("keeps the song where it is when it already fits", () => {
    const a = adviseKey({ low: "C4", high: "G4" }, { low: "A3", high: "E5" });
    expect(a.status).toBe("fits");
    if (a.status !== "fits") return;
    expect(a.options[0]).toMatchObject({ shift: 0, semitones: 0 });
    expect(a.span).toBe(7);
    expect(a.room).toBe(19);
  });

  it("moves it down when the melody goes too high", () => {
    // The melody tops out at C5 but the singer stops at A4: nine half steps of room, so anything from 3 down works.
    const a = adviseKey({ low: "E4", high: "C5" }, { low: "G3", high: "A4" });
    expect(a.status).toBe("fits");
    if (a.status !== "fits") return;
    const shifts = a.options.map((o) => o.shift);
    expect(shifts).not.toContain(0);
    expect(shifts).not.toContain(-2);
    expect(a.options[0].shift).toBe(-3);
    // Every offered key really does keep the melody in range.
    for (const o of a.options) {
      expect(noteNumber("E4")! + o.shift).toBeGreaterThanOrEqual(noteNumber("G3")!);
      expect(noteNumber("C5")! + o.shift).toBeLessThanOrEqual(noteNumber("A4")!);
    }
  });

  it("moves it up when the melody goes too low", () => {
    const a = adviseKey({ low: "A2", high: "D4" }, { low: "C3", high: "G4" });
    expect(a.status).toBe("fits");
    if (a.status !== "fits") return;
    expect(a.options[0].shift).toBe(3);
  });

  it("offers each key once, the way a setlist stores it", () => {
    const a = adviseKey({ low: "C4", high: "D4" }, { low: "C2", high: "C6" });
    expect(a.status).toBe("fits");
    if (a.status !== "fits") return;
    expect(a.options).toHaveLength(12);
    expect(new Set(a.options.map((o) => o.semitones)).size).toBe(12);
    expect(a.options.every((o) => o.semitones >= 0 && o.semitones < 12)).toBe(true);
    expect(Math.abs(a.options[0].shift)).toBe(0);
  });

  it("points out the most comfortable key", () => {
    const a = adviseKey({ low: "C4", high: "C5" }, { low: "C4", high: "C6" });
    expect(a.status).toBe("fits");
    if (a.status !== "fits") return;
    // Room for an octave and an octave to spare: the middle of the range leaves six half steps at each end.
    expect(a.comfortable.headroom).toBe(6);
    expect(a.comfortable.shift).toBe(6);
  });

  it("says so when the melody is wider than the voice, and how close it can get", () => {
    // The melody spans 14 half steps; the singer covers 9.
    const a = adviseKey({ low: "C4", high: "D5" }, { low: "E3", high: "C4" });
    expect(a.status).toBe("narrow");
    if (a.status !== "narrow") return;
    expect(a.span).toBe(14);
    expect(a.room).toBe(8);
    expect(a.belowBy + a.aboveBy).toBe(a.span - a.room);
    expect(a.belowBy).toBeGreaterThan(0);
    expect(a.aboveBy).toBeGreaterThan(0);
  });

  it("describes a move in words", () => {
    expect(shiftWords(0)).toBe("its usual key");
    expect(shiftWords(2)).toBe("up 2 half steps");
    expect(shiftWords(-1)).toBe("down 1 half step");
  });

  it("says when a key only works an octave higher or lower than the recording", () => {
    // A low melody (E3 to D4) for a higher voice (E4 to D5): the usual key only fits an octave up.
    const a = adviseKey({ low: "E3", high: "D4" }, { low: "E4", high: "D5" });
    expect(a.status).toBe("fits");
    if (a.status !== "fits") return;
    expect(a.options).toHaveLength(1);
    expect(a.options[0]).toMatchObject({ shift: 12, keyShift: 0, octaves: 1, semitones: 0 });
    // With room to move, small changes within the register have no octave to mention.
    const roomy = adviseKey({ low: "C4", high: "G4" }, { low: "C3", high: "C6" });
    if (roomy.status !== "fits") throw new Error("expected a fit");
    expect(roomy.options[0].octaves).toBe(0);
    expect(octaveWords(1)).toBe("an octave higher");
    expect(octaveWords(-2)).toBe("2 octaves lower");
    expect(octaveWords(0)).toBe("");
  });

  it("keeps the key change small however far the melody is moved", () => {
    const a = adviseKey({ low: "C3", high: "G3" }, { low: "C5", high: "C6" });
    expect(a.status).toBe("fits");
    if (a.status !== "fits") return;
    for (const o of a.options) {
      expect(o.keyShift).toBeGreaterThanOrEqual(-6);
      expect(o.keyShift).toBeLessThanOrEqual(5);
      expect(o.shift).toBe(o.keyShift + 12 * o.octaves);
    }
  });
});

