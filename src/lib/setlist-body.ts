import { spellingForKey, transposeChordPro } from "./chords";
import type { SetlistItem } from "./setlists";

/** The text of the song as this setlist shows it: its own version if it has one, else the song's. */
export function effectiveBody(item: Pick<SetlistItem, "body_override" | "song">): string {
  return item.body_override ?? item.song.body;
}

/**
 * A song as shown in a setlist has been moved by the setlist's key and capo (`shapeShift`
 * semitones). Chords typed into that view go back to the song's own key before they are kept,
 * so changing the key later still moves everything together.
 */
export function toStoredBody(shownBody: string, shapeShift: number, originalKey: string): string {
  return shapeShift === 0 ? shownBody : transposeChordPro(shownBody, -shapeShift, spellingForKey(originalKey));
}
