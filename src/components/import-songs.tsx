"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ImportItem, ImportResult } from "@/app/(app)/songs/import/actions";
import { normalize } from "@/lib/import/chart";
import { MAX_BATCH } from "@/lib/import/limits";
import type { ImportedSong } from "@/lib/import/song";
import type { SongName } from "@/lib/songs";
import { KEYS } from "./song-editor-shared";
import { SongSheet } from "./song-sheet";

interface Row {
  id: string;
  song: ImportedSong;
  /** Which version of the song (which slide) is being imported. */
  version: number;
  include: boolean;
  title: string;
  artist: string;
  /** A key chosen by hand; null means use the one found in the file. */
  key: string | null;
  /** A song with this title is already in the library, or earlier in this list. */
  duplicate: boolean;
  open: boolean;
  error?: string;
}

interface Props {
  existing: SongName[];
  onImport: (items: ImportItem[]) => Promise<ImportResult>;
}

const isPowerPoint = (name: string) => /\.pptx?$/i.test(name) && !name.startsWith("~$");

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Every PowerPoint file in a drop, including those inside dropped folders. */
async function filesFromDrop(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = [];
  const walk = async (entry: FileSystemEntry | null): Promise<void> => {
    if (!entry) return;
    if (entry.isFile) {
      const file = await new Promise<File>((ok, fail) => (entry as FileSystemFileEntry).file(ok, fail));
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  // The list is emptied once the drop event ends, so take the entries first.
  const entries = [...items].map((item) => item.webkitGetAsEntry());
  for (const entry of entries) await walk(entry);
  return files;
}

export function ImportSongs({ existing, onImport }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [unreadable, setUnreadable] = useState<{ name: string; message: string }[]>([]);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);
  const filePicker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);

  const known = useMemo(() => new Set(existing.map((s) => normalize(s.title))), [existing]);
  const busy = reading !== null || importing !== null;
  const chosen = rows.filter((r) => r.include);

  async function readFiles(all: File[]) {
    const files = all.filter((f) => isPowerPoint(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const skipped = all.length - files.length;
    setSummary(null);
    if (files.length === 0) {
      setUnreadable((u) => [...u, { name: "No PowerPoint files", message: "Choose files that end in .ppt or .pptx." }]);
      return;
    }

    setReading({ done: 0, total: files.length });
    const added: Row[] = [];
    const failed: { name: string; message: string }[] = [];
    const seen = new Set(known);
    for (const row of rows) seen.add(normalize(row.title));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // The reader (and the libraries it uses) is fetched when the first file is chosen, not with the page.
        const { importDeck } = await import("@/lib/import/song");
        const songs = importDeck(file.name, new Uint8Array(await file.arrayBuffer()));
        if (songs.length === 0) failed.push({ name: file.name, message: "No song text was found in this file." });
        for (const song of songs) {
          const key = normalize(song.title);
          const duplicate = seen.has(key);
          seen.add(key);
          added.push({
            id: `r${counter.current++}`,
            song,
            version: 0,
            include: !duplicate,
            title: song.title,
            artist: song.artist,
            key: null,
            duplicate,
            open: false,
          });
        }
      } catch (error) {
        failed.push({ name: file.name, message: error instanceof Error ? error.message : "This file couldn't be read." });
      }
      setReading({ done: i + 1, total: files.length });
      await tick(); // let the page update between files
    }

    if (skipped > 0) failed.push({ name: `${skipped} other ${skipped === 1 ? "file" : "files"}`, message: "Not PowerPoint files, so they were skipped." });
    setRows((r) => [...r, ...added]);
    setUnreadable((u) => [...u, ...failed]);
    setReading(null);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length > 0) void readFiles(files);
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    void readFiles(await filesFromDrop(e.dataTransfer.items));
  }

  const update = (id: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  async function importChosen() {
    const batchRows = rows.filter((r) => r.include);
    if (batchRows.length === 0) return;
    setSummary(null);
    setImporting({ done: 0, total: batchRows.length });
    let created = 0;
    const errors = new Map<string, string>();
    const saved = new Set<string>();

    for (let start = 0; start < batchRows.length; start += MAX_BATCH) {
      const batch = batchRows.slice(start, start + MAX_BATCH);
      const items: ImportItem[] = batch.map((r) => {
        const v = r.song.versions[r.version];
        return {
          title: r.title.trim(),
          artist: r.artist.trim(),
          key: r.key ?? v.key,
          tempo: v.tempo,
          timeSignature: r.song.timeSignature,
          capo: v.capo,
          body: v.body,
        };
      });
      try {
        const result = await onImport(items);
        created += result.created;
        const failedAt = new Map(result.failed.map((f) => [f.index, f.error]));
        batch.forEach((r, i) => {
          const error = failedAt.get(i);
          if (error) errors.set(r.id, error);
          else saved.add(r.id);
        });
      } catch {
        batch.forEach((r) => errors.set(r.id, "Couldn't reach the server. Please try again."));
      }
      setImporting({ done: Math.min(start + MAX_BATCH, batchRows.length), total: batchRows.length });
    }

    setRows((all) => all.filter((r) => !saved.has(r.id)).map((r) => ({ ...r, error: errors.get(r.id) })));
    setImporting(null);
    setSummary(
      errors.size === 0
        ? `Imported ${created} ${created === 1 ? "song" : "songs"}.`
        : `Imported ${created} ${created === 1 ? "song" : "songs"}. ${errors.size} could not be saved; they are still listed below.`,
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Import songs</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Choose PowerPoint files (.ppt or .pptx), or a whole folder of them. You&apos;ll see what was found in each one before
        anything is saved.
      </p>

      <input ref={filePicker} type="file" multiple accept=".ppt,.pptx" className="hidden" onChange={onPick} />
      <input
        ref={folderPicker}
        type="file"
        className="hidden"
        onChange={onPick}
        // Lets the person pick a folder; the browser then hands over every file inside it.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-6 flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center ${
          dragging ? "border-accent bg-hover" : "border-line"
        }`}
      >
        <p className="text-sm text-muted">Drop files or folders here</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => filePicker.current?.click()}>
            Choose files
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => folderPicker.current?.click()}>
            Choose a folder
          </button>
        </div>
        {reading && (
          <p role="status" className="text-sm text-muted">
            Reading file {reading.done} of {reading.total}…
          </p>
        )}
      </div>

      {summary && (
        <p role="status" className="mt-6 rounded-md border border-line bg-hover px-4 py-3 text-sm">
          {summary}{" "}
          <Link href="/" className="underline">
            View your songs
          </Link>
        </p>
      )}

      {unreadable.length > 0 && (
        <section className="mt-6" aria-label="Files that could not be read">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Not imported</h2>
            <button type="button" className="text-sm text-muted underline hover:text-foreground" onClick={() => setUnreadable([])}>
              Dismiss
            </button>
          </div>
          <ul className="space-y-1 text-sm text-danger">
            {unreadable.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.name}:</span> {f.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length > 0 && (
        <section className="mt-8" aria-label="Songs found">
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-background py-3">
            <h2 className="text-sm font-medium">
              {rows.length} {rows.length === 1 ? "song" : "songs"} found
              <span className="ml-2 font-normal text-muted">{chosen.length} selected</span>
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                className="text-muted underline hover:text-foreground"
                disabled={busy}
                onClick={() => setRows((all) => all.map((r) => ({ ...r, include: true })))}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-muted underline hover:text-foreground"
                disabled={busy}
                onClick={() => setRows((all) => all.map((r) => ({ ...r, include: false })))}
              >
                Select none
              </button>
              <button
                type="button"
                className="text-muted underline hover:text-foreground"
                disabled={busy}
                onClick={() => {
                  setRows([]);
                  setSummary(null);
                }}
              >
                Clear the list
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary ml-auto"
              disabled={busy || chosen.length === 0}
              onClick={() => void importChosen()}
            >
              {importing
                ? `Saving ${importing.done} of ${importing.total}…`
                : `Import ${chosen.length} ${chosen.length === 1 ? "song" : "songs"}`}
            </button>
          </div>
          <ul className="divide-y divide-line border-b border-line">
            {rows.map((row) => {
              const version = row.song.versions[row.version];
              const key = row.key ?? version.key;
              const keyOptions = KEYS.includes(key) || key === "" ? KEYS : [key, ...KEYS];
              const warnings = row.song.warnings.filter((w) => !w.startsWith("The key ("));
              return (
                <li key={row.id} className="py-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={row.include}
                      disabled={importing !== null}
                      onChange={(e) => update(row.id, { include: e.target.checked })}
                      aria-label={`Import ${row.title}`}
                      className="mt-2.5"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_8rem]">
                        <input
                          value={row.title}
                          onChange={(e) => update(row.id, { title: e.target.value })}
                          aria-label="Title"
                          className="field field-sm font-medium"
                        />
                        <input
                          value={row.artist}
                          onChange={(e) => update(row.id, { artist: e.target.value })}
                          aria-label="Artist"
                          placeholder="Artist"
                          className="field field-sm"
                        />
                        <select
                          value={key}
                          onChange={(e) => update(row.id, { key: e.target.value })}
                          aria-label="Key"
                          className="field field-sm"
                        >
                          <option value="">Key not set</option>
                          {keyOptions.map((k) => (
                            <option key={k} value={k}>
                              {k.endsWith("m") ? `${k.slice(0, -1)} minor` : `${k} major`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                        <span>{row.song.fileName}</span>
                        <span>
                          {version.sections.length} {version.sections.length === 1 ? "section" : "sections"}, {version.chordCount}{" "}
                          {version.chordCount === 1 ? "chord" : "chords"}
                        </span>
                        {row.key === null && version.keySource === "guessed" && <span>Key guessed from the chords</span>}
                        {row.duplicate && <span className="text-foreground">Already in your library</span>}
                        {row.song.versions.length > 1 && (
                          <label className="flex items-center gap-1.5">
                            Version
                            <select
                              value={row.version}
                              onChange={(e) => update(row.id, { version: Number(e.target.value), key: null })}
                              className="field field-sm w-auto"
                            >
                              {row.song.versions.map((v, i) => (
                                <option key={i} value={i}>
                                  {v.label}
                                  {v.key ? `, key of ${v.key}` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </p>

                      {warnings.length > 0 && (
                        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
                          {warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                      {row.error && (
                        <p role="alert" className="text-sm text-danger">
                          {row.error}
                        </p>
                      )}

                      <button
                        type="button"
                        className="text-sm underline"
                        aria-expanded={row.open}
                        onClick={() => update(row.id, { open: !row.open })}
                      >
                        {row.open ? "Hide the song" : "Show the song"}
                      </button>
                      {row.open && (
                        <div className="max-h-[28rem] overflow-auto rounded-md border border-line bg-surface p-4">
                          <SongSheet sections={version.sections} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
