import { describe, expect, it } from "vitest";
import { qrMatrix, qrPath } from "./qr";

describe("QR codes", () => {
  const link = "https://chordbase.example/r/6f1d6d5a-1c52-4a0e-8a6e-0d3a6d2d0c11";
  const m = qrMatrix(link);

  it("is a square grid with the three corner markers a scanner looks for", () => {
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    const n = m.length;
    for (const [r0, c0] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ]) {
      // A marker is a dark ring, a light ring, and a dark 3x3 centre.
      for (let i = 0; i < 7; i++) {
        expect(m[r0][c0 + i]).toBe(true);
        expect(m[r0 + 6][c0 + i]).toBe(true);
        expect(m[r0 + i][c0]).toBe(true);
        expect(m[r0 + i][c0 + 6]).toBe(true);
      }
      expect(m[r0 + 1][c0 + 1]).toBe(false);
      expect(m[r0 + 3][c0 + 3]).toBe(true);
    }
  });

  it("gives a different code for a different link", () => {
    expect(qrMatrix(`${link}x`)).not.toEqual(m);
  });

  it("draws exactly the dark squares", () => {
    const path = qrPath([
      [true, true, false],
      [false, true, true],
    ]);
    expect(path).toBe("M0 0h2v1h-2zM1 1h2v1h-2z");
    const dark = m.flat().filter(Boolean).length;
    const drawn = [...qrPath(m).matchAll(/h(\d+)v1/g)].reduce((sum, x) => sum + Number(x[1]), 0);
    expect(drawn).toBe(dark);
  });
});
