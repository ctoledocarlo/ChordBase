"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const KEY = "chordbase.practice.done";
const CHANGED = "chordbase:practice-progress";

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}

// The stored text itself is the snapshot (a string stays equal to itself, so React isn't told about a change that isn't one).
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

/** Which lessons have been ticked off, remembered on this device. */
export function useProgress() {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const done = useMemo(() => {
    try {
      const list: unknown = JSON.parse(raw || "[]");
      return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set<string>();
    }
  }, [raw]);

  const set = useCallback(
    (slug: string, value: boolean) => {
      const next = new Set(done);
      if (value) next.add(slug);
      else next.delete(slug);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered, but the change below still shows for now.
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [done],
  );

  return { done, set };
}
