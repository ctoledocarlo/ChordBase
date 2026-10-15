import { describe, expect, it } from "vitest";
import { defaultSettings, normalizeSettings, validSettings } from "./setlist-settings";

describe("setlist settings", () => {
  it("starts a song at its original key and usual capo", () => {
    expect(defaultSettings(2)).toEqual({ semitones: 0, capo: 2, spelling: "auto", showChords: true, fontSize: 0, style: "original" });
  });

  it("keeps good saved settings", () => {
    const saved = { semitones: 3, capo: 1, spelling: "flat", showChords: false, fontSize: 24 };
    expect(normalizeSettings(saved, 0)).toEqual({ ...saved, style: "original" });
    expect(normalizeSettings({ ...saved, style: "jazzy" }, 0).style).toBe("jazzy");
    expect(normalizeSettings({ ...saved, style: "bogus" }, 0)).toEqual(defaultSettings(0));
  });

  it("fills in what is missing and ignores nonsense", () => {
    expect(normalizeSettings({ semitones: 5 }, 2)).toEqual({ ...defaultSettings(2), semitones: 5 });
    expect(normalizeSettings({ semitones: 99 }, 0)).toEqual(defaultSettings(0));
    expect(normalizeSettings(null, 1)).toEqual(defaultSettings(1));
  });

  it("rejects out-of-range values", () => {
    expect(validSettings({ ...defaultSettings(0), capo: 13 })).toBe(false);
    expect(validSettings({ ...defaultSettings(0), fontSize: 8 })).toBe(false);
    expect(validSettings({ ...defaultSettings(0), fontSize: 30 })).toBe(true);
  });
});
