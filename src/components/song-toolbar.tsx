"use client";

import { FIT } from "@/lib/setlist-settings";
import type { PresetSettings } from "@/lib/songs";
import { KeyPicker, steppedSize } from "./song-settings";

/**
 * Key, capo and text size in one slim bar above the song, so a change is a tap away and the song stays in view.
 * The sidebar has the same settings plus the rest (sharps and flats, chord style, showing chords).
 */
export function SongToolbar({
  originalKey,
  settings,
  onChange,
}: {
  originalKey: string;
  settings: PresetSettings;
  onChange: (settings: PresetSettings) => void;
}) {
  const set = (patch: Partial<PresetSettings>) => onChange({ ...settings, ...patch });
  const small = "btn px-2 py-0.5 text-[0.8125rem]";

  return (
    <div data-tour="song-toolbar" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line px-2.5 py-2">
      <div className="min-w-[11rem] flex-1 sm:max-w-[16rem]">
        <KeyPicker compact steppers originalKey={originalKey} settings={settings} onChange={onChange} />
      </div>
      <select
        className="field field-sm !w-auto"
        aria-label="Capo"
        value={settings.capo}
        onChange={(e) => set({ capo: Number(e.target.value) })}
      >
        <option value={0}>No capo</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            Capo {i + 1}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1" role="group" aria-label="Text size">
        <button type="button" className={small} onClick={() => set({ fontSize: steppedSize(settings, -2) })} aria-label="Smaller text">
          A−
        </button>
        <button type="button" className={small} onClick={() => set({ fontSize: steppedSize(settings, 2) })} aria-label="Larger text">
          A+
        </button>
        <button
          type="button"
          className={`${small} ${settings.fontSize === FIT ? "btn-primary" : ""}`}
          aria-pressed={settings.fontSize === FIT}
          onClick={() => set({ fontSize: FIT })}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
