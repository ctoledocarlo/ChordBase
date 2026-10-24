"use client";

import { useMemo } from "react";
import { isoOf, relativeDay, dayText, type LogEntry } from "@/lib/schedule";
import { EmptyState } from "./empty-state";

const ICONS: Record<string, string> = {
  assigned: "＋",
  unassigned: "−",
  event_added: "◆",
  event_changed: "✎",
  event_removed: "✕",
  person_added: "＋",
  person_changed: "✎",
  person_removed: "✕",
  imported: "⇪",
};

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Who changed the schedule, and when, newest first and grouped by day. */
export function ChangeLog({ log, today }: { log: LogEntry[]; today: string }) {
  const days = useMemo(() => {
    const groups = new Map<string, LogEntry[]>();
    for (const entry of log) {
      const day = isoOf(new Date(entry.created_at));
      groups.set(day, [...(groups.get(day) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [log]);

  if (log.length === 0) {
    return (
      <EmptyState art="setlists" title="No changes yet">
        Every time someone is put on or taken off the schedule, or an event or person changes, it is written here.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      {days.map(([day, entries]) => (
        <section key={day} aria-label={dayText(day, today)}>
          <h3 className="mb-2 text-sm font-medium">
            {dayText(day, today)} <span className="font-normal text-muted">· {relativeDay(day, today)}</span>
          </h3>
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-hover text-xs text-muted">
                  {ICONS[e.action] ?? "•"}
                </span>
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{e.actor_name || "Someone"}</span> {e.summary}
                </p>
                <time dateTime={e.created_at} suppressHydrationWarning className="flex-none text-xs text-muted">
                  {time(e.created_at)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
