"use client";

import { FIT } from "@/lib/setlist-settings";
import type { SetlistItem } from "@/lib/setlists";
import type { PresetSettings } from "@/lib/songs";
import { KeyPicker, deriveSong } from "./song-settings";

/**
 * Key, capo and text size for the song on screen, small enough to sit beside the song during a
 * service. Changes are saved to the setlist, so every screen showing it follows.
 */
export function LiveControls({ item, onChange }: { item: SetlistItem; onChange: (settings: PresetSettings) => void }) {
  const { settings } = item;
  const set = (patch: Partial<PresetSettings>) => onChange({ ...settings, ...patch });
  const { shownShapeKey } = deriveSong(item.song.original_key, settings);

  function stepSize(delta: number) {
    const el = document.querySelector<HTMLElement>("[data-fit-area]");
    const current = settings.fontSize === FIT ? parseFloat(el?.style.fontSize || "16") : settings.fontSize;
    set({ fontSize: Math.min(40, Math.max(12, Math.round(current + delta))) });
  }

  return (
    <div className="mb-2 flex-none space-y-2 rounded-md border border-line p-2">
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Key</p>
        <KeyPicker steppers originalKey={item.song.original_key} settings={settings} onChange={onChange} />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Capo</p>
        <select className="field field-sm" aria-label="Capo" value={settings.capo} onChange={(e) => set({ capo: Number(e.target.value) })}>
          <option value={0}>No capo</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              Fret {i + 1}
            </option>
          ))}
        </select>
        {settings.capo > 0 && <p className="mt-1.5 text-sm text-muted">Play {shownShapeKey} shapes</p>}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Text size</p>
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" className="btn" onClick={() => stepSize(-2)} aria-label="Smaller text">
            A−
          </button>
          <button type="button" className="btn" onClick={() => stepSize(2)} aria-label="Larger text">
            A+
          </button>
          <button
            type="button"
            className={`btn ${settings.fontSize === FIT ? "btn-primary" : ""}`}
            aria-pressed={settings.fontSize === FIT}
            onClick={() => set({ fontSize: FIT })}
          >
            Fit
          </button>
        </div>
      </div>
    </div>
  );
}
