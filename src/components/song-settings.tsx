"use client";

import { useMemo, type ReactNode } from "react";
import {
  noteName,
  parseChord,
  parseSections,
  pitchClass,
  spellingForKey,
  transposeChordPro,
  transposeChordText,
  type Spelling,
} from "@/lib/chords";
import { FIT, defaultSettings } from "@/lib/setlist-settings";
import type { PresetSettings } from "@/lib/songs";
import { MinusIcon, PlusIcon } from "./icons";

/** All 12 key names for the picker, with minor keys labelled when the song is minor. */
function keyOptions(originalKey: string): string[] {
  const root = parseChord(originalKey);
  const minor = root ? /^m(?!aj|a)/.test(root.quality) : false;
  return Array.from({ length: 12 }, (_, pc) => {
    const name = noteName(pc, "sharp");
    const flat = noteName(pc, "flat");
    return (name === flat ? name : `${name}/${flat}`) + (minor ? "m" : "");
  });
}

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

/** The song's sections, transposed to match the settings. */
export function useSongSections(body: string, originalKey: string, settings: PresetSettings) {
  const { shapeShift, spelling } = deriveSong(originalKey, settings);
  return useMemo(
    () => parseSections(transposeChordPro(body, shapeShift, spelling)),
    [body, shapeShift, spelling],
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

const same = (a: PresetSettings, b: PresetSettings) =>
  a.semitones === b.semitones && a.capo === b.capo && a.spelling === b.spelling &&
  a.showChords === b.showChords && a.fontSize === b.fontSize;

/** Key, capo, sharps and flats, and display options for one song. */
export function SongSettingsPanel({
  originalKey,
  defaultCapo,
  settings,
  onChange,
}: {
  originalKey: string;
  defaultCapo: number;
  settings: PresetSettings;
  onChange: (settings: PresetSettings) => void;
}) {
  const defaults = defaultSettings(defaultCapo);
  const set = (patch: Partial<PresetSettings>) => onChange({ ...settings, ...patch });
  const { semitones, capo, spelling: spellingChoice, showChords, fontSize } = settings;
  const { hasKey, soundingKey, shownShapeKey } = deriveSong(originalKey, settings);

  const options = useMemo(() => keyOptions(originalKey), [originalKey]);
  const originalPc = hasKey ? pitchClass(parseChord(originalKey)!.root) : 0;
  const selectedPc = (originalPc + semitones) % 12;

  function stepSize(delta: number) {
    const el = document.querySelector<HTMLElement>("[data-fit-area]");
    const current = fontSize === FIT ? parseFloat(el?.style.fontSize || "16") : fontSize;
    set({ fontSize: Math.min(40, Math.max(12, Math.round(current + delta))) });
  }

  return (
    <>
      <Group title="Key">
        {hasKey ? (
          <>
            <select
              className="field field-sm"
              value={selectedPc}
              onChange={(e) => set({ semitones: (Number(e.target.value) - originalPc + 12) % 12 })}
            >
              {options.map((label, pc) => (
                <option key={label} value={pc}>
                  {label}
                  {pc === originalPc ? " (original)" : ""}
                </option>
              ))}
            </select>
            {semitones !== 0 && <p className="mt-1.5 text-sm text-muted">Now in {soundingKey}</p>}
          </>
        ) : (
          <Stepper
            value={semitones > 6 ? semitones - 12 : semitones}
            onMinus={() => set({ semitones: (semitones + 11) % 12 })}
            onPlus={() => set({ semitones: (semitones + 1) % 12 })}
            label="Transpose"
          />
        )}
      </Group>

      <Group title="Capo">
        <select className="field field-sm" value={capo} onChange={(e) => set({ capo: Number(e.target.value) })}>
          <option value={0}>No capo</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              Fret {i + 1}
            </option>
          ))}
        </select>
        {capo > 0 && hasKey && (
          <p className="mt-1.5 text-sm text-muted">
            Play {shownShapeKey} shapes to sound in {soundingKey}.
          </p>
        )}
      </Group>

      <Group title="Sharps and flats">
        <select
          className="field field-sm"
          value={spellingChoice}
          onChange={(e) => set({ spelling: e.target.value as PresetSettings["spelling"] })}
        >
          <option value="auto">Automatic</option>
          <option value="sharp">Sharps (#)</option>
          <option value="flat">Flats (b)</option>
        </select>
      </Group>

      <Group title="Display">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showChords} onChange={(e) => set({ showChords: e.target.checked })} />
          Show chords
        </label>
        <div className="mt-3">
          <p className="mb-1.5 text-sm text-muted">Text size</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn" onClick={() => stepSize(-2)} aria-label="Smaller text">
              A−
            </button>
            <button type="button" className="btn" onClick={() => stepSize(2)} aria-label="Larger text">
              A+
            </button>
            <button
              type="button"
              className={`btn col-span-2 ${fontSize === FIT ? "btn-primary" : ""}`}
              aria-pressed={fontSize === FIT}
              onClick={() => set({ fontSize: FIT })}
            >
              Fit to screen
            </button>
          </div>
        </div>
      </Group>

      {!same(settings, defaults) && (
        <button className="text-sm text-muted underline hover:text-foreground" type="button" onClick={() => onChange(defaults)}>
          Reset to original
        </button>
      )}
    </>
  );
}

function Stepper({
  value,
  onMinus,
  onPlus,
  label,
}: {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  label: string;
}) {
  return (
    <div className="space-y-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" className="btn btn-icon" onClick={onMinus} aria-label={`${label}: less`}>
          <MinusIcon />
        </button>
        <span className="w-9 text-center tabular-nums">{value}</span>
        <button type="button" className="btn btn-icon" onClick={onPlus} aria-label={`${label}: more`}>
          <PlusIcon />
        </button>
      </span>
    </div>
  );
}
