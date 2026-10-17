import { useSyncExternalStore } from "react";

export const SIDEBAR_DEFAULT = 288; // 18rem, the same as the largest
export const SIDEBAR_MIN = 112; // 7rem
export const SIDEBAR_MAX = 288; // 18rem

const KEY = "sidebar-width";
const listeners = new Set<() => void>();

export const clampSidebar = (px: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)));

function read(): number {
  try {
    const stored = Number(localStorage.getItem(KEY));
    return stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX ? stored : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

/** Remembers the width on this device. */
export function saveSidebarWidth(px: number) {
  try {
    localStorage.setItem(KEY, String(clampSidebar(px)));
  } catch {
    // Storage unavailable; the width just won't be remembered.
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The saved sidebar width in pixels (the default on the server and when nothing is saved). */
export function useSidebarWidth(): number {
  return useSyncExternalStore(subscribe, read, () => SIDEBAR_DEFAULT);
}
