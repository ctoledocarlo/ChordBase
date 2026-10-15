import { parseChord, spellingForKey, transposeChordText, type Spelling } from "./chords";
import type { PresetSettings } from "./songs";

/** What the settings do to a song: the key it sounds in, the shapes to play, and how to spell chords. */
export function deriveSong(originalKey: string, settings: PresetSettings) {
  const hasKey = parseChord(originalKey) !== null;
  const { semitones, capo, spelling: spellingChoice } = settings;
  // The key the band sounds in, and the shapes the guitarist plays with the capo on.
  const shapeShift = (((semitones - capo) % 12) + 12) % 12;
  const shapeKey = hasKey ? transposeChordText(originalKey, shapeShift, "sharp") : "";
  const spelling: Spelling =
    spellingChoice === "auto" ? (hasKey ? spellingForKey(shapeKey) : "sharp") : spellingChoice;
  const soundingKey = hasKey ? transposeChordText(originalKey, semitones, spelling) : "";
  const shownShapeKey = hasKey ? transposeChordText(originalKey, shapeShift, spelling) : "";
  const keyLabel = hasKey ? soundingKey + (capo > 0 ? `, capo ${capo}` : "") : originalKey;
  return { hasKey, shapeShift, spelling, soundingKey, shownShapeKey, keyLabel };
}
