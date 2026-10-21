"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mergeSongs, renameArtists } from "@/app/(app)/songs/tools-actions";
import type { ArtistVariants, DuplicateGroup } from "@/lib/duplicates";
import { EmptyState } from "./empty-state";
import { useToast } from "./toast";

/**
 * Tidying the library after a big import: songs that are in twice (merge them, keeping one and moving the setlists
 * and history over to it), and artists spelled several ways (make them one spelling).
 */
export function CleanupView({ songCount, groups, artists }: { songCount: number; groups: DuplicateGroup[]; artists: ArtistVariants[] }) {
  const [tab, setTab] = useState<"songs" | "artists">("songs");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Tidy up the library</h1>
      <p className="mt-1 text-sm text-muted">
        {songCount} songs checked. {groups.length === 0 ? "No duplicates found." : `${groups.length} ${groups.length === 1 ? "set" : "sets"} of possible duplicates.`}
      </p>

      <div data-tour="cleanup-tabs" role="tablist" aria-label="What to tidy" className="mt-5 flex flex-wrap gap-1.5">
        <button type="button" role="tab" aria-selected={tab === "songs"} onClick={() => setTab("songs")} className={`btn ${tab === "songs" ? "btn-primary" : ""}`}>
          Duplicate songs <span className="opacity-70">{groups.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "artists"} onClick={() => setTab("artists")} className={`btn ${tab === "artists" ? "btn-primary" : ""}`}>
          Artist names <span className="opacity-70">{artists.length}</span>
        </button>
      </div>

      {tab === "songs" ? <Duplicates groups={groups} /> : <Artists artists={artists} />}
    </div>
  );
}

function Duplicates({ groups }: { groups: DuplicateGroup[] }) {
  const router = useRouter();
  const toast = useToast();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = groups.filter((g) => !gone.has(g.songs[0].id));

  if (shown.length === 0) {
    return (
      <EmptyState art="songs" title="No duplicates found">
        Songs with the same title (ignoring capital letters, punctuation and anything in brackets), or titles a letter or two apart, would show up here.
      </EmptyState>
    );
  }

  return (
    <>
      <p className="mt-4 text-sm text-muted">
        Choose the one to keep in each set, then merge. Setlists and history that used the others will use the one you keep, and their tags are added to it. Open a song to compare before you decide.
      </p>
      <ul className="mt-4 space-y-4">
        {shown.map((group) => (
          <DuplicateSet
            key={group.songs[0].id}
            group={group}
            onMerged={(n) => {
              setGone((g) => new Set(g).add(group.songs[0].id));
              toast(`Merged ${n} ${n === 1 ? "song" : "songs"} into one.`, { tone: "success" });
              router.refresh();
            }}
          />
        ))}
      </ul>
    </>
  );
}

function DuplicateSet({ group, onMerged }: { group: DuplicateGroup; onMerged: (merged: number) => void }) {
  const [keep, setKeep] = useState(group.songs[0].id);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function merge() {
    setBusy(true);
    const drop = group.songs.filter((s) => s.id !== keep).map((s) => s.id);
    const res = await mergeSongs(keep, drop);
    setBusy(false);
    if (res.error) toast(res.error, { tone: "error" });
    else onMerged(res.merged ?? drop.length);
  }

  return (
    <li className="rounded-xl border border-line p-4">
      <p className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">{group.songs.length} songs</span>
        <span className="text-muted">{group.match === "same" ? "with the same title" : "with titles that are nearly the same"}</span>
      </p>
      <ul className="divide-y divide-line rounded-md border border-line">
        {group.songs.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input type="radio" name={`keep-${group.songs[0].id}`} checked={keep === s.id} onChange={() => setKeep(s.id)} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.title}</span>
                <span className="block truncate text-xs text-muted">
                  {[s.artist, s.original_key && `Key ${s.original_key}`].filter(Boolean).join(" · ") || "No artist or key"}
                </span>
              </span>
            </label>
            <Link href={`/songs/${s.id}`} target="_blank" rel="noopener noreferrer" className="flex-none text-xs text-muted underline hover:text-foreground">
              Open
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void merge()} disabled={busy}>
          {busy ? "Merging…" : `Keep the chosen one and merge the other ${group.songs.length - 1}`}
        </button>
        <span className="text-xs text-muted">This can&apos;t be undone.</span>
      </div>
    </li>
  );
}

function Artists({ artists }: { artists: ArtistVariants[] }) {
  const router = useRouter();
  const toast = useToast();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const shown = artists.filter((a) => !done.has(a.canonical));

  if (shown.length === 0) {
    return (
      <EmptyState art="songs" title="Artist names are consistent">
        Names that are the same apart from capital letters, spacing or punctuation would show up here.
      </EmptyState>
    );
  }

  async function apply(group: ArtistVariants) {
    const to = (names[group.canonical] ?? group.canonical).trim();
    setBusy(group.canonical);
    const res = await renameArtists(group.variants.map((v) => v.name), to);
    setBusy(null);
    if (res.error) return toast(res.error, { tone: "error" });
    setDone((d) => new Set(d).add(group.canonical));
    toast(`Changed ${res.changed} ${res.changed === 1 ? "song" : "songs"} to “${to}”.`, { tone: "success" });
    router.refresh();
  }

  return (
    <>
      <p className="mt-4 text-sm text-muted">These look like the same artist written different ways. Pick the spelling to use for all of them.</p>
      <ul className="mt-4 space-y-3">
        {shown.map((group) => (
          <li key={group.canonical} className="rounded-xl border border-line p-4">
            <p className="mb-2 flex flex-wrap gap-1.5 text-sm">
              {group.variants.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  className="rounded-full border border-line px-2.5 py-1 hover:bg-hover"
                  onClick={() => setNames((n) => ({ ...n, [group.canonical]: v.name }))}
                  title="Use this spelling"
                >
                  {v.name} <span className="text-muted">{v.count}</span>
                </button>
              ))}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="The spelling to use"
                value={names[group.canonical] ?? group.canonical}
                onChange={(e) => setNames((n) => ({ ...n, [group.canonical]: e.target.value }))}
                maxLength={120}
                className="field field-sm min-w-0 flex-1"
              />
              <button type="button" className="btn btn-primary" onClick={() => void apply(group)} disabled={busy !== null}>
                {busy === group.canonical ? "Changing…" : "Use this for all"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
