"use client";

import type { SetlistView } from "@/lib/setlist-team";
import { ROLES, type ScreenRole } from "./use-screen-role";

/** Choose what this screen is: Stage, Media or Viewer. */
export function RoleSelect({
  role,
  onChange,
  className = "",
}: {
  role: ScreenRole;
  onChange: (role: ScreenRole) => void;
  className?: string;
}) {
  return (
    <select
      aria-label="What this screen is"
      value={role}
      onChange={(e) => onChange(e.target.value as ScreenRole)}
      className={`field field-sm ${className}`}
    >
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

/** Stage and Viewer screens have no navbar or sidebar, so this small menu in the corner is how to change the role or go full screen. */
export function CornerMenu({
  role,
  onChange,
  night,
  onNight,
  autoHide,
  onAutoHide,
  faded = false,
  views = [],
  viewId,
  onView,
  checklist = null,
  showNotes = true,
  onShowNotes,
}: {
  role: ScreenRole;
  onChange: (role: ScreenRole) => void;
  night: boolean;
  onNight: (on: boolean) => void;
  autoHide: boolean;
  onAutoHide: (on: boolean) => void;
  /** Fade out while the screen is idle; any touch or movement brings it back. */
  faded?: boolean;
  /** The instrument views of this setlist: a screen picks the part it plays, to see that part's notes. */
  views?: SetlistView[];
  viewId?: string;
  onView?: (id: string) => void;
  /** The checklist button, when this screen has items to tick: how many are still open. */
  checklist?: { left: number; onOpen: () => void } | null;
  showNotes?: boolean;
  onShowNotes?: (on: boolean) => void;
}) {
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  return (
    <div
      data-no-autohide
      data-corner-menu
      className={`fixed right-4 top-4 z-[55] flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-2 transition-opacity duration-500 ${faded ? "pointer-events-none opacity-0" : ""}`}
    >
      <RoleSelect role={role} onChange={onChange} className="!w-auto" />
      {views.length > 1 && onView && (
        <select
          data-tour="stage-part"
          aria-label="Which part this screen is for"
          title="Which part this screen is for: you see that part's notes"
          value={viewId ?? ""}
          onChange={(e) => onView(e.target.value)}
          className="field field-sm !w-auto"
        >
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.kind === "all" ? "All parts" : v.name}
            </option>
          ))}
        </select>
      )}
      {checklist && (
        <button type="button" className="btn" onClick={checklist.onOpen}>
          Checklist{checklist.left > 0 ? ` (${checklist.left})` : " ✓"}
        </button>
      )}
      <button type="button" className="btn" onClick={toggleFullscreen}>
        Full screen
      </button>
      <details className="group relative">
        <summary className="btn cursor-pointer list-none">Display</summary>
        <div className="absolute right-0 top-full mt-1.5 w-60 space-y-2.5 rounded-xl border border-line bg-background p-3 text-sm shadow-xl">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={night} onChange={(e) => onNight(e.target.checked)} />
            <span>
              Night screen
              <span className="block text-xs text-muted">Black background, brighter text and chords, for a dark stage.</span>
            </span>
          </label>
          {onShowNotes && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={showNotes} onChange={(e) => onShowNotes(e.target.checked)} />
              <span>
                Show notes
                <span className="block text-xs text-muted">The band&apos;s notes for each song, above the words.</span>
              </span>
            </label>
          )}
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={autoHide} onChange={(e) => onAutoHide(e.target.checked)} />
            <span>
              Hide controls when idle
              <span className="block text-xs text-muted">The song fills the screen. Touch or move to bring them back.</span>
            </span>
          </label>
        </div>
      </details>
    </div>
  );
}
