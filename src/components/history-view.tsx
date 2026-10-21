"use client";

import Link from "next/link";
import { useState } from "react";
import { ago, type Service } from "@/lib/history";
import { EmptyState } from "./empty-state";

type Row = { id: string; title: string; artist: string; count: number; last: string | null; recent?: number };

type Tab = "recent" | "used" | "quiet" | "all";

const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/**
 * What the library has been used for: the services in order, the songs used a lot lately, the songs that have
 * gone quiet, and a count for each song. Searching narrows the song lists.
 */
export function HistoryView({
  today,
  services,
  played,
  overused,
  neglected,
  neglectedTotal,
  neverPlayed,
  songCount,
}: {
  today: string;
  services: Service[];
  played: Row[];
  overused: Row[];
  neglected: Row[];
  neglectedTotal: number;
  neverPlayed: number;
  songCount: number;
}) {
  const [tab, setTab] = useState<Tab>("recent");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (r: { title: string; artist: string }) => q === "" || `${r.title} ${r.artist}`.toLowerCase().includes(q);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "recent", label: "Recent services", count: services.length },
    { id: "used", label: "Used a lot lately", count: overused.length },
    { id: "quiet", label: "Not played lately", count: neglectedTotal },
    { id: "all", label: "All played songs", count: played.length },
  ];

  const songList = (rows: Row[], empty: string, extra?: (r: Row) => string) => {
    const shown = rows.filter(match);
    if (shown.length === 0) return <EmptyState art="search" title={q ? "No song matches that" : empty} />;
    return (
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {shown.map((r) => (
          <li key={r.id}>
            <Link href={`/songs/${r.id}`} className="flex items-center gap-4 px-4 py-2.5 hover:bg-hover">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.title}</span>
                {r.artist && <span className="block truncate text-sm text-muted">{r.artist}</span>}
              </span>
              <span className="flex-none text-right text-sm text-muted">
                <span className="block">{r.last ? `Last ${ago(r.last, today)}` : "Never played"}</span>
                <span className="block text-xs">{extra ? extra(r) : `${r.count} ${r.count === 1 ? "time" : "times"}`}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Service history</h1>
      <p className="mt-1 text-sm text-muted">
        {songCount} songs in the library, {played.length} played in the last year, {neverPlayed} never played. A song is added here when it goes on stage in a setlist.
      </p>

      <div data-tour="history-tabs" role="tablist" aria-label="History views" className="mt-5 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`btn ${tab === t.id ? "btn-primary" : ""}`}>
            {t.label} <span className="opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {tab !== "recent" && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a song in this list"
          aria-label="Find a song in this list"
          className="field mt-4"
          autoComplete="off"
        />
      )}

      {tab === "recent" &&
        (services.length === 0 ? (
          <EmptyState art="setlists" title="No services yet">
            When you put a song on stage in a setlist, it is written here. You can also add a whole setlist from its sidebar.
          </EmptyState>
        ) : (
          <ol className="mt-4 space-y-3">
            {services.map((s) => (
              <li key={s.date} className="rounded-xl border border-line p-4">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-medium">{formatDay(s.date)}</span>
                  {s.setlist_name && <span className="text-sm text-muted">{s.setlist_name}</span>}
                  <span className="text-xs text-muted">{ago(s.date, today)}</span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-sm">
                  {s.songs.map((song, i) => (
                    <li key={song.id}>
                      <Link href={`/songs/${song.id}`} className="rounded-md px-1.5 py-0.5 hover:bg-hover hover:underline">
                        {song.title}
                      </Link>
                      {i < s.songs.length - 1 && <span aria-hidden className="text-muted"> · </span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ))}

      {tab === "used" && (
        <>
          <p className="mt-4 text-sm text-muted">Songs played on four or more days in the last eight weeks. A good prompt to rest one for a while.</p>
          {songList(overused, "Nothing is being overused right now.", (r) => `${r.recent} times in 8 weeks`)}
        </>
      )}

      {tab === "quiet" && (
        <>
          <p className="mt-4 text-sm text-muted">
            Songs not played for 12 weeks, the longest quiet first, then the ones never played ({neglectedTotal} in all{neglectedTotal > neglected.length ? `, the first ${neglected.length} shown` : ""}). Search to find a particular one.
          </p>
          {songList(neglected, "Every song has been played lately.")}
        </>
      )}

      {tab === "all" && songList([...played].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)), "Nothing has been played yet.")}
    </div>
  );
}
