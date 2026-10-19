"use client";

import { useState } from "react";
import { useStoredFlag } from "./use-stored-flag";
import { chordsInKey, chordsOf, parseChord, pitchClass } from "@/lib/chords";
import { effectiveBody } from "@/lib/setlist-body";
import type { SetlistItem } from "@/lib/setlists";
import { ChevronIcon } from "./icons";
import { deriveSong, useSongSections } from "./song-settings";

const tallScreen = () => window.innerHeight >= 820;

/**
 * Every chord that belongs to the key the song is shown in, for a quick check or a quick change.
 * The ones this song uses are marked. It follows the key and capo chosen for the setlist.
 */
export function KeyChords({ item }: { item: SetlistItem }) {
  // Open on a tall screen the first time, folded on a short one, and then however it was left.
  const [open, setOpen] = useStoredFlag("chordbase.keyChordsOpen", true, tallScreen);
  const [sevenths, setSevenths] = useState(false);
  const { hasKey, shownShapeKey, soundingKey, spelling } = deriveSong(item.song.original_key, item.settings);
  const sections = useSongSections(effectiveBody(item), item.song.original_key, item.settings);

  if (!hasKey) return null;
  const chords = chordsInKey(shownShapeKey, spelling);
  if (chords.length === 0) return null;

  // The roots this song actually plays (a chord over two names, like "G D", counts for both).
  const used = new Set<number>();
  for (const text of chordsOf(sections)) {
    for (const part of text.split(/\s+/)) {
      const parsed = parseChord(part);
      if (parsed) used.add(pitchClass(parsed.root));
    }
  }

  return (
    <section aria-label={`Chords in ${shownShapeKey}`} className="flex-none border-b border-line py-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[0.6875rem] font-medium uppercase tracking-wide text-muted hover:text-foreground"
        >
          <span className={`flex-none transition-transform ${open ? "" : "-rotate-90"}`}>
            <ChevronIcon />
          </span>
          <span className="truncate">Chords in {shownShapeKey}</span>
        </button>
        {open && (
          <label className="flex flex-none items-center gap-1 text-xs text-muted">
            <input type="checkbox" checked={sevenths} onChange={(e) => setSevenths(e.target.checked)} />
            7ths
          </label>
        )}
      </div>

      {open && (
        <>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {chords.map((c) => {
              const isUsed = used.has(c.pc);
              return (
                <li
                  key={c.numeral}
                  className={`flex min-w-[2.4rem] flex-col items-center rounded border px-1 py-px ${
                    isUsed ? "border-accent bg-hover" : "border-line"
                  }`}
                  title={isUsed ? "Used in this song" : undefined}
                >
                  <span className="text-[0.5625rem] leading-3 text-muted">{c.numeral}</span>
                  <span className={`font-mono text-xs leading-4 ${isUsed ? "font-bold text-chord" : ""}`}>
                    {sevenths ? c.seventh : c.triad}
                  </span>
                </li>
              );
            })}
          </ul>
          {item.settings.capo > 0 && (
            <p className="mt-1 text-xs text-muted">
              Capo {item.settings.capo}: sounds in {soundingKey}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
