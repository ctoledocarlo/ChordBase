"use client";

import { useSyncExternalStore } from "react";

/**
 * What a screen is for. Stage is the band's screen: the song full screen, with key, capo and text
 * size in reach. Media runs the setlist (add, remove, reorder, edit chords, choose the song on
 * stage). Viewer only watches.
 */
export type ScreenRole = "stage" | "media" | "viewer";

export const ROLES: { value: ScreenRole; label: string; hint: string }[] = [
  { value: "media", label: "Media", hint: "Runs the setlist and chooses the song on stage" },
  { value: "stage", label: "Stage", hint: "The band's screen: song full screen, key and size in reach" },
  { value: "viewer", label: "Viewer", hint: "Only watches what is on stage" },
];

const KEY = "chordbase.screenRole";
const listeners = new Set<() => void>();

function read(): ScreenRole {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "stage" || stored === "viewer" || stored === "media") return stored;
  } catch {
    // Storage unavailable; this screen is a Media screen, which can do everything.
  }
  return "media";
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The role this device chose, remembered on the device. Null until the page has loaded in the browser. */
export function useScreenRole(): [ScreenRole | null, (role: ScreenRole) => void] {
  const role = useSyncExternalStore<ScreenRole | null>(subscribe, read, () => null);
  return [
    role,
    (next) => {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Storage unavailable; the choice just won't be remembered.
      }
      listeners.forEach((l) => l());
    },
  ];
}
