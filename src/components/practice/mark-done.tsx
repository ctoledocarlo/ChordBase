"use client";

import { useProgress } from "./progress";

/** "Mark as done" at the end of a lesson. Remembered on this device. */
export function MarkDone({ slug }: { slug: string }) {
  const { done, set } = useProgress();
  const isDone = done.has(slug);
  return (
    <button
      data-tour="practice-done"
      type="button"
      aria-pressed={isDone}
      onClick={() => set(slug, !isDone)}
      className={`btn px-4 py-2 ${isDone ? "" : "btn-primary"}`}
    >
      {isDone ? "✓ Done (tap to undo)" : "Mark as done"}
    </button>
  );
}
