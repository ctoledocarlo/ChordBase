"use client";

import { useState, useSyncExternalStore } from "react";
import { TIMER_PRESETS, clockText, endsAtClock, endsInMinutes, timerText, timerView } from "@/lib/service-timer";

const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // One timer for every clock on the page.
  ticker ??= setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };
}

/** The current time in milliseconds, updated every second. It is 0 on the server, so nothing is drawn until the page is live. */
export function useNow(): number {
  const second = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 1000), () => 0);
  return second * 1000;
}

/**
 * The time of day and, when the person running the service has set one, a countdown to when the set should end.
 * The countdown turns amber in the last five minutes and red once it is past. With `canSet`, pressing it opens
 * the choices for setting or clearing the end time (that is shared with every screen).
 */
export function ServiceClock({
  endsAt,
  canSet = false,
  onSet,
  large = false,
}: {
  endsAt: string | null;
  canSet?: boolean;
  onSet?: (endsAt: string | null) => void;
  large?: boolean;
}) {
  const now = useNow();
  const [time, setTime] = useState("");
  if (now === 0) return <span className="invisible">00:00</span>;

  const view = timerView(endsAt, now);
  const tone = view.kind === "over" ? "text-danger" : view.kind === "running" && view.urgent ? "text-[#b45309] dark:text-[#fbbf24]" : "text-muted";
  const body = (
    <span className={`flex items-baseline gap-2 tabular-nums ${large ? "text-lg" : "text-xs"}`}>
      <span className="font-semibold text-foreground">{clockText(now)}</span>
      {view.kind !== "none" && <span className={`font-medium ${tone}`}>{timerText(view)}</span>}
    </span>
  );
  if (!canSet || !onSet) return body;

  return (
    <details data-tour="service-clock" className="group relative">
      <summary className="cursor-pointer list-none rounded-md px-1.5 py-0.5 hover:bg-hover" title="Set when the set should end">
        {body}
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1 w-64 space-y-3 rounded-xl border border-line bg-background p-3 text-sm shadow-xl">
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">The set ends in</p>
          <div className="flex flex-wrap gap-1.5">
            {TIMER_PRESETS.map((m) => (
              <button key={m} type="button" className="btn px-2.5 py-1 text-[0.8125rem]" onClick={() => onSet(endsInMinutes(m, Date.now()))}>
                {m} min
              </button>
            ))}
          </div>
        </div>
        <form
          className="flex items-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const end = endsAtClock(time, Date.now());
            if (end) onSet(end);
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Or ends at</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field field-sm" aria-label="End time" />
          </label>
          <button type="submit" className="btn" disabled={!endsAtClock(time, now)}>
            Set
          </button>
        </form>
        {view.kind !== "none" && (
          <button type="button" className="btn w-full" onClick={() => onSet(null)}>
            Clear the timer
          </button>
        )}
      </div>
    </details>
  );
}
