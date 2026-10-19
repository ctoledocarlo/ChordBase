"use client";

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
}: {
  role: ScreenRole;
  onChange: (role: ScreenRole) => void;
  night: boolean;
  onNight: (on: boolean) => void;
  autoHide: boolean;
  onAutoHide: (on: boolean) => void;
  /** Fade out while the screen is idle; any touch or movement brings it back. */
  faded?: boolean;
}) {
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  return (
    <div
      data-no-autohide
      data-corner-menu
      className={`fixed right-4 top-4 z-[55] flex items-center gap-2 transition-opacity duration-500 ${faded ? "pointer-events-none opacity-0" : ""}`}
    >
      <RoleSelect role={role} onChange={onChange} className="!w-auto" />
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
