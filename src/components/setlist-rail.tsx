"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { SetlistItem } from "@/lib/setlists";
import type { SongSummary } from "@/lib/songs";
import { GripIcon, PlayIcon, PlusIcon, TrashIcon } from "./icons";
import { deriveSong } from "./song-settings";
import { ROLES, type ScreenRole } from "./use-screen-role";
import type { SyncStatus } from "./use-setlist-sync";

const MAX_RESULTS = 6;

/**
 * The right-hand side of a setlist: what is on stage and what is next, the whole list in order,
 * and (on a Media screen) a box to add songs without leaving the page, so it works mid-service.
 * Stage and Viewer screens get the same list without any controls.
 */
export function SetlistRail({
  role,
  items,
  currentId,
  activeId,
  library,
  busy,
  error,
  onSelect,
  onSendToStage,
  onBackToStage,
  onPrev,
  onNext,
  onAdd,
  onReorder,
  onRemove,
  live,
  onGoLive,
  status,
  roles,
  highlightIds,
  keyControl,
  chat,
}: {
  role: ScreenRole;
  items: SetlistItem[];
  /** The song this screen is looking at. On a Media screen that can differ from the one on stage. */
  currentId: string | null;
  /** The song on stage. */
  activeId: string | null;
  library: SongSummary[];
  busy: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onSendToStage: (id: string) => void;
  /** Stage screens: go back to the song Media put on stage. */
  onBackToStage: () => void;
  /** Media: move the song on stage back or forward one. Stage: move this screen's song. */
  onPrev: () => void;
  onNext: () => void;
  onAdd: (songId: string, where: "end" | "next") => void;
  /** Move a song so it ends up at `toIndex` in the list. */
  onReorder: (id: string, toIndex: number) => void;
  onRemove: (id: string) => void;
  live: boolean;
  onGoLive: () => void;
  status: SyncStatus;
  roles: Partial<Record<ScreenRole, number>>;
  highlightIds: ReadonlySet<string>;
  /** Shown under the status line (live mode puts the key picker here). */
  keyControl?: ReactNode;
  /** The session chat, shown under the list. */
  chat?: ReactNode;
}) {
  const media = role === "media";
  // Stage screens choose what they are looking at themselves; Viewer screens only watch.
  const browse = role !== "viewer";
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

  const stageIndex = items.findIndex((i) => i.id === activeId);
  const onStage = stageIndex >= 0 ? items[stageIndex] : undefined;
  // Up next follows the song on stage for Media, and the song this Stage screen is looking at for Stage.
  const viewIndex = items.findIndex((i) => i.id === currentId);
  const anchor = media || viewIndex < 0 ? stageIndex : viewIndex;
  const next = anchor >= 0 ? items[anchor + 1] : undefined;
  const awayFromStage = role === "stage" && currentId !== null && currentId !== activeId;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return library
      .filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [query, library]);

  const total = ROLES.reduce((n, r) => n + (roles[r.value] ?? 0), 0);
  const who = ROLES.filter((r) => (roles[r.value] ?? 0) > 0).map((r) => `${roles[r.value]} ${r.label}`);

  return (
    <aside aria-label="Setlist" className="flex h-full min-h-0 flex-col border-line lg:border-l lg:pl-4">
      <p
        role="status"
        className="mb-2 flex flex-none items-center gap-2 text-xs text-muted"
        title="Changes made on other screens showing this setlist appear here as they happen"
      >
        <span
          aria-hidden
          className={`h-2 w-2 flex-none rounded-full ${status === "live" ? "bg-[#16a34a]" : status === "offline" ? "bg-[#d97706]" : "bg-line"}`}
        />
        <span className="min-w-0 truncate">
          {status === "live"
            ? total > 1
              ? `Live · ${who.join(" · ")}`
              : "Live"
            : status === "offline"
              ? "Reconnecting…"
              : "Connecting…"}
        </span>
      </p>

      {keyControl}

      {media && (
        <div className="flex-none border-b border-line pb-2">
          {!live && (
            <button type="button" className="btn btn-primary mb-2 w-full py-1" onClick={onGoLive} disabled={items.length === 0}>
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
                    <button type="button" className="btn" disabled={busy} onClick={() => onAdd(s.id, "next")} title="Play right after the song on stage">
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
      )}

      <div className="flex-none space-y-1 border-b border-line py-2 text-sm">
        <p className="flex items-baseline gap-2">
          <span className="w-14 flex-none text-[0.6875rem] font-medium uppercase tracking-wide text-muted">On stage</span>
          {onStage ? (
            <span className="min-w-0 flex-1 truncate font-medium">{onStage.song.title}</span>
          ) : (
            <span className="text-muted">{items.length === 0 ? "Nothing in the setlist yet" : "Nothing chosen yet"}</span>
          )}
        </p>
        <p className="flex items-baseline gap-2">
          <span className="w-14 flex-none text-[0.6875rem] font-medium uppercase tracking-wide text-muted">Up next</span>
          {next ? (
            <>
              <span className="min-w-0 flex-1 truncate">{next.song.title}</span>
              <span className="flex-none font-mono text-xs text-muted">{deriveSong(next.song.original_key, next.settings).soundingKey || next.song.original_key}</span>
            </>
          ) : (
            <span className="text-muted">{items.length === 0 ? "—" : "That's the last song"}</span>
          )}
        </p>

        {awayFromStage && (
          <button type="button" className="btn mt-1 w-full px-2 py-1 text-[0.8125rem]" onClick={onBackToStage}>
            Back to the song on stage
          </button>
        )}

        {browse && (
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              className="btn px-2 py-1 text-[0.8125rem]"
              onClick={onPrev}
              disabled={anchor <= 0}
              title={media ? "Show the previous song on stage" : "Look at the previous song"}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-primary px-2 py-1 text-[0.8125rem]"
              onClick={onNext}
              disabled={items.length === 0 || (anchor >= 0 && !next)}
              title={media ? "Show the next song on stage" : "Look at the next song"}
            >
              Next song
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-[3] overflow-y-auto py-2">
        <p className="mb-1 flex items-center justify-between gap-2 text-[0.6875rem] font-medium uppercase tracking-wide text-muted">
          <span>
            Setlist · {items.length} {items.length === 1 ? "song" : "songs"}
          </span>
          {media && items.length > 1 && (
            <span className="flex items-center gap-1 font-normal normal-case tracking-normal">
              <GripIcon /> drag to reorder
            </span>
          )}
        </p>
        <ol onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGap(null); }}>
          {items.map((item, i) => {
            const looking = item.id === currentId;
            const stage = item.id === activeId;
            const label = (
              <>
                <span className="w-5 flex-none text-right text-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{item.song.title}</span>
                {stage && <span className="flex-none text-xs font-medium text-accent">On stage</span>}
                {item.body_override !== null && (
                  <span className="flex-none text-xs text-muted" title="This setlist has its own chords for this song">
                    edited
                  </span>
                )}
                <span className="flex-none font-mono text-xs text-muted">
                  {deriveSong(item.song.original_key, item.settings).soundingKey || item.song.original_key}
                </span>
              </>
            );
            const rowClass = `flex min-w-0 flex-1 items-baseline gap-2 border-l-2 px-2 py-1 text-left text-[0.8125rem] ${
              (browse ? looking : stage) ? "border-accent bg-hover font-medium" : "border-transparent"
            } ${highlightIds.has(item.id) ? "anim-flash" : ""}`;

            if (!media) {
              return (
                <li key={item.id} className="flex items-center">
                  {browse ? (
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      aria-current={looking ? "true" : undefined}
                      className={`${rowClass} ${looking ? "" : "hover:bg-hover"}`}
                    >
                      {label}
                    </button>
                  ) : (
                    <div aria-current={stage ? "true" : undefined} className={rowClass}>
                      {label}
                    </div>
                  )}
                </li>
              );
            }
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
                  aria-current={looking ? "true" : undefined}
                  className={`${rowClass} ${looking ? "" : "hover:bg-hover"}`}
                >
                  {label}
                </button>
                <span className="ml-1 flex flex-none gap-1">
                  <button
                    type="button"
                    className="btn btn-icon"
                    disabled={stage}
                    onClick={() => onSendToStage(item.id)}
                    aria-label={`Show ${item.song.title} on stage`}
                    title="Show on stage"
                  >
                    <PlayIcon />
                  </button>
                  <button type="button" className="btn btn-icon border-[#dc2626] text-[#dc2626] hover:!bg-[#dc2626] hover:!text-white" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.song.title}`} title="Remove">
                    <TrashIcon />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {chat}
    </aside>
  );
}
