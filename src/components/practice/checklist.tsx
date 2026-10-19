"use client";

import { useState, useSyncExternalStore } from "react";
import { Panel } from "./ui";

const KEY = "chordbase.practice.today";
const CHANGED = "chordbase:practice-today";

const ITEMS = [
  { id: "warmup", label: "Warm up: five-finger position, each hand, slowly", minutes: 2 },
  { id: "scale", label: "One scale, hands separate, then together", minutes: 3 },
  { id: "chords", label: "Three chords for this week, with smooth inversions", minutes: 3 },
  { id: "song", label: "A song's chords, slowly, start to finish", minutes: 2 },
];

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

const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Today's four practice steps, ticked off on this device. It starts fresh each day. */
export function PracticeChecklist() {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const [today] = useState(dayKey);

  let done: string[] = [];
  try {
    const saved = JSON.parse(raw || "null") as { day?: string; done?: string[] } | null;
    if (saved?.day === today && Array.isArray(saved.done)) done = saved.done;
  } catch {
    // Unreadable: start the day fresh.
  }

  function toggle(id: string, on: boolean) {
    const next = on ? [...new Set([...done, id])] : done.filter((x) => x !== id);
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: today, done: next }));
    } catch {
      // Not remembered.
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  const minutes = ITEMS.filter((i) => done.includes(i.id)).reduce((n, i) => n + i.minutes, 0);

  return (
    <Panel>
      <ul className="space-y-2">
        {ITEMS.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={done.includes(item.id)} onChange={(e) => toggle(item.id, e.target.checked)} />
              <span className={done.includes(item.id) ? "text-muted line-through" : ""}>
                {item.label} <span className="text-muted">({item.minutes} min)</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted" aria-live="polite">
        {done.length === ITEMS.length ? "All done for today. Well played!" : `${done.length} of ${ITEMS.length} done today${minutes ? ` · ${minutes} minutes` : ""}.`}
      </p>
    </Panel>
  );
}
