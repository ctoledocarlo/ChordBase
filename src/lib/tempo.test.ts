import { describe, expect, it } from "vitest";
import { addTap, MAX_TAPS, tempoFromTaps } from "./tempo";

describe("tempoFromTaps", () => {
  it("needs at least two taps", () => {
    expect(tempoFromTaps([])).toBeNull();
    expect(tempoFromTaps([1000])).toBeNull();
  });
  it("averages the gaps between taps", () => {
    expect(tempoFromTaps([0, 500])).toBe(120);
    expect(tempoFromTaps([0, 500, 1000, 1500])).toBe(120);
    expect(tempoFromTaps([0, 1000, 2000])).toBe(60);
  });
  it("rounds to a whole number", () => {
    expect(tempoFromTaps([0, 480, 960])).toBe(125);
  });
  it("ignores tempos outside a playable range", () => {
    expect(tempoFromTaps([0, 100])).toBeNull();
    expect(tempoFromTaps([0, 4000])).toBeNull();
  });
});

describe("addTap", () => {
  it("collects taps in order", () => {
    expect(addTap(addTap([], 0), 500)).toEqual([0, 500]);
  });
  it("starts over after a long pause", () => {
    expect(addTap([0, 500], 10000)).toEqual([10000]);
  });
  it("keeps only the most recent taps", () => {
    let taps: number[] = [];
    for (let i = 0; i < 20; i++) taps = addTap(taps, i * 500);
    expect(taps).toHaveLength(MAX_TAPS);
    expect(taps[taps.length - 1]).toBe(19 * 500);
  });
});
