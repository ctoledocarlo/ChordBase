"use client";

import { useState } from "react";
import { lineCells, type EditorLine } from "@/lib/chords";
import type { PresetSettings } from "@/lib/songs";
import { Pills } from "./practice/ui";
import { deriveSong, useSongSections } from "./song-settings";

export type PrintableSong = {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  tempo: number | null;
  body: string;
  /** How this song is set up (key, capo, chord style). */
  settings: PresetSettings;
  /** The chosen instrument's notes for this song, if any were asked for. */
  notes: { label: string; body: string }[];
  singer?: string;
};

type Size = "small" | "medium" | "large";
const SIZES: Record<Size, number> = { small: 13, medium: 15, large: 18 };

function PrintLine({ line, chords }: { line: EditorLine; chords: boolean }) {
  return (
    <div className="leading-tight">
      {lineCells(line).map((cell) => (
        <span key={cell.start} className="inline-flex flex-col align-top">
          {chords && <span className="min-h-[1.4em] pr-[0.25em] font-mono text-[0.9em] font-bold text-chord">{cell.chord ?? " "}</span>}
          <span className="whitespace-pre-wrap">{cell.text}</span>
        </span>
      ))}
    </div>
  );
}

/** One song on a page: its title and key, its notes, and its parts laid out in one or two columns. */
function SongPage({ song, chords, columns, size, lastOnSheet }: { song: PrintableSong; chords: boolean; columns: 1 | 2; size: Size; lastOnSheet: boolean }) {
  const sections = useSongSections(song.body, song.originalKey, song.settings);
  const { keyLabel } = deriveSong(song.originalKey, song.settings);
  const meta = [keyLabel && `Key of ${keyLabel}`, song.tempo && `${song.tempo} BPM`, song.singer && `Sung by ${song.singer}`].filter(Boolean).join("   ·   ");

  return (
    <section className={`mb-10 print:mb-0 ${lastOnSheet ? "" : "print:break-after-page"}`} style={{ fontSize: SIZES[size] }}>
      <header className="mb-3 border-b border-line pb-2">
        <h2 className="text-[1.6em] font-bold leading-tight">{song.title || "Untitled song"}</h2>
        <p className="text-[0.9em] text-muted">
          {[song.artist, meta].filter(Boolean).join("   ·   ")}
        </p>
      </header>
      {song.notes.length > 0 && (
        <div className="mb-3 rounded border border-line p-2 text-[0.85em]">
          {song.notes.map((n) => (
            <p key={n.label} className="leading-snug">
              <strong className="mr-1.5 uppercase tracking-wide">{n.label}</strong>
              <span className="whitespace-pre-wrap">{n.body}</span>
            </p>
          ))}
        </div>
      )}
      <div className={columns === 2 ? "columns-2 gap-10" : ""}>
        {sections.map((section) => (
          <div key={section.id} className="mb-4 break-inside-avoid">
            <p className="part-label">{section.label}</p>
            {section.lines.map((line, i) => (
              <PrintLine key={i} line={line} chords={chords} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Toolbar({
  chords,
  onChords,
  columns,
  onColumns,
  size,
  onSize,
  children,
}: {
  chords: boolean;
  onChords: (on: boolean) => void;
  columns: 1 | 2;
  onColumns: (n: 1 | 2) => void;
  size: Size;
  onSize: (s: Size) => void;
  children?: React.ReactNode;
}) {
  return (
    <div data-tour="print-options" className="mb-6 space-y-4 rounded-xl border border-line p-4 print:hidden">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Pills
          label="Chords"
          value={chords ? "on" : "off"}
          onChange={(v) => onChords(v === "on")}
          options={[
            { value: "on", label: "Words and chords" },
            { value: "off", label: "Words only" },
          ]}
        />
        <Pills
          label="Columns"
          value={columns}
          onChange={onColumns}
          options={[
            { value: 1, label: "One" },
            { value: 2, label: "Two" },
          ]}
        />
        <Pills
          label="Text size"
          value={size}
          onChange={onSize}
          options={[
            { value: "small", label: "Small" },
            { value: "medium", label: "Medium" },
            { value: "large", label: "Large" },
          ]}
        />
        {children}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary px-4 py-2" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <p className="text-sm text-muted">In the print window, choose “Save as PDF” as the printer to make a file.</p>
      </div>
    </div>
  );
}

/** A single song, ready to print, with a choice of key. */
export function PrintSongSheet({ song }: { song: PrintableSong }) {
  const [chords, setChords] = useState(true);
  const [columns, setColumns] = useState<1 | 2>(2);
  const [size, setSize] = useState<Size>("medium");
  const [semitones, setSemitones] = useState(song.settings.semitones);
  const settings = { ...song.settings, semitones };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Toolbar chords={chords} onChords={setChords} columns={columns} onColumns={setColumns} size={size} onSize={setSize}>
        {song.originalKey && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Key</span>
            <select className="field field-sm !w-auto" value={semitones} onChange={(e) => setSemitones(Number(e.target.value))} aria-label="Key to print in">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {deriveSong(song.originalKey, { ...song.settings, semitones: i }).soundingKey}
                  {i === 0 ? " (usual)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </Toolbar>
      <SongPage song={{ ...song, settings }} chords={chords} columns={columns} size={size} lastOnSheet />
    </div>
  );
}

export type PrintableView = { id: string; name: string };

/**
 * A whole setlist, one song to a page, in the keys and with the chord changes set for this setlist. It starts with
 * the running order. The notes of one instrument can be included on each song's page.
 */
export function PrintSetlistSheet({
  name,
  date,
  songs,
  views,
  notesByView,
}: {
  name: string;
  date: string | null;
  songs: PrintableSong[];
  views: PrintableView[];
  /** Notes by view, then by the song's setlist position. */
  notesByView: Record<string, Record<number, string>>;
}) {
  const [chords, setChords] = useState(true);
  const [columns, setColumns] = useState<1 | 2>(2);
  const [size, setSize] = useState<Size>("medium");
  const [notes, setNotes] = useState<string>("");
  const everyone = views[0]?.id;

  const withNotes = songs.map((s, i) => {
    const picks = [everyone, notes && notes !== everyone ? notes : undefined].filter((v): v is string => !!v);
    const list = notes === "" ? [] : picks.flatMap((id) => (notesByView[id]?.[i]?.trim() ? [{ label: views.find((v) => v.id === id)?.name ?? "", body: notesByView[id][i].trim() }] : []));
    return { ...s, notes: list };
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Toolbar chords={chords} onChords={setChords} columns={columns} onColumns={setColumns} size={size} onSize={setSize}>
        {views.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Include notes for</span>
            <select className="field field-sm !w-auto" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Whose notes to print">
              <option value="">No notes</option>
              {views.map((v, i) => (
                <option key={v.id} value={v.id}>
                  {i === 0 ? "Everyone's notes" : `${v.name} (and everyone's)`}
                </option>
              ))}
            </select>
          </label>
        )}
      </Toolbar>

      <section className="mb-10 print:break-after-page">
        <h1 className="text-3xl font-bold">{name}</h1>
        {date && <p className="mt-1 text-muted">{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>}
        <ol className="mt-5 divide-y divide-line border-y border-line">
          {songs.map((s, i) => {
            const { keyLabel } = deriveSong(s.originalKey, s.settings);
            return (
              <li key={s.id + i} className="flex items-baseline gap-3 py-2">
                <span className="w-6 flex-none text-right text-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 font-medium">{s.title}</span>
                {s.singer && <span className="flex-none text-sm text-muted">{s.singer}</span>}
                <span className="flex-none font-mono text-sm">{keyLabel}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {withNotes.map((s, i) => (
        <SongPage key={s.id + i} song={s} chords={chords} columns={columns} size={size} lastOnSheet={i === withNotes.length - 1} />
      ))}
    </div>
  );
}
