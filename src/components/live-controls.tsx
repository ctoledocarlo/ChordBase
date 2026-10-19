"use client";

import { FIT } from "@/lib/setlist-settings";
import type { SetlistItem } from "@/lib/setlists";
import type { PresetSettings } from "@/lib/songs";
import { ChordStylePicker, KeyPicker, steppedSize } from "./song-settings";

/**
 * Key, chord style, capo and text size for the song on screen, packed into three rows so it can
 * sit beside the song during a service. Changes are saved to the setlist, so every screen follows.
 */
export function LiveControls({
  item,
  onChange,
  showCapo = true,
}: {
  item: SetlistItem;
  onChange: (settings: PresetSettings) => void;
  /** Stage screens don't get a capo control. */
  showCapo?: boolean;
}) {
  const { settings } = item;
  const set = (patch: Partial<PresetSettings>) => onChange({ ...settings, ...patch });

  const stepSize = (delta: number) => set({ fontSize: steppedSize(settings, delta) });
  // One tap to very large text, for a dim stage or a musician standing back from the screen.
  const BIG = 36;

  const small = "btn px-2 py-0.5 text-[0.8125rem]";

  return (
    <div className="mb-2 flex-none space-y-1.5 rounded-md border border-line p-1.5">
      <KeyPicker compact steppers originalKey={item.song.original_key} settings={settings} onChange={onChange} />

      <div className={`grid gap-1.5 ${showCapo ? "grid-cols-2" : "grid-cols-1"}`}>
        {showCapo && (
          <select className="field field-sm" aria-label="Capo" value={settings.capo} onChange={(e) => set({ capo: Number(e.target.value) })}>
            <option value={0}>No capo</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Capo {i + 1}
              </option>
            ))}
          </select>
        )}
        <ChordStylePicker compact settings={settings} onChange={onChange} />
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" className={small} onClick={() => stepSize(-2)} aria-label="Smaller text">
          A−
        </button>
        <button type="button" className={small} onClick={() => stepSize(2)} aria-label="Larger text">
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
        <button
          type="button"
          className={`${small} ${settings.fontSize >= BIG - 2 ? "btn-primary" : ""}`}
          aria-pressed={settings.fontSize >= BIG - 2}
          onClick={() => set({ fontSize: BIG })}
          title="Very large text"
        >
          Big
        </button>
      </div>
    </div>
  );
}
