"use client";

import { autoTransition, type Transition, type TransitionMode } from "@/lib/setlist-transition";
import type { SetlistItem } from "@/lib/setlists";
import { Group } from "./song-settings";

const MODES: { value: TransitionMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "manual", label: "Manual" },
  { value: "none", label: "None" },
];

/**
 * How a song leads into the next one. Auto suggests chords from the two keys; Manual is whatever
 * you type; None shows nothing. It appears beside the setlist so the band can see it.
 */
export function TransitionPanel({
  from,
  to,
  onChange,
}: {
  from: SetlistItem;
  to: SetlistItem;
  onChange: (transition: Transition) => void;
}) {
  const t = from.transition;
  const suggestion = autoTransition(from, to);
  const keyed = from.song.original_key !== "" && to.song.original_key !== "";

  return (
    <Group title={`Transition to “${to.song.title}”`}>
      <div role="group" aria-label="Transition mode" className="grid grid-cols-3 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={t.mode === m.value}
            className={`btn px-2 ${t.mode === m.value ? "btn-primary" : ""}`}
            onClick={() => onChange({ ...t, mode: m.value })}
          >
            {m.label}
          </button>
        ))}
      </div>

      {t.mode === "auto" && (
        <div className="mt-2 text-sm">
          {suggestion.length > 0 ? (
            <>
              <p className="text-muted">Suggested chords:</p>
              <p className="mt-0.5 font-mono font-semibold text-chord">{suggestion.join(" → ")}</p>
              <button
                type="button"
                className="mt-2 text-muted underline hover:text-foreground"
                onClick={() => onChange({ mode: "manual", chords: suggestion.join(" ") })}
              >
                Change these chords
              </button>
            </>
          ) : (
            <p className="text-muted">{keyed ? "Nothing to bridge: the songs fit together as they are." : "These songs need a key to suggest a bridge."}</p>
          )}
        </div>
      )}

      {t.mode === "manual" && (
        <div className="mt-2 space-y-2">
          <input
            value={t.chords}
            onChange={(e) => onChange({ ...t, chords: e.target.value })}
            maxLength={200}
            placeholder={suggestion.length > 0 ? suggestion.join(" ") : "Chords, like G  E7  A"}
            aria-label="Transition chords"
            className="field field-sm font-mono"
          />
          {suggestion.length > 0 && (
            <button
              type="button"
              className="text-sm text-muted underline hover:text-foreground"
              onClick={() => onChange({ mode: "manual", chords: suggestion.join(" ") })}
            >
              Use the suggestion
            </button>
          )}
        </div>
      )}

      {t.mode === "none" && <p className="mt-2 text-sm text-muted">No bridge is shown between these two songs.</p>}

      <p className="mt-2 text-xs text-muted">Shown next to the setlist, from the end of this song into the start of the next.</p>
    </Group>
  );
}
