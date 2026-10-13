import { describe, expect, it } from "vitest";
import { setlistMatches } from "./setlist-search";

const date = "2026-10-17"; // a Saturday

describe("searching setlists by name or date", () => {
  it("finds a date written many ways", () => {
    for (const q of ["2026-10-17", "2026-10", "oct", "october", "oct 17", "october 17", "10/17", "10/17/2026", "saturday", "sat oct", "2026", "17"]) {
      expect(setlistMatches(q, "Sunday Service", date), q).toBe(true);
    }
  });

  it("doesn't match other dates", () => {
    for (const q of ["oct 18", "nov", "2025", "10/18", "18", "monday"]) {
      expect(setlistMatches(q, "Sunday Service", date), q).toBe(false);
    }
  });

  it("still searches the name, and combines name and date", () => {
    expect(setlistMatches("service", "Sunday Service", date)).toBe(true);
    expect(setlistMatches("service oct", "Sunday Service", date)).toBe(true);
    expect(setlistMatches("youth oct", "Sunday Service", date)).toBe(false);
  });

  it("matches everything when empty, and undated setlists only by name", () => {
    expect(setlistMatches("  ", "Anything", null)).toBe(true);
    expect(setlistMatches("oct", "Sunday Service", null)).toBe(false);
    expect(setlistMatches("sunday", "Sunday Service", null)).toBe(true);
  });
});
