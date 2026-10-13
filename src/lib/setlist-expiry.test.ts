import { describe, expect, it } from "vitest";
import { expiryFrom, isKeepMonths } from "./setlist-expiry";

const day = (d: Date) => d.toISOString().slice(0, 10);

describe("setlist expiry", () => {
  it("adds whole months", () => {
    expect(day(expiryFrom(1, new Date("2026-10-12T10:00:00Z")))).toBe("2026-11-12");
    expect(day(expiryFrom(12, new Date("2026-10-12T10:00:00Z")))).toBe("2027-10-12");
  });

  it("stays inside the month when the day doesn't exist", () => {
    expect(day(expiryFrom(1, new Date("2026-01-31T00:00:00Z")))).toBe("2026-02-28");
    expect(day(expiryFrom(12, new Date("2027-02-28T00:00:00Z")))).toBe("2028-02-28");
    expect(day(expiryFrom(12, new Date("2028-02-29T00:00:00Z")))).toBe("2029-02-28");
  });

  it("only allows the offered lengths, up to a year", () => {
    expect([1, 2, 3, 6, 12].every(isKeepMonths)).toBe(true);
    expect(isKeepMonths(13)).toBe(false);
    expect(isKeepMonths(0)).toBe(false);
  });
});
