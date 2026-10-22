"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { transitionDisplay } from "@/lib/setlist-transition";
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
  onSearch,
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
  reference,
  clock,
  sungBy,
}: {
  role: ScreenRole;
  items: SetlistItem[];
  /** The song this screen is looking at. On a Media screen that can differ from the one on stage. */
  currentId: string | null;
  /** The song on stage. */
  activeId: string | null;
  /** Finds songs by title, artist or words for the "Add a song" box. */
  onSearch: (query: string) => Promise<SongSummary[]>;
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
  /** A quick reference shown between what is on stage and the list (the chords in the key). */
  reference?: ReactNode;
  /** The service clock, shown at the top. */
  clock?: ReactNode;
  /** Who sings the song on stage. */
  sungBy?: string;
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
  // How the song being looked at leads into the next one.
  const anchorItem = anchor >= 0 ? items[anchor] : undefined;
  const bridge = useMemo(() => (anchorItem && next ? transitionDisplay(anchorItem, next) : null), [anchorItem, next]);
  // The key each song is set to, worked out once per change to the setlist rather than on every redraw.
  const keys = useMemo(
    () => new Map(items.map((i) => [i.id, deriveSong(i.song.original_key, i.settings).soundingKey || i.song.original_key])),
    [items],
  );
  const awayFromStage = role === "stage" && currentId !== null && currentId !== activeId;

  // Songs found for what was typed. Asks the server a moment after typing stops.
  const [found, setFound] = useState<SongSummary[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let stale = false;
    const timer = setTimeout(() => {
      void onSearch(q).then((songs) => {
        if (!stale) setFound(songs);
      });
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, onSearch]);
  const results = query.trim().length < 2 ? [] : found.slice(0, MAX_RESULTS);

  const total = ROLES.reduce((n, r) => n + (roles[r.value] ?? 0), 0);
  const who = ROLES.filter((r) => (roles[r.value] ?? 0) > 0).map((r) => `${roles[r.value]} ${r.label}`);

  return (
    <aside aria-label="Setlist" data-tour="setlist-rail" data-no-autohide className="flex h-full min-h-0 flex-col overflow-y-auto border-line lg:border-l lg:pl-4">
      <div className="mb-1.5 flex flex-none items-center gap-2">
        <p
          role="status"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted"
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
        {clock && <div className="flex-none">{clock}</div>}
        {media && !live && (
          <button data-tour="setlist-golive" type="button" className="btn btn-primary flex-none px-2.5 py-0.5 text-[0.8125rem]" onClick={onGoLive} disabled={items.length === 0}>
            Go live
          </button>
        )}
      </div>

      {keyControl}

      {media && (
        <div data-tour="setlist-add" className="flex-none border-b border-line pb-1.5">
          <input
            type="search"
            data-search=""
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add a song (title or lyrics)…"
            aria-label="Search songs to add"
            className="field field-sm py-1"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          {query.trim().length >= 2 && results.length === 0 && <p className="mt-2 text-sm text-muted">No songs match that.</p>}
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {results.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.title}</span>
                    {s.artist && <span className="block truncate text-xs text-muted">{s.artist}</span>}
                    {s.snippet && <span className="block truncate text-xs italic text-muted">“{s.snippet}”</span>}
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

      <div data-tour="setlist-onstage" className="flex-none space-y-0.5 border-b border-line py-1.5 text-[0.8125rem]">
        <p className="flex items-baseline gap-2">
          <span className="w-12 flex-none text-[0.625rem] font-medium uppercase tracking-wide text-muted">On stage</span>
          {onStage ? (
            <span className="min-w-0 flex-1 truncate font-medium">{onStage.song.title}</span>
          ) : (
            <span className="text-muted">{items.length === 0 ? "Nothing in the setlist yet" : "Nothing chosen yet"}</span>
          )}
        </p>
        {sungBy && (
          <p className="flex items-baseline gap-2">
            <span className="w-12 flex-none text-[0.625rem] font-medium uppercase tracking-wide text-muted">Sung by</span>
            <span className="min-w-0 flex-1 truncate">{sungBy}</span>
          </p>
        )}
        <p className="flex items-baseline gap-2">
          <span className="w-12 flex-none text-[0.625rem] font-medium uppercase tracking-wide text-muted">Up next</span>
          {next ? (
            <>
              <span className="min-w-0 flex-1 truncate">{next.song.title}</span>
              <span className="flex-none font-mono text-xs text-muted">{keys.get(next.id)}</span>
            </>
          ) : (
            <span className="text-muted">{items.length === 0 ? "—" : "That's the last song"}</span>
          )}
        </p>

        {bridge && (
          <p className="flex items-baseline gap-2">
            <span className="w-12 flex-none text-[0.625rem] font-medium uppercase tracking-wide text-muted" title="Chords to get from the end of this song into the next one">
              Bridge
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] font-semibold text-chord">{bridge}</span>
          </p>
        )}

        {awayFromStage && (
          <button type="button" className="btn mt-1 w-full px-2 py-0.5 text-xs" onClick={onBackToStage}>
            Back to the song on stage
          </button>
        )}

        {browse && (
          <div className="grid grid-cols-2 gap-1 pt-1">
            <button
              type="button"
              className="btn px-2 py-0.5 text-xs"
              onClick={onPrev}
              disabled={anchor <= 0}
              title={media ? "Show the previous song on stage" : "Look at the previous song"}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-primary px-2 py-0.5 text-xs"
              onClick={onNext}
              disabled={items.length === 0 || (anchor >= 0 && !next)}
              title={media ? "Show the next song on stage" : "Look at the next song"}
            >
              Next song
            </button>
          </div>
        )}
      </div>

      {reference}

      <div data-tour="setlist-list" className="min-h-[6.5rem] flex-[3] overflow-y-auto py-2">
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
        {media && (
          <p className="mb-1.5 text-xs text-muted">
            ▶ puts a song on stage <strong className="font-medium text-foreground">immediately</strong>, for every screen.
          </p>
        )}
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
                  {keys.get(item.id)}
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
                    aria-label={`Put ${item.song.title} on stage right now`}
                    title="Put on stage right now (no confirmation)"
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
