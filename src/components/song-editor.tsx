"use client";

import { useActionState, useRef, useState, useTransition, type FormEvent } from "react";
import {
  addChordShortcut,
  removeChordShortcut,
  saveSong,
  type SongFormState,
} from "@/app/(app)/songs/actions";
import {
  autoColumnCount,
  balanceColumns,
  chordsOf,
  cleanLyric,
  columnsOf,
  isValidChord,
  moveInOrder,
  newSectionId,
  normalizeColumns,
  parseSections,
  placeSection,
  reflowLines,
  serializeSections,
  splitPastedLyrics,
  type DropTarget,
  type EditorSection,
} from "@/lib/chords";
import type { ChordShortcut, Song } from "@/lib/songs";
import { ChordsTab } from "./editor-chords";
import { LyricsTab } from "./editor-lyrics";
import { PreviewTab } from "./editor-preview";
import { RedoIcon, UndoIcon } from "./icons";
import { SidebarPortal } from "./sidebar-portal";
import type { EditorTab, SongInfo, Target } from "./song-editor-shared";

const initial: SongFormState = {};

/** What every new section is called until the user names it. */
const UNNAMED = "Unnamed Section";

const HISTORY_LIMIT = 100;
/** Keystrokes in the same field this close together count as one undo step. */
const COALESCE_MS = 1000;
/** Called only from event handlers, never during render. */
const clock = () => Date.now();

const TABS: { id: EditorTab; label: string }[] = [
  { id: "lyrics", label: "Lyrics" },
  { id: "chords", label: "Chords" },
  { id: "preview", label: "Preview" },
];

type History = { past: EditorSection[][]; present: EditorSection[]; future: EditorSection[][] };

function startingSections(body: string | undefined): EditorSection[] {
  const parsed = parseSections(body ?? "");
  return parsed.length > 0 ? parsed : [{ id: "s1", label: UNNAMED, column: 0, lines: [{ text: "", chords: [] }] }];
}

const sameTarget = (a: Target | null, b: Target) => !!a && a.sid === b.sid && a.line === b.line && a.pos === b.pos;

export function SongEditor({ song, shortcuts: initialShortcuts }: { song?: Song; shortcuts: ChordShortcut[] }) {
  const [state, action, pending] = useActionState(saveSong, initial);
  const [tab, setTab] = useState<EditorTab>("lyrics");
  const [info, setInfo] = useState<SongInfo>({
    title: song?.title ?? "",
    artist: song?.artist ?? "",
    key: song?.original_key ?? "",
    tempo: song?.tempo != null ? String(song.tempo) : "",
    timeSignature: song?.time_signature ?? "4/4",
    capo: String(song?.default_capo ?? 0),
    ccli: song?.ccli_number ?? "",
    tags: song?.tags.join(", ") ?? "",
  });
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: startingSections(song?.body),
    future: [],
  }));
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditingState] = useState<Target | null>(null);
  const editingRef = useRef<Target | null>(null);
  const lastEdit = useRef<{ key: string; time: number } | null>(null);
  const [textSize, setTextSize] = useState<number | "fit">("fit");
  const [infoOpen, setInfoOpen] = useState(true);
  const [shortcuts, setShortcuts] = useState(initialShortcuts);
  const [shortcutDraft, setShortcutDraft] = useState("");
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [working, startWorking] = useTransition();

  const sections = history.present;
  const body = serializeSections(sections);
  const used = chordsOf(sections);
  const invalid = used.filter((c) => !isValidChord(c));
  const titleMissing = info.title.trim() === "";
  const columnCount = columnsOf(sections).length;

  const setEditing = (t: Target | null) => {
    editingRef.current = t;
    setEditingState(t);
  };

  // ---- history -------------------------------------------------------------

  /** Apply a change and remember it for undo. */
  function commit(change: (all: EditorSection[]) => EditorSection[], coalesceKey?: string) {
    const now = clock();
    const last = lastEdit.current;
    const merge = !!coalesceKey && last?.key === coalesceKey && now - last.time < COALESCE_MS;
    lastEdit.current = coalesceKey ? { key: coalesceKey, time: now } : null;
    setHistory((h) => {
      const next = normalizeColumns(change(h.present));
      if (next === h.present) return h;
      return {
        past: merge ? h.past : [...h.past.slice(-(HISTORY_LIMIT - 1)), h.present],
        present: next,
        future: [],
      };
    });
  }

  function undo() {
    lastEdit.current = null;
    setEditing(null);
    setHistory((h) =>
      h.past.length === 0
        ? h
        : { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] },
    );
  }

  function redo() {
    lastEdit.current = null;
    setEditing(null);
    setHistory((h) =>
      h.future.length === 0
        ? h
        : { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) },
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (!(e.ctrlKey || e.metaKey) || target.dataset.chordInput) return;
    // Plain one-line fields keep the browser's own undo.
    if (target instanceof HTMLInputElement && target.type !== "checkbox") return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((k === "z" && e.shiftKey) || k === "y") {
      e.preventDefault();
      redo();
    }
  }

  // ---- parts ---------------------------------------------------------------

  const lastColumn = (all: EditorSection[]) => all.reduce((max, s) => Math.max(max, s.column), 0);

  const update = (sid: string, fn: (s: EditorSection) => EditorSection, coalesceKey?: string) =>
    commit((all) => all.map((s) => (s.id === sid ? fn(s) : s)), coalesceKey);

  const selected = sections.find((s) => s.id === selectedId) ?? sections[0];

  function labelFor(base: string, selfId: string) {
    const others = sections.filter((s) => s.id !== selfId && s.label.toLowerCase().startsWith(base.toLowerCase())).length;
    return base === "Verse" || others > 0 ? `${base} ${others + 1}` : base;
  }

  function addPart() {
    const id = newSectionId(sections);
    commit((all) => [
      ...all,
      { id, label: UNNAMED, column: lastColumn(all), lines: [{ text: "", chords: [] }] },
    ]);
    setSelectedId(id);
  }

  function pasteLyrics(text: string) {
    const parts = splitPastedLyrics(text);
    if (parts.length === 0) return;
    const firstId = newSectionId(sections);
    commit((all) => {
      const blank = all.length === 1 && all[0].lines.every((l) => l.text.trim() === "" && l.chords.length === 0);
      const base = blank ? [] : all;
      let next = Number(firstId.slice(1));
      const added = parts.map((p) => ({
        id: `s${next++}`,
        label: p.label ?? UNNAMED,
        column: lastColumn(base),
        lines: p.lines.map((t) => ({ text: t, chords: [] })),
      }));
      const all2 = [...base, ...added];
      // A fresh song gets an automatic layout; otherwise the new sections join the last column.
      return blank ? balanceColumns(all2, autoColumnCount(all2)) : all2;
    });
    setSelectedId(firstId);
  }

  function changeWords(id: string, text: string) {
    update(id, (s) => ({ ...s, lines: reflowLines(s.lines, cleanLyric(text).split("\n")) }), `words-${id}`);
  }

  // Moving in the Lyrics grid follows reading order: column by column, top to bottom.
  function move(index: number, dir: -1 | 1) {
    commit((all) => {
      const j = index + dir;
      return j < 0 || j >= all.length ? all : moveInOrder(all, all[index].id, j);
    });
  }

  function moveTo(fromId: string, toIndex: number) {
    commit((all) => moveInOrder(all, fromId, toIndex));
  }

  // Dragging a section on the Chords or Preview screen.
  function moveSection(id: string, target: DropTarget) {
    setEditing(null);
    commit((all) => placeSection(all, id, target));
  }

  function setColumnCount(count: number) {
    commit((all) => balanceColumns(all, count));
  }

  function duplicate(index: number) {
    const id = newSectionId(sections);
    commit((all) => {
      const copy = {
        ...all[index],
        id,
        lines: all[index].lines.map((l) => ({ text: l.text, chords: l.chords.map((c) => ({ ...c })) })),
      };
      return [...all.slice(0, index + 1), copy, ...all.slice(index + 1)];
    });
    setSelectedId(id);
  }

  // Deleting a part can be undone, so it doesn't ask for confirmation.
  function remove(index: number) {
    setSelectedId(sections[index + 1]?.id ?? sections[index - 1]?.id ?? "");
    commit((all) => (all.length > 1 ? all.filter((_, i) => i !== index) : all));
    setEditing(null);
  }

  // ---- chords --------------------------------------------------------------

  function setChord(t: Target, chord: string | null) {
    update(t.sid, (s) => ({
      ...s,
      lines: s.lines.map((l, i) => {
        if (i !== t.line) return l;
        const existing = l.chords.find((c) => c.pos === t.pos)?.chord ?? null;
        if (existing === chord) return l;
        const rest = l.chords.filter((c) => c.pos !== t.pos);
        return { ...l, chords: chord ? [...rest, { pos: t.pos, chord }] : rest };
      }),
    }));
    setEditing(null);
  }

  /** Ignore a late commit from a box that is no longer the one being edited. */
  function commitChord(t: Target, chord: string | null) {
    if (sameTarget(editingRef.current, t)) setChord(t, chord);
  }

  function stepTextSize(delta: number) {
    const el = document.querySelector<HTMLElement>("[data-fit-area]");
    const current = textSize === "fit" ? parseFloat(el?.style.fontSize || "16") : textSize;
    setTextSize(Math.min(40, Math.max(8, Math.round(current + delta))));
  }

  function addShortcut(chord: string) {
    setShortcutError(null);
    startWorking(async () => {
      const res = await addChordShortcut(chord);
      if (res.error || !res.id) {
        setShortcutError(res.error ?? "Couldn't save that chord.");
        return;
      }
      const id = res.id;
      const value = chord.trim();
      setShortcuts((list) => (list.some((s) => s.chord === value) ? list : [...list, { id, chord: value }]));
      setShortcutDraft("");
    });
  }

  function addUsedChords() {
    const missing = used.filter((c) => isValidChord(c) && !shortcuts.some((s) => s.chord === c));
    startWorking(async () => {
      for (const chord of missing) {
        const res = await addChordShortcut(chord);
        if (res.id) setShortcuts((list) => [...list, { id: res.id as string, chord }]);
      }
    });
  }

  function removeShortcut(s: ChordShortcut) {
    setShortcuts((list) => list.filter((x) => x.id !== s.id));
    startWorking(async () => {
      await removeChordShortcut(s.id);
    });
  }

  // ---- saving --------------------------------------------------------------

  /** Everything the song needs before it can be saved and transposed later. */
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (titleMissing) {
      e.preventDefault();
      setTried(true);
      setTab("lyrics");
    } else if (invalid.length > 0) {
      e.preventDefault();
      setTried(true);
      setTab("chords");
    }
  }

  return (
    <form id="song-form" action={action} onSubmit={onSubmit} onKeyDown={onKeyDown}>
      {song && <input type="hidden" name="id" value={song.id} />}
      <input type="hidden" name="title" value={info.title} />
      <input type="hidden" name="artist" value={info.artist} />
      <input type="hidden" name="original_key" value={info.key} />
      <input type="hidden" name="tempo" value={info.tempo} />
      <input type="hidden" name="time_signature" value={info.timeSignature} />
      <input type="hidden" name="default_capo" value={info.capo} />
      <input type="hidden" name="ccli_number" value={info.ccli} />
      <input type="hidden" name="tags" value={info.tags} />
      <input type="hidden" name="body" value={body} />

      {tab === "lyrics" && (
        <LyricsTab
          info={info}
          onInfo={(patch) => setInfo((i) => ({ ...i, ...patch }))}
          sections={sections}
          selectedId={selected?.id ?? ""}
          onSelect={setSelectedId}
          onRename={(id, label) => update(id, (s) => ({ ...s, label }), `label-${id}`)}
          onWords={changeWords}
          onMove={move}
          onMoveTo={moveTo}
          onDuplicate={duplicate}
          onDelete={remove}
          onAdd={addPart}
          onPaste={pasteLyrics}
          labelFor={labelFor}
          titleMissing={tried && titleMissing}
          infoOpen={infoOpen}
          onInfoOpen={setInfoOpen}
        />
      )}
      {tab === "chords" && (
        <ChordsTab
          info={info}
          sections={sections}
          editing={editing}
          size={textSize}
          onPick={setEditing}
          onCommit={commitChord}
          onCancel={() => setEditing(null)}
          onMove={moveSection}
        />
      )}
      {tab === "preview" && <PreviewTab info={info} sections={sections} size={textSize} onMove={moveSection} />}

      <SidebarPortal>
        <nav aria-label="Song editor" className="-mx-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => {
                setTab(t.id);
                setEditing(null);
              }}
              className={`block w-full border-l-2 px-3 py-2 text-left text-sm ${
                tab === t.id ? "border-accent bg-hover font-medium" : "border-transparent text-muted hover:bg-hover hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="space-y-3">
          <button type="submit" form="song-form" disabled={pending} className="btn btn-primary w-full">
            {pending ? "Saving…" : "Save song"}
          </button>
          <div className="grid gap-2">
            <button type="button" className="btn w-full" onClick={undo} disabled={history.past.length === 0}>
              <UndoIcon /> Undo
            </button>
            <button type="button" className="btn w-full" onClick={redo} disabled={history.future.length === 0}>
              <RedoIcon /> Redo
            </button>
          </div>

          {tried && titleMissing && (
            <p role="alert" className="text-sm text-danger">
              Give the song a title before saving.
            </p>
          )}
          {invalid.length > 0 && (
            <p role="alert" className={`text-sm ${tried ? "text-danger" : "text-muted"}`}>
              {tried ? "Fix" : "Check"} {invalid.length === 1 ? "this chord" : "these chords"} so the song can be transposed:{" "}
              <span className="font-mono">{invalid.join(", ")}</span>.
              {tab !== "chords" && (
                <>
                  {" "}
                  <button type="button" className="underline" onClick={() => setTab("chords")}>
                    Show me
                  </button>
                </>
              )}
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
        </div>

        {(tab === "chords" || tab === "preview") && (
            <section>
              <h2 className="mb-2 text-sm font-medium">Text size</h2>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn" onClick={() => stepTextSize(-1)} aria-label="Smaller text">
                  A−
                </button>
                <button type="button" className="btn" onClick={() => stepTextSize(1)} aria-label="Larger text">
                  A+
                </button>
                <button
                  type="button"
                  className={`btn col-span-2 ${textSize === "fit" ? "btn-primary" : ""}`}
                  aria-pressed={textSize === "fit"}
                  onClick={() => setTextSize("fit")}
                >
                  Fit to screen
                </button>
              </div>
            </section>
        )}

        {(tab === "chords" || tab === "preview") && (
          <section>
            <h2 className="mb-2 text-sm font-medium">Layout</h2>
            <p className="mb-2 text-sm text-muted">Columns</p>
            <div className="grid grid-cols-4 gap-1" role="group" aria-label="Number of columns">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn px-0 ${columnCount === n ? "btn-primary" : ""}`}
                  aria-pressed={columnCount === n}
                  disabled={n > sections.length}
                  onClick={() => setColumnCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <button type="button" className="btn mt-2 w-full" onClick={() => setColumnCount(autoColumnCount(sections))}>
              Arrange automatically
            </button>
            <p className="mt-2 text-sm leading-relaxed text-muted">Drag a section by its name to move it.</p>
          </section>
        )}

        {tab === "chords" && (
          <>
            <section>
              <h2 className="mb-2 text-sm font-medium">My chords</h2>
              {shortcuts.length === 0 ? (
                <p className="text-sm text-muted">Save the chords you use most and tap them to place them.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {shortcuts.map((s) => (
                    <li key={s.id} className="group flex">
                      <button
                        type="button"
                        // Keep the chord box focused so the tap fills the spot being edited.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editing && setChord(editing, s.chord)}
                        disabled={!editing}
                        className="btn rounded-r-none px-2.5 py-1 font-mono font-semibold"
                      >
                        {s.chord}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeShortcut(s)}
                        aria-label={`Remove ${s.chord}`}
                        title="Remove"
                        className="btn btn-quiet rounded-l-none border-l-0 px-1.5 py-1 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {shortcuts.length > 0 && (
                <p className="mt-2 text-sm text-muted">{editing ? "Tap a chord to place it." : "Click a word first."}</p>
              )}
              <div className="mt-3 grid gap-2">
                <input
                  value={shortcutDraft}
                  onChange={(e) => setShortcutDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (shortcutDraft.trim()) addShortcut(shortcutDraft);
                    }
                  }}
                  placeholder="Add a chord"
                  aria-label="Add a chord to My chords"
                  autoComplete="off"
                  spellCheck={false}
                  className="field field-sm min-w-0 font-mono"
                />
                <button type="button" className="btn" disabled={working || !shortcutDraft.trim()} onClick={() => addShortcut(shortcutDraft)}>
                  Add
                </button>
              </div>
              {shortcutError && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {shortcutError}
                </p>
              )}
              {used.some((c) => isValidChord(c) && !shortcuts.some((s) => s.chord === c)) && (
                <button type="button" className="mt-3 text-sm text-muted underline hover:text-foreground" onClick={addUsedChords} disabled={working}>
                  Add the chords from this song
                </button>
              )}
            </section>

            <p className="text-sm leading-relaxed text-muted">
              Click a word, type the chord and press Enter. Leave it empty to remove one.
            </p>
          </>
        )}
      </SidebarPortal>
    </form>
  );
}
