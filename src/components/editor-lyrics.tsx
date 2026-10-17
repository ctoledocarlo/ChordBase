"use client";

import { useState } from "react";
import type { EditorSection } from "@/lib/chords";
import { ArrowDownIcon, ArrowUpIcon, ChevronIcon, CopyIcon, PlusIcon, TrashIcon } from "./icons";
import { Modal } from "./modal";
import { KEYS, PART_PRESETS, TIME_SIGNATURES, type SongInfo } from "./song-editor-shared";
import { TempoModal } from "./tempo-modal";

type Props = {
  info: SongInfo;
  onInfo: (patch: Partial<SongInfo>) => void;
  sections: EditorSection[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onWords: (id: string, text: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onMoveTo: (fromId: string, toIndex: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  onPaste: (text: string) => void;
  /** Suggested name when a preset button is pressed, numbered if that kind of part already exists. */
  labelFor: (base: string, selfId: string) => string;
  titleMissing: boolean;
  infoOpen: boolean;
  onInfoOpen: (open: boolean) => void;
};

export function LyricsTab(p: Props) {
  const { info, onInfo, sections } = p;
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [tempoOpen, setTempoOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const keyChoices = KEYS.includes(info.key) || info.key === "" ? KEYS : [info.key, ...KEYS];
  const selectedIndex = Math.max(0, sections.findIndex((s) => s.id === p.selectedId));
  const selected = sections[selectedIndex];
  const summary = [info.title || "Untitled song", info.key && `Key of ${info.key}`, info.tempo && `${info.tempo} BPM`]
    .filter(Boolean)
    .join("  ·  ");

  function closePaste() {
    setPasted("");
    setPasting(false);
  }

  function endDrag() {
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="space-y-10">
      <TempoModal
        open={tempoOpen}
        current={info.tempo}
        onClose={() => setTempoOpen(false)}
        onSave={(tempo) => {
          onInfo({ tempo });
          setTempoOpen(false);
        }}
      />

      <section data-tour="editor-info">
        <button
          type="button"
          onClick={() => p.onInfoOpen(!p.infoOpen)}
          aria-expanded={p.infoOpen}
          className="flex w-full items-center gap-2 text-left"
        >
          <span className={`text-muted transition-transform ${p.infoOpen ? "" : "-rotate-90"}`}>
            <ChevronIcon />
          </span>
          <h2 className="text-sm font-medium">Song information</h2>
          {!p.infoOpen && <span className="min-w-0 truncate text-sm text-muted">{summary}</span>}
        </button>
        <div className={`mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${p.infoOpen ? "" : "hidden"}`}>
          <label className="block sm:col-span-2">
            <span className="label">Title</span>
            <input
              value={info.title}
              onChange={(e) => onInfo({ title: e.target.value })}
              required
              aria-invalid={p.titleMissing}
              className="field"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Artist or writer</span>
            <input value={info.artist} onChange={(e) => onInfo({ artist: e.target.value })} className="field" />
          </label>
          <label className="block">
            <span className="label">Key</span>
            <select value={info.key} onChange={(e) => onInfo({ key: e.target.value })} className="field">
              <option value="">Not set</option>
              {keyChoices.map((k) => (
                <option key={k} value={k}>
                  {k.endsWith("m") ? `${k.slice(0, -1)} minor` : `${k} major`}
                </option>
              ))}
            </select>
          </label>
          <div className="block">
            <span className="label">Tempo</span>
            <button type="button" onClick={() => setTempoOpen(true)} className="field text-left">
              {info.tempo ? `${info.tempo} BPM` : <span className="text-muted">Set tempo…</span>}
            </button>
          </div>
          <label className="block">
            <span className="label">Time signature</span>
            <select value={info.timeSignature} onChange={(e) => onInfo({ timeSignature: e.target.value })} className="field">
              {TIME_SIGNATURES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Usual capo</span>
            <select value={info.capo} onChange={(e) => onInfo({ capo: e.target.value })} className="field">
              <option value="0">No capo</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  Fret {i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Lyrics</h2>
          <button type="button" className="btn" onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>
            Paste all the lyrics
          </button>
        </div>

        <Modal open={pasting} title="Paste all the lyrics" onClose={closePaste}>
          <label className="block">
            <span className="label">
              Paste the whole song. Leave an empty line between sections. A line such as “Chorus” above a section names
              it.
            </span>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={12}
              autoFocus
              className="field leading-relaxed"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={closePaste}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pasted.trim() === ""}
              onClick={() => {
                p.onPaste(pasted);
                closePaste();
              }}
            >
              Split into sections
            </button>
          </div>
        </Modal>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Sections of the song. Drag to reorder.">
              {sections.map((s, index) => {
                const isSelected = s.id === selected?.id;
                const words = s.lines.map((l) => l.text).join("\n").trim();
                return (
                  <li key={s.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      draggable
                      aria-pressed={isSelected}
                      aria-label={`${s.label || "Unnamed Section"}. Alt and arrow keys move it.`}
                      onClick={() => p.onSelect(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          p.onSelect(s.id);
                        } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowUp")) {
                          e.preventDefault();
                          p.onMove(index, -1);
                        } else if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowDown")) {
                          e.preventDefault();
                          p.onMove(index, 1);
                        }
                      }}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", s.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(s.id);
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        setOverId(s.id);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragId && dragId !== s.id) p.onMoveTo(dragId, index);
                        endDrag();
                      }}
                      onDragEnd={endDrag}
                      className={`h-36 cursor-grab overflow-hidden rounded-md border p-3 text-left ${
                        isSelected ? "border-foreground bg-hover ring-1 ring-foreground" : "border-line hover:bg-hover"
                      } ${dragId === s.id ? "opacity-40" : ""} ${
                        overId === s.id && dragId !== s.id ? "border-l-4 border-l-accent" : ""
                      }`}
                    >
                      <p className="mb-2 flex items-center gap-2">
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-xs font-semibold text-background">
                          {index + 1}
                        </span>
                        <span className="truncate text-base font-semibold">{s.label || "Unnamed Section"}</span>
                      </p>
                      <p className="line-clamp-4 text-sm whitespace-pre-line text-muted">{words || "Empty"}</p>
                    </div>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={p.onAdd}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    setOverId("end");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId) p.onMoveTo(dragId, sections.length - 1);
                    endDrag();
                  }}
                  className={`flex h-36 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-sm text-muted hover:bg-hover hover:text-foreground ${
                    overId === "end" ? "border-accent" : ""
                  }`}
                >
                  <PlusIcon /> Add a section
                </button>
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted">Drag the sections to change their order.</p>
          </div>

          {selected && (
            <div className="space-y-4 rounded-md border border-line p-4">
              <div>
                <p className="mb-3 text-sm text-muted">
                  Editing section {selectedIndex + 1} of {sections.length}
                </p>
                <label className="label" htmlFor="part-name">
                  Section name
                </label>
                <input
                  id="part-name"
                  value={selected.label}
                  list="part-presets"
                  placeholder="e.g. Verse 1, Chorus, or your own"
                  onChange={(e) => p.onRename(selected.id, e.target.value)}
                  className="field text-base font-semibold"
                />
                <datalist id="part-presets">
                  {PART_PRESETS.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PART_PRESETS.slice(0, 7).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="btn px-2 py-0.5 text-xs"
                      onClick={() => p.onRename(selected.id, p.labelFor(n, selected.id))}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="label">Words</span>
                <textarea
                  value={selected.lines.map((l) => l.text).join("\n")}
                  onChange={(e) => p.onWords(selected.id, e.target.value)}
                  rows={Math.max(8, selected.lines.length + 2)}
                  placeholder="Type or paste the words, one line of the song per line"
                  className="field leading-relaxed"
                />
              </label>

              <div className="flex flex-wrap gap-1 border-t border-line pt-3">
                <button type="button" className="btn btn-quiet" disabled={selectedIndex === 0} onClick={() => p.onMove(selectedIndex, -1)}>
                  <ArrowUpIcon /> Earlier
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={selectedIndex === sections.length - 1}
                  onClick={() => p.onMove(selectedIndex, 1)}
                >
                  <ArrowDownIcon /> Later
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => p.onDuplicate(selectedIndex)}>
                  <CopyIcon /> Duplicate
                </button>
                <button type="button" className="btn btn-quiet ml-auto text-danger" onClick={() => p.onDelete(selectedIndex)}>
                  <TrashIcon /> Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
