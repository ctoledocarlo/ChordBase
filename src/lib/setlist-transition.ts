import { firstChord, lastChord, parseSections, restyleChord, suggestTransition, transposeChordPro, transposeChordText } from "./chords";
import { effectiveBody } from "./setlist-body";
import { deriveSong } from "./setlist-derive";
import type { SetlistItem } from "./setlists";

export type TransitionMode = "auto" | "manual" | "none";

/** How a song leads into the one after it. */
export type Transition = { mode: TransitionMode; chords: string };

export const DEFAULT_TRANSITION: Transition = { mode: "auto", chords: "" };

export const isTransitionMode = (v: unknown): v is TransitionMode => v === "auto" || v === "manual" || v === "none";

/** The sounding chords a song starts and ends on, with the key it sounds in. */
function ends(item: SetlistItem) {
  const d = deriveSong(item.song.original_key, item.settings);
  const sections = parseSections(transposeChordPro(effectiveBody(item), item.settings.semitones, d.spelling));
  return { d, first: firstChord(sections), last: lastChord(sections) };
}

/**
 * The suggested chords from the end of `from` into the start of `to`, written the way `from` is
 * played (with its capo and chord style), since that is the page the band is reading when the bridge happens.
 */
export function autoTransition(from: SetlistItem, to: SetlistItem): string[] {
  const a = ends(from);
  const b = ends(to);
  if (!a.d.hasKey || !b.d.hasKey) return [];
  const sounding = suggestTransition(a.d.soundingKey, b.d.soundingKey, a.last, b.first);
  return sounding.map((chord) =>
    restyleChord(transposeChordText(chord, -from.settings.capo, a.d.spelling), from.settings.style ?? "original", a.d.shownShapeKey),
  );
}

/** The bridge to show between two songs: the suggestion, the typed chords, or nothing. */
export function transitionDisplay(from: SetlistItem, to: SetlistItem): string | null {
  const t = from.transition;
  if (t.mode === "none") return null;
  if (t.mode === "manual") return t.chords.trim() || null;
  const auto = autoTransition(from, to);
  return auto.length > 0 ? auto.join(" → ") : null;
}
