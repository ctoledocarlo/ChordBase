"use client";

import { useRef, useState } from "react";
import { isValidChord, lineCells, type DropTarget, type EditorLine, type EditorSection } from "@/lib/chords";
import { SongScreen } from "./editor-preview";
import { PENDING, type SongInfo, type Target } from "./song-editor-shared";

type Props = {
  info: SongInfo;
  sections: EditorSection[];
  editing: Target | null;
  size: number | "fit";
  onPick: (target: Target) => void;
  /** Called with the chord typed at `target`, or null to remove it. */
  onCommit: (target: Target, chord: string | null) => void;
  onCancel: () => void;
  onMove: (id: string, target: DropTarget) => void;
};

/** Every part of the song on one screen, with chords you can click and type. */
export function ChordsTab({ info, sections, editing, size, onPick, onCommit, onCancel, onMove }: Props) {
  const empty = sections.every((s) => s.lines.every((l) => l.text.trim() === "" && l.chords.length === 0));
  if (empty) {
    return <p className="text-muted">Add the lyrics first, then come back here to place the chords.</p>;
  }

  return (
    <SongScreen
      info={info}
      size={size}
      sections={sections}
      onMove={onMove}
      renderLines={(s) =>
        s.lines.map((line, li) => {
          const here = editing && editing.sid === s.id && editing.line === li ? editing.pos : null;
          return (
            <ClickableLine
              key={li}
              line={line}
              editingPos={here}
              onPick={(pos) => onPick({ sid: s.id, line: li, pos })}
              onCommit={(chord) => onCommit({ sid: s.id, line: li, pos: here ?? 0 }, chord)}
              onCancel={onCancel}
            />
          );
        })
      }
    />
  );
}

/** A text box that sits in the chord row. Anything typed is accepted here; it is checked on save. */
function ChordInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (chord: string | null) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const finish = (fn: () => void) => {
    if (finished.current) return;
    finished.current = true;
    fn();
  };
  const commit = () => {
    const typed = value.replace(/[[\]{}]/g, "").trim();
    // "am" and "AM" are most likely meant as A minor; only the note letter needs to be a capital.
    onCommit(typed ? typed[0].toUpperCase() + typed.slice(1) : null);
  };

  return (
    <input
      data-chord-input="true"
      autoFocus
      value={value}
      aria-label="Chord"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(commit)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(commit);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(onCancel);
        }
      }}
      style={{ width: `${Math.max(value.length, 2) + 1}ch` }}
      className="chord-input"
    />
  );
}

function ClickableLine({
  line,
  editingPos,
  onPick,
  onCommit,
  onCancel,
}: {
  line: EditorLine;
  editingPos: number | null;
  onPick: (pos: number) => void;
  onCommit: (chord: string | null) => void;
  onCancel: () => void;
}) {
  // While a new chord is being typed, give it a temporary slot so the input has somewhere to sit.
  const adding = editingPos !== null && !line.chords.some((c) => c.pos === editingPos);
  const cells = lineCells(adding ? { ...line, chords: [...line.chords, { pos: editingPos, chord: PENDING }] } : line);
  const hasEndChord = line.text.length > 0 && line.chords.some((c) => c.pos === line.text.length);

  return (
    <div className="group leading-tight">
      {cells.map((cell) => (
        <span key={cell.start} className="inline-flex flex-col align-top">
          {editingPos === cell.start && cell.chord !== undefined ? (
            <span className="min-h-[1.5em] pr-[0.25em]">
              <ChordInput
                key={cell.start}
                initial={cell.chord === PENDING ? "" : cell.chord}
                onCommit={onCommit}
                onCancel={onCancel}
              />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onPick(cell.start)}
              aria-label={cell.chord ? `Edit chord ${cell.chord}` : "Add chord here"}
              className={`min-h-[1.5em] pr-[0.25em] text-left font-mono text-[0.9em] font-bold ${
                !cell.chord
                  ? "text-transparent"
                  : isValidChord(cell.chord)
                    ? "text-chord hover:underline"
                    : "text-danger underline decoration-wavy"
              }`}
            >
              {cell.chord ?? " "}
            </button>
          )}
          <span className="whitespace-pre-wrap">
            {Array.from(cell.text).map((ch, k) => (
              <span key={k} onClick={() => onPick(cell.start + k)} className="cursor-text rounded-[2px] hover:bg-hover">
                {ch}
              </span>
            ))}
          </span>
        </span>
      ))}
      {!hasEndChord && editingPos !== line.text.length && (
        <button
          type="button"
          onClick={() => onPick(line.text.length)}
          aria-label="Add chord at end of line"
          className="ml-[0.3em] inline-block min-w-[1.4em] rounded-[2px] align-top leading-tight text-muted opacity-0 hover:bg-hover group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-40"
        >
          +
        </button>
      )}
    </div>
  );
}
