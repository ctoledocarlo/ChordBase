"use client";

import { useMemo, type ReactNode } from "react";
import {
  noteName,
  parseChord,
  parseSections,
  pitchClass,
  restyleSections,
  transposeChordPro,
  CHORD_STYLES,
} from "@/lib/chords";
import { deriveSong } from "@/lib/setlist-derive";
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

/** The song's sections, transposed to match the settings. */
export function useSongSections(body: string, originalKey: string, settings: PresetSettings) {
  const { shapeShift, spelling, shownShapeKey } = deriveSong(originalKey, settings);
  const style = settings.style ?? "original";
  return useMemo(
    () => restyleSections(parseSections(transposeChordPro(body, shapeShift, spelling)), style, shownShapeKey),
    [body, shapeShift, spelling, style, shownShapeKey],
  );
}

export { deriveSong };

/** The text size one step bigger or smaller than what is showing now (reading the fitted size off the screen when set to fit). */
export function steppedSize(settings: PresetSettings, delta: number): number {
  const el = document.querySelector<HTMLElement>("[data-fit-area]");
  const current = settings.fontSize === FIT ? parseFloat(el?.style.fontSize || "16") : settings.fontSize;
  return Math.min(40, Math.max(12, Math.round(current + delta)));
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Choose the key a song is played in. With `steppers`, a button on each side moves it a half step
 * down or up, which is quicker when the band just needs it a touch higher.
 */
export function KeyPicker({
  originalKey,
  settings,
  onChange,
  steppers = false,
  compact = false,
}: {
  originalKey: string;
  settings: PresetSettings;
  onChange: (settings: PresetSettings) => void;
  steppers?: boolean;
  /** Leave out the "Now in ..." line. */
  compact?: boolean;
}) {
  const set = (patch: Partial<PresetSettings>) => onChange({ ...settings, ...patch });
  const { semitones } = settings;
  const { hasKey, soundingKey } = deriveSong(originalKey, settings);
  const options = useMemo(() => keyOptions(originalKey), [originalKey]);
  const originalPc = hasKey ? pitchClass(parseChord(originalKey)!.root) : 0;
  const selectedPc = (originalPc + semitones) % 12;
  const step = (delta: number) => set({ semitones: (semitones + delta + 12) % 12 });

  if (!hasKey) {
    return (
      <Stepper
        value={semitones > 6 ? semitones - 12 : semitones}
        onMinus={() => step(-1)}
        onPlus={() => step(1)}
        label="Transpose"
      />
    );
  }

  const select = (
    <select
      className="field field-sm"
      aria-label="Key"
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
  );

  return (
    <>
      {steppers ? (
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn btn-icon" onClick={() => step(-1)} aria-label="Down a half step" title="Down a half step">
            <MinusIcon />
          </button>
          <div className="min-w-0 flex-1">{select}</div>
          <button type="button" className="btn btn-icon" onClick={() => step(1)} aria-label="Up a half step" title="Up a half step">
            <PlusIcon />
          </button>
        </div>
      ) : (
        select
      )}
      {!compact && semitones !== 0 && <p className="mt-1.5 text-sm text-muted">Now in {soundingKey}</p>}
    </>
  );
}

/** Original, Classic, Jazzy or Gospel: how the chords are dressed (see lib/chords/styles). */
export function ChordStylePicker({
  settings,
  onChange,
  compact = false,
}: {
  settings: PresetSettings;
  onChange: (settings: PresetSettings) => void;
  /** Just the choice, without the line explaining it. */
  compact?: boolean;
}) {
  const style = settings.style ?? "original";
  return (
    <>
      <select
        className="field field-sm"
        aria-label="Chord style"
        value={style}
        onChange={(e) => onChange({ ...settings, style: e.target.value as NonNullable<PresetSettings["style"]> })}
      >
        {CHORD_STYLES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {!compact && (
      <p className="mt-1.5 text-sm text-muted">
        {CHORD_STYLES.find((s) => s.value === style)?.hint}
        {style !== "original" && ". Simple rules, so check them before you play."}
      </p>
      )}
    </>
  );
}

const same = (a: PresetSettings, b: PresetSettings) =>
  a.semitones === b.semitones && a.capo === b.capo && a.spelling === b.spelling &&
  a.showChords === b.showChords && a.fontSize === b.fontSize && (a.style ?? "original") === (b.style ?? "original");

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
  const { capo, spelling: spellingChoice, showChords, fontSize } = settings;
  const { hasKey, soundingKey, shownShapeKey } = deriveSong(originalKey, settings);

  const stepSize = (delta: number) => set({ fontSize: steppedSize(settings, delta) });

  return (
    <>
      <Group title="Key">
        <KeyPicker originalKey={originalKey} settings={settings} onChange={onChange} />
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

      <Group title="Chord style">
        <ChordStylePicker settings={settings} onChange={onChange} />
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
