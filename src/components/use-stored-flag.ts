"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANGED = "chordbase:flag";

/**
 * A yes/no choice remembered on this device (not on the account), shared by everything that asks for the same key.
 * `fallback` is what the server and a first visit use; `clientFallback` can pick a better first answer in the
 * browser (for instance by screen height) once the page is there.
 */
export function useStoredFlag(key: string, fallback: boolean, clientFallback?: () => boolean): [boolean, (value: boolean) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) onChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(CHANGED, onChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(CHANGED, onChange);
      };
    },
    [key],
  );

  const read = useCallback(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch {
      // Storage unavailable; use the first-visit answer.
    }
    return clientFallback ? clientFallback() : fallback;
  }, [key, fallback, clientFallback]);

  const value = useSyncExternalStore(subscribe, read, () => fallback);

  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Not remembered, but still applied for now by the event below.
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [key],
  );

  return [value, set];
}
