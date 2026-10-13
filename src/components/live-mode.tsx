"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CloseIcon } from "./icons";

/**
 * Live mode: the song takes the whole screen. Asks the browser for full screen too;
 * Escape (or leaving full screen another way) ends it.
 */
export function useLiveMode(): [boolean, (live: boolean) => void] {
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const onFullscreen = () => {
      if (!document.fullscreenElement) setLive(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLive(false);
    };
    document.addEventListener("keydown", onKey);
    document.documentElement
      .requestFullscreen?.()
      .then(() => {
        if (cancelled) return;
        document.addEventListener("fullscreenchange", onFullscreen);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [live]);

  return [live, setLive];
}

/**
 * Wraps the song. It is the same element in both modes, so going live doesn't reload
 * anything. While live it covers the navbar and sidebar and shows an Exit button top right.
 */
export function LiveFrame({
  live,
  onExit,
  liveClassName = "",
  children,
}: {
  live: boolean;
  onExit: () => void;
  /** Extra classes while live (for instance, room for the Exit button). */
  liveClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={live ? `fixed inset-0 z-50 bg-background p-6 ${liveClassName}` : undefined}>
      {live && (
        <button type="button" onClick={onExit} className="btn fixed right-4 top-4 z-10" aria-label="Exit live mode">
          <CloseIcon /> Exit
        </button>
      )}
      {children}
    </div>
  );
}
