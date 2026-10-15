import { isChordStyle } from "./chords/styles";
import type { PresetSettings } from "./songs";

/** Text size 0 means "fit to screen". */
export const FIT = 0;

/** How a song starts out in a setlist: original key, its usual capo, chords shown, fit to screen. */
export function defaultSettings(defaultCapo: number): PresetSettings {
  return { semitones: 0, capo: defaultCapo, spelling: "auto", showChords: true, fontSize: FIT, style: "original" };
}

export function validSettings(s: PresetSettings): boolean {
  return (
    Number.isInteger(s.semitones) && s.semitones >= 0 && s.semitones < 12 &&
    Number.isInteger(s.capo) && s.capo >= 0 && s.capo <= 12 &&
    ["auto", "sharp", "flat"].includes(s.spelling) &&
    typeof s.showChords === "boolean" &&
    (s.style === undefined || isChordStyle(s.style)) &&
    Number.isInteger(s.fontSize) && (s.fontSize === 0 || (s.fontSize >= 12 && s.fontSize <= 40))
  );
}

/** Settings read back from the database: anything missing or invalid falls back to the default. */
export function normalizeSettings(raw: unknown, defaultCapo: number): PresetSettings {
  const base = defaultSettings(defaultCapo);
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base, ...(raw as Partial<PresetSettings>) };
  return validSettings(merged) ? merged : base;
}
