"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** From and To boxes for finding setlists by when they are. Changing either reloads the list. */
export function SetlistDateRange({ q, from, to }: { q: string; from: string; to: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function go(next: { from?: string; to?: string }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const f = next.from ?? from;
    const t = next.to ?? to;
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `/setlists?${qs}` : "/setlists"));
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-muted">From</span>
        <input type="date" value={from} max={to || undefined} onChange={(e) => go({ from: e.target.value })} className="field field-sm w-auto" />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted">To</span>
        <input type="date" value={to} min={from || undefined} onChange={(e) => go({ to: e.target.value })} className="field field-sm w-auto" />
      </label>
      {(from || to) && (
        <button type="button" onClick={() => go({ from: "", to: "" })} className="text-muted underline hover:text-foreground">
          Clear dates
        </button>
      )}
    </div>
  );
}
