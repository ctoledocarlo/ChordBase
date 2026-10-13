"use client";

import { useMemo, useState } from "react";
import type { SetlistItem } from "@/lib/setlists";
import type { SongSummary } from "@/lib/songs";
import { GripIcon, PlusIcon, TrashIcon } from "./icons";
import { deriveSong } from "./song-settings";

const MAX_RESULTS = 6;

/**
 * The right-hand side of a setlist: what is next, the whole list in order, and a box to
 * add songs without leaving the page (so it works in the middle of a service).
 */
export function SetlistRail({
  items,
  currentId,
  library,
  busy,
  error,
  onSelect,
  onPrev,
  onNext,
  onAdd,
  onReorder,
  onRemove,
  live,
  onGoLive,
}: {
  items: SetlistItem[];
  currentId: string | null;
  library: SongSummary[];
  busy: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onAdd: (songId: string, where: "end" | "next") => void;
  /** Move a song so it ends up at `toIndex` in the list. */
  onReorder: (id: string, toIndex: number) => void;
  onRemove: (id: string) => void;
  live: boolean;
  onGoLive: () => void;
}) {
  const [query, setQuery] = useState("");
  // Drag and drop: the song being dragged, and the gap it would drop into (0 = top, items.length = bottom).
  const [dragId, setDragId] = useState<string | null>(null);
  const [gap, setGap] = useState<number | null>(null);
  const endDrag = () => {
    setDragId(null);
    setGap(null);
  };
  function drop() {
    const from = items.findIndex((i) => i.id === dragId);
    if (dragId && gap !== null && from >= 0) {
      const to = gap > from ? gap - 1 : gap;
      if (to !== from) onReorder(dragId, to);
    }
    endDrag();
  }
  const index = items.findIndex((i) => i.id === currentId);
  const next = index >= 0 ? items[index + 1] : undefined;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return library
      .filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [query, library]);

  return (
    <aside aria-label="Setlist" className="flex h-full min-h-0 flex-col border-line lg:border-l lg:pl-4">
      <div className="flex-none border-b border-line pb-3">
        {!live && (
          <button type="button" className="btn btn-primary mb-3 w-full" onClick={onGoLive} disabled={items.length === 0}>
            Go live
          </button>
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a song…"
          aria-label="Search songs to add"
          className="field field-sm"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        {query.trim() && results.length === 0 && <p className="mt-2 text-sm text-muted">No songs match that.</p>}
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {results.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.title}</span>
                  {s.artist && <span className="block truncate text-xs text-muted">{s.artist}</span>}
                </span>
                {items.length > 0 && (
                  <button type="button" className="btn" disabled={busy} onClick={() => onAdd(s.id, "next")} title="Play right after the current song">
                    Next
                  </button>
                )}
                <button type="button" className="btn" disabled={busy} onClick={() => onAdd(s.id, "end")} title="Add to the end of the setlist">
                  <PlusIcon /> Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-none border-b border-line py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Up next</p>
        {next ? (
          <button
            type="button"
            onClick={() => onSelect(next.id)}
            className="mt-1 block w-full rounded-md border border-line p-2.5 text-left hover:bg-hover"
          >
            <span className="block truncate font-medium">{next.song.title}</span>
            <span className="block truncate font-mono text-sm text-muted">{deriveSong(next.song.original_key, next.settings).keyLabel}</span>
          </button>
        ) : (
          <p className="mt-1 text-sm text-muted">{items.length === 0 ? "Nothing in the setlist yet." : "That's the last song."}</p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className="btn" onClick={onPrev} disabled={index <= 0}>
            Previous
          </button>
          <button type="button" className="btn btn-primary" onClick={onNext} disabled={index < 0 || !next}>
            Next song
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
          Setlist · {items.length} {items.length === 1 ? "song" : "songs"}
        </p>
        <ol onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGap(null); }}>
          {items.map((item, i) => {
            const active = item.id === currentId;
            return (
              <li
                key={item.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", item.id);
                  setDragId(item.id);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  const box = e.currentTarget.getBoundingClientRect();
                  setGap(e.clientY < box.top + box.height / 2 ? i : i + 1);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop();
                }}
                onDragEnd={endDrag}
                className={`group flex items-center ${dragId === item.id ? "opacity-40" : ""} ${
                  gap === i ? "shadow-[0_-2px_0_0_var(--accent)]" : gap === i + 1 && i === items.length - 1 ? "shadow-[0_2px_0_0_var(--accent)]" : ""
                }`}
              >
                <span
                  aria-hidden
                  title="Drag to reorder"
                  className="flex flex-none cursor-grab touch-none items-center self-stretch px-1 text-muted hover:text-foreground active:cursor-grabbing"
                >
                  <GripIcon />
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex min-w-0 flex-1 items-baseline gap-2 border-l-2 px-2 py-1.5 text-left text-sm ${
                    active ? "border-accent bg-hover font-medium" : "border-transparent hover:bg-hover"
                  }`}
                >
                  <span className="w-5 flex-none text-right text-muted tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{item.song.title}</span>
                  <span className="flex-none font-mono text-xs text-muted">
                    {deriveSong(item.song.original_key, item.settings).soundingKey || item.song.original_key}
                  </span>
                </button>
                <span className="ml-1 flex flex-none">
                  <button type="button" className="btn btn-icon border-[#dc2626] text-[#dc2626] hover:!bg-[#dc2626] hover:!text-white" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.song.title}`} title="Remove">
                    <TrashIcon />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

    </aside>
  );
}
