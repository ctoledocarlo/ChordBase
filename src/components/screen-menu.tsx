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
export function CornerMenu({ role, onChange }: { role: ScreenRole; onChange: (role: ScreenRole) => void }) {
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  return (
    <div className="fixed right-4 top-4 z-[55] flex items-center gap-2">
      <RoleSelect role={role} onChange={onChange} className="!w-auto" />
      <button type="button" className="btn" onClick={toggleFullscreen}>
        Full screen
      </button>
    </div>
  );
}
