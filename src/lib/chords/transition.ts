import { isMinorQuality, noteName, parseChord, pitchClass, spellingForKey } from "./chord";
import type { EditorSection } from "./sections";

/** The first chord a song plays (one spot with two chords, like "G D", counts as its first). */
export function firstChord(sections: EditorSection[]): string | null {
  for (const s of sections) {
    for (const l of s.lines) {
      if (l.chords.length === 0) continue;
      const first = [...l.chords].sort((a, b) => a.pos - b.pos)[0].chord;
      return first.trim().split(/\s+/)[0] || null;
    }
  }
  return null;
}

/** The last chord a song plays. */
export function lastChord(sections: EditorSection[]): string | null {
  for (let i = sections.length - 1; i >= 0; i--) {
    const lines = sections[i].lines;
    for (let j = lines.length - 1; j >= 0; j--) {
      if (lines[j].chords.length === 0) continue;
      const last = [...lines[j].chords].sort((a, b) => b.pos - a.pos)[0].chord;
      const parts = last.trim().split(/\s+/);
      return parts[parts.length - 1] || null;
    }
  }
  return null;
}

const same = (a: string, b: string) => a.trim() === b.trim();

/**
 * Chords to play from the end of one song into the start of the next, by simple rules:
 * the same key needs nothing; a step up a fifth just moves on; up a fourth, the old home chord
 * becomes a dominant seventh of the new key; anything else goes through the new key's dominant
 * seventh, which pulls into the first chord. `last` and `first` are the chords the songs actually
 * end and begin on (both in the sounding keys); the key's own chord is used when a song has none.
 * Returns nothing when there's nothing to bridge.
 */
export function suggestTransition(fromKey: string, toKey: string, last?: string | null, first?: string | null): string[] {
  const kA = parseChord(fromKey);
  const kB = parseChord(toKey);
  if (!kA || !kB) return [];

  const tonicA = last && parseChord(last) ? last : fromKey;
  const start = first && parseChord(first) ? first : toKey;
  const pcA = pitchClass(kA.root);
  const pcB = pitchClass(kB.root);
  const d = (pcB - pcA + 12) % 12;
  const spelling = spellingForKey(toKey);
  const rootOf = (chord: string) => {
    const c = parseChord(chord)!;
    return c.root.letter + c.root.accidental;
  };

  let path: string[];
  if (d === 0) path = same(tonicA, start) ? [] : [tonicA, start];
  else if (d === 7) path = [tonicA, start];
  else if (d === 5 && !isMinorQuality(kA.quality)) path = [`${rootOf(tonicA)}7`, start];
  else path = [tonicA, `${noteName(pcB + 7, spelling)}7`, start];

  return path.filter((chord, i) => i === 0 || !same(chord, path[i - 1]));
}
