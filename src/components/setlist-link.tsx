"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LinkedSetlist } from "@/lib/schedule-data";
import type { Target } from "./schedule-bits";
import { useScheduleApi } from "./schedule-store";

export type SetlistChoice = { id: string; name: string; service_date: string | null };

/**
 * The setlist linked to a Sunday or event on the schedule. A service has one setlist: link one, and linking another
 * replaces it. Anyone can link or unlink; the change is shown at once, saved in the background and written to the
 * change log. A Sunday that isn't on the schedule yet is made when a setlist is linked to it.
 */
export function SetlistLinks({
  target,
  date,
  linked,
  choices,
  narrow = false,
}: {
  target: Target;
  date: string;
  linked: LinkedSetlist[];
  choices: SetlistChoice[];
  /** Fits a narrow table cell. */
  narrow?: boolean;
}) {
  const api = useScheduleApi();
  const [choosing, setChoosing] = useState(false);
  const current = linked[0];

  // Setlists for this very date first, then the nearest others; the one already here is left out.
  const { same, others } = useMemo(() => {
    const free = choices.filter((c) => c.id !== current?.id);
    const gap = (c: SetlistChoice) => (c.service_date ? Math.abs(Date.parse(c.service_date) - Date.parse(date)) : Infinity);
    return { same: free.filter((c) => c.service_date === date), others: free.filter((c) => c.service_date !== date).sort((a, b) => gap(a) - gap(b) || a.name.localeCompare(b.name)).slice(0, 40) };
  }, [choices, current?.id, date]);

  function pick(id: string) {
    const setlist = choices.find((c) => c.id === id);
    setChoosing(false);
    if (setlist) api.linkSetlist(setlist, target);
  }

  const option = (c: SetlistChoice) => (
    <option key={c.id} value={c.id}>
      {c.name}
      {c.service_date && c.service_date !== date ? ` (${c.service_date})` : ""}
    </option>
  );

  if (choosing) {
    return (
      <select value="" autoFocus onChange={(e) => pick(e.target.value)} onBlur={() => setChoosing(false)} className={`field field-sm max-w-full ${narrow ? "w-full" : "w-44"}`} aria-label="Choose a setlist to link">
        <option value="">{same.length + others.length === 0 ? "No setlists to link" : "Choose a setlist…"}</option>
        {same.length > 0 && <optgroup label="On this date">{same.map(option)}</optgroup>}
        {others.length > 0 && <optgroup label={same.length > 0 ? "Other setlists" : "Setlists"}>{others.map(option)}</optgroup>}
      </select>
    );
  }

  if (!current) {
    return (
      <button type="button" onClick={() => setChoosing(true)} className="inline-flex h-6 items-center rounded-full border border-dashed border-line px-2 text-xs text-muted hover:border-foreground hover:text-foreground">
        {narrow ? "♪ Link" : "♪ Link a setlist"}
      </button>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-hover py-0.5 pl-2 pr-1 text-xs">
      <span aria-hidden>♪</span>
      <Link href={`/setlists/${current.id}`} className="min-w-0 truncate font-medium underline-offset-2 hover:underline" title={`${current.name}: open the setlist`}>
        {current.name}
      </Link>
      <button type="button" onClick={() => setChoosing(true)} aria-label={`Choose a different setlist instead of ${current.name}`} title="Choose a different setlist" className="flex h-4 flex-none items-center justify-center rounded-full px-1 text-muted hover:bg-line hover:text-foreground">
        ⇄
      </button>
      <button type="button" onClick={() => api.unlinkSetlist(current.id)} aria-label={`Unlink ${current.name}`} className="flex h-4 w-4 flex-none items-center justify-center rounded-full text-muted hover:bg-line hover:text-foreground">
        ×
      </button>
    </span>
  );
}
