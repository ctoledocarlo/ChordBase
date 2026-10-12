"use client";

import { useMemo, useState } from "react";
import {
  noteName,
  parseChord,
  parseChordPro,
  pitchClass,
  spellingForKey,
  transposeChordPro,
  transposeChordText,
  type Spelling,
} from "@/lib/chords";
import { ChordSheet } from "./chord-sheet";

type Props = { originalKey: string; body: string };

type SpellingChoice = "auto" | Spelling;

const selectCls =
  "rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700";

/** All 12 key names for the picker, spelled for the song's original key. */
function keyOptions(originalKey: string): string[] {
  const root = parseChord(originalKey);
  const minor = root ? /^m(?!aj|a)/.test(root.quality) : false;
  return Array.from({ length: 12 }, (_, pc) => {
    const name = noteName(pc, "sharp");
    const flat = noteName(pc, "flat");
    return (name === flat ? name : `${name}/${flat}`) + (minor ? "m" : "");
  });
}

export function SongView({ originalKey, body }: Props) {
  const hasKey = parseChord(originalKey) !== null;
  const [semitones, setSemitones] = useState(0);
  const [spellingChoice, setSpellingChoice] = useState<SpellingChoice>("auto");
  const [showChords, setShowChords] = useState(true);
  const [fontSize, setFontSize] = useState(18);

  const currentKey = hasKey ? transposeChordText(originalKey, semitones, "sharp") : "";
  const spelling: Spelling =
    spellingChoice === "auto"
      ? hasKey
        ? spellingForKey(currentKey)
        : "sharp"
      : spellingChoice;

  const song = useMemo(
    () => parseChordPro(transposeChordPro(body, semitones, spelling)),
    [body, semitones, spelling],
  );

  const shownKey = hasKey ? transposeChordText(originalKey, semitones, spelling) : "";
  const options = useMemo(() => keyOptions(originalKey), [originalKey]);
  const selectedPc = hasKey
    ? (pitchClass(parseChord(originalKey)!.root) + semitones) % 12
    : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        {hasKey ? (
          <label className="text-sm">
            Key{" "}
            <select
              className={selectCls}
              value={selectedPc}
              onChange={(e) => {
                const originalPc = pitchClass(parseChord(originalKey)!.root);
                setSemitones((Number(e.target.value) - originalPc + 12) % 12);
              }}
            >
              {options.map((label, pc) => (
                <option key={label} value={pc}>
                  {label}
                  {pc === pitchClass(parseChord(originalKey)!.root) ? " (original)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="flex items-center gap-1 text-sm">
            Transpose
            <button className={selectCls} onClick={() => setSemitones((s) => (s + 11) % 12)} type="button">
              −
            </button>
            <span className="w-10 text-center">{semitones > 6 ? semitones - 12 : semitones}</span>
            <button className={selectCls} onClick={() => setSemitones((s) => (s + 1) % 12)} type="button">
              +
            </button>
          </span>
        )}

        {hasKey && semitones !== 0 && (
          <span className="text-sm text-zinc-500">now in {shownKey}</span>
        )}

        <label className="text-sm">
          Accidentals{" "}
          <select
            className={selectCls}
            value={spellingChoice}
            onChange={(e) => setSpellingChoice(e.target.value as SpellingChoice)}
          >
            <option value="auto">Auto</option>
            <option value="sharp">Sharps (#)</option>
            <option value="flat">Flats (♭)</option>
          </select>
        </label>

        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={showChords} onChange={(e) => setShowChords(e.target.checked)} />
          Chords
        </label>

        <span className="flex items-center gap-1 text-sm">
          Size
          <button className={selectCls} type="button" onClick={() => setFontSize((s) => Math.max(12, s - 2))}>
            A−
          </button>
          <button className={selectCls} type="button" onClick={() => setFontSize((s) => Math.min(40, s + 2))}>
            A+
          </button>
        </span>

        {semitones !== 0 && (
          <button className="text-sm underline" type="button" onClick={() => setSemitones(0)}>
            Reset
          </button>
        )}
      </div>

      <ChordSheet song={song} showChords={showChords} fontSize={fontSize} />
    </div>
  );
}
