"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { deletePreset, savePreset } from "@/app/(app)/songs/actions";
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
import type { Preset, PresetSettings } from "@/lib/songs";
import { PreviewTab } from "./editor-preview";
import { MinusIcon, PlusIcon, TrashIcon } from "./icons";
import { SidebarPortal } from "./sidebar-portal";

type Props = {
  songId: string;
  title: string;
  tempo: number | null;
  originalKey: string;
  defaultCapo: number;
  body: string;
  presets: Preset[];
  /** Page actions (edit, delete) shown at the top of the sidebar. */
  actions?: ReactNode;
};

/** Text size 0 means "fit to screen", like the Preview tab in the editor. */
const FIT = 0;

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

export function SongView({ songId, title, tempo, originalKey, defaultCapo, body, presets, actions }: Props) {
  const hasKey = parseChord(originalKey) !== null;
  const defaults: PresetSettings = {
    semitones: 0,
    capo: defaultCapo,
    spelling: "auto",
    showChords: true,
    fontSize: FIT,
  };
  const [settings, setSettings] = useState<PresetSettings>(defaults);
  const [presetName, setPresetName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const set = (patch: Partial<PresetSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const { semitones, capo, spelling: spellingChoice, showChords, fontSize } = settings;

  // The key the band sounds in, and the shapes the guitarist plays with the capo on.
  const shapeShift = (((semitones - capo) % 12) + 12) % 12;
  const shapeKey = hasKey ? transposeChordText(originalKey, shapeShift, "sharp") : "";
  const spelling: Spelling =
    spellingChoice === "auto" ? (hasKey ? spellingForKey(shapeKey) : "sharp") : spellingChoice;

  const sections = useMemo(
    () => parseSections(transposeChordPro(body, shapeShift, spelling)),
    [body, shapeShift, spelling],
  );

  const soundingKey = hasKey ? transposeChordText(originalKey, semitones, spelling) : "";
  const shownShapeKey = hasKey ? transposeChordText(originalKey, shapeShift, spelling) : "";
  const options = useMemo(() => keyOptions(originalKey), [originalKey]);
  const originalPc = hasKey ? pitchClass(parseChord(originalKey)!.root) : 0;
  const selectedPc = (originalPc + semitones) % 12;

  const keyLabel = hasKey ? soundingKey + (capo > 0 ? `, capo ${capo}` : "") : originalKey;

  function stepSize(delta: number) {
    const el = document.querySelector<HTMLElement>("[data-fit-area]");
    const current = fontSize === FIT ? parseFloat(el?.style.fontSize || "16") : fontSize;
    set({ fontSize: Math.min(40, Math.max(12, Math.round(current + delta))) });
  }

  const same = (a: PresetSettings, b: PresetSettings) =>
    a.semitones === b.semitones && a.capo === b.capo && a.spelling === b.spelling &&
    a.showChords === b.showChords && a.fontSize === b.fontSize;
  const changed = !same(settings, defaults);

  function saveCurrent() {
    const name = presetName.trim();
    if (!name) {
      setMessage("Type a name for this preset first.");
      return;
    }
    startSaving(async () => {
      const res = await savePreset(songId, name, settings);
      setMessage(res.error ?? `Saved “${name}”.`);
      if (!res.error) setPresetName("");
    });
  }

  function remove(p: Preset) {
    if (!window.confirm(`Delete the preset “${p.name}”?`)) return;
    startSaving(async () => {
      const res = await deletePreset(songId, p.id);
      setMessage(res.error ?? `Deleted “${p.name}”.`);
    });
  }

  const panel = (
    <>
      {actions}

      <Group title="My presets">
        {presets.length === 0 ? (
          <p className="text-sm text-muted">Nothing saved yet. Set the song up your way, then name it below.</p>
        ) : (
          <ul className="-mx-1">
            {presets.map((p) => {
              const active = same(p.settings, settings);
              return (
                <li key={p.id} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setSettings(p.settings);
                      setMessage(null);
                    }}
                    aria-pressed={active}
                    className={`min-w-0 flex-1 truncate border-l-2 px-3 py-1.5 text-left text-sm ${
                      active ? "border-accent bg-hover font-medium" : "border-transparent hover:bg-hover"
                    }`}
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    aria-label={`Delete ${p.name}`}
                    title="Delete"
                    className="btn btn-quiet btn-icon opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
                  >
                    <TrashIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 grid gap-2">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveCurrent();
              }
            }}
            placeholder="Name this setup"
            maxLength={60}
            aria-label="Preset name"
            className="field field-sm min-w-0"
          />
          <button type="button" onClick={saveCurrent} disabled={saving} className="btn">
            Save
          </button>
        </div>
        {message && (
          <p role="status" className="mt-2 text-sm text-muted">
            {message}
          </p>
        )}
      </Group>

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

      {changed && (
        <button className="text-sm text-muted underline hover:text-foreground" type="button" onClick={() => setSettings(defaults)}>
          Reset to original
        </button>
      )}
    </>
  );

  return (
    <>
      <SidebarPortal>{panel}</SidebarPortal>
      <PreviewTab
        info={{ title, key: keyLabel, tempo: tempo ? String(tempo) : "" }}
        sections={sections}
        size={fontSize === FIT ? "fit" : fontSize}
        showChords={showChords}
      />
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {children}
    </section>
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
