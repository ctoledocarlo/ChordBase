"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  normalizeColumns,
  placeSection,
  serializeSections,
  type DropTarget,
  type EditorSection,
} from "@/lib/chords";
import { FIT } from "@/lib/setlist-settings";
import { effectiveBody, toStoredBody } from "@/lib/setlist-body";
import type { SetlistItem } from "@/lib/setlists";
import type { ChordShortcut } from "@/lib/songs";
import { ChordsTab } from "./editor-chords";
import { RedoIcon, UndoIcon } from "./icons";
import { SidebarPortal } from "./sidebar-portal";
import type { Target } from "./song-editor-shared";
import { deriveSong, useSongSections } from "./song-settings";

const sameTarget = (a: Target | null, b: Target) => !!a && a.sid === b.sid && a.line === b.line && a.pos === b.pos;

/**
 * Edit a song's chords inside a setlist. What you see is what the band sees (in the key and
 * capo chosen for this setlist); every change shows right away and is kept for this setlist only.
 * The song in the library is never touched.
 */
export function SetlistChordEditor({
  item,
  shortcuts,
  onChange,
  onDone,
}: {
  item: SetlistItem;
  shortcuts: ChordShortcut[];
  /** The new version of the song's text for this setlist (in its original key), or null to go back to the song's own. */
  onChange: (body: string | null) => void;
  onDone: () => void;
}) {
  const { original_key: originalKey, title, tempo } = item.song;
  const { shapeShift, keyLabel } = deriveSong(originalKey, item.settings);
  const body = effectiveBody(item);
  // Editing always shows the chords as written; a chord style is only for playing from.
  const sections = useSongSections(body, originalKey, { ...item.settings, style: "original" });

  const [editing, setEditingState] = useState<Target | null>(null);
  const editingRef = useRef<Target | null>(null);
  const setEditing = (t: Target | null) => {
    editingRef.current = t;
    setEditingState(t);
  };

  // Undo and redo: the earlier versions of this song's text for the setlist (null = the song's own).
  const [past, setPast] = useState<(string | null)[]>([]);
  const [future, setFuture] = useState<(string | null)[]>([]);

  function apply(next: string | null) {
    onChange(next);
  }

  /** Sections as shown (in this setlist's key) go back to the song's own key before they are kept. */
  function commit(change: (all: EditorSection[]) => EditorSection[]) {
    const next = normalizeColumns(change(sections));
    if (next === sections) return;
    const shown = serializeSections(next);
    const stored = toStoredBody(shown, shapeShift, originalKey);
    if (stored === body) return;
    setPast((p) => [...p.slice(-99), item.body_override]);
    setFuture([]);
    apply(stored);
  }

  function undo() {
    if (past.length === 0) return;
    setEditing(null);
    setFuture((f) => [item.body_override, ...f]);
    apply(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }

  function redo() {
    if (future.length === 0) return;
    setEditing(null);
    setPast((p) => [...p, item.body_override]);
    apply(future[0]);
    setFuture((f) => f.slice(1));
  }

  function reset() {
    setEditing(null);
    setPast((p) => [...p.slice(-99), item.body_override]);
    setFuture([]);
    apply(null);
  }

  function setChord(t: Target, chord: string | null) {
    commit((all) =>
      all.map((s) =>
        s.id !== t.sid
          ? s
          : {
              ...s,
              lines: s.lines.map((l, i) => {
                if (i !== t.line) return l;
                const existing = l.chords.find((c) => c.pos === t.pos)?.chord ?? null;
                if (existing === chord) return l;
                const rest = l.chords.filter((c) => c.pos !== t.pos);
                return { ...l, chords: chord ? [...rest, { pos: t.pos, chord }] : rest };
              }),
            },
      ),
    );
    setEditing(null);
  }

  /** Ignore a late commit from a box that is no longer the one being edited. */
  function commitChord(t: Target, chord: string | null) {
    if (sameTarget(editingRef.current, t)) setChord(t, chord);
  }

  function moveSection(id: string, target: DropTarget) {
    setEditing(null);
    commit((all) => placeSection(all, id, target));
  }

  function onKeyDown(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (!(e.ctrlKey || e.metaKey) || el.dataset.chordInput) return;
    if (el instanceof HTMLInputElement && el.type !== "checkbox") return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === "y" || (k === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <SidebarPortal>
        <div className="space-y-2">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-sm text-muted">
            Click a word to place or change a chord. Changes show up right away and only apply to this setlist. The song
            in your library stays as it is.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn" onClick={undo} disabled={past.length === 0}>
            <UndoIcon /> Undo
          </button>
          <button type="button" className="btn" onClick={redo} disabled={future.length === 0}>
            <RedoIcon /> Redo
          </button>
        </div>

        {shortcuts.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-medium">Your chords</h2>
            <div className="flex flex-wrap gap-1.5">
              {shortcuts.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="btn px-2.5 py-1 font-mono"
                  disabled={!editing}
                  // Keep the chord box focused so it doesn't close before the tap lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editing && setChord(editing, s.chord)}
                >
                  {s.chord}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">{editing ? "Tap a chord to place it." : "Click a word first."}</p>
          </section>
        )}

        {item.body_override !== null && (
          <section>
            <p className="mb-2 text-sm text-muted">This setlist has its own chords for this song.</p>
            <button type="button" className="btn w-full" onClick={reset}>
              Go back to the song&apos;s chords
            </button>
          </section>
        )}

        <button type="button" className="btn btn-primary w-full" onClick={onDone}>
          Done
        </button>
      </SidebarPortal>

      <ChordsTab
        info={{ title, artist: "", key: keyLabel, tempo: tempo ? String(tempo) : "", timeSignature: "", capo: "", ccli: "", tags: "", melodyLow: "", melodyHigh: "" }}
        sections={sections}
        editing={editing}
        size={item.settings.fontSize === FIT ? "fit" : item.settings.fontSize}
        onPick={setEditing}
        onCommit={commitChord}
        onCancel={() => setEditing(null)}
        onMove={moveSection}
      />
    </div>
  );
}
