"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { restoreSongVersion } from "@/app/(app)/songs/tools-actions";
import { diffCounts, diffLines, withContext } from "@/lib/line-diff";
import { changedFields, type Snapshot, type SongVersion } from "@/lib/song-versions";
import type { Song } from "@/lib/songs";
import { EmptyState } from "./empty-state";
import { useToast } from "./toast";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const snapshot = (s: Snapshot | Song): Snapshot => ({
  title: s.title,
  artist: s.artist,
  original_key: s.original_key,
  default_capo: s.default_capo,
  tempo: s.tempo,
  time_signature: s.time_signature,
  ccli_number: s.ccli_number,
  tags: s.tags,
  melody_low: s.melody_low,
  melody_high: s.melody_high,
  links: s.links,
  body: s.body,
});

/**
 * A song's earlier versions, newest first. Each is the song as it was just before a save changed it. Pick one to see
 * what would change if the song went back to it, then restore it. Restoring keeps the song as it is now in this
 * list, so it can be undone the same way.
 */
export function SongHistory({ song, versions }: { song: Song; versions: SongVersion[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(versions[0]?.id ?? null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const now = useMemo(() => snapshot(song), [song]);
  const selected = versions.find((v) => v.id === selectedId) ?? null;

  const view = useMemo(() => {
    if (!selected) return null;
    const differs = changedFields(snapshot(selected), now);
    // Compared the way a restore works: red goes away, green comes back.
    const diff = diffLines(now.body, selected.body);
    return { differs, diff, rows: diff ? withContext(diff) : null, counts: diff ? diffCounts(diff) : null };
  }, [selected, now]);

  async function restore() {
    if (!selected) return;
    setBusy(true);
    const res = await restoreSongVersion(song.id, selected.id);
    setBusy(false);
    if (res.error) return toast(res.error, { tone: "error" });
    toast("Restored. The song as it was just now is kept in this list.", { tone: "success" });
    router.push(`/songs/${song.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link href={`/songs/${song.id}`} className="text-sm text-muted hover:text-foreground">
        ← {song.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Version history</h1>
      <p className="mt-1 text-sm text-muted">
        Every time this song is saved with a change, how it was is kept here (the latest 60). Pick one to compare it with the song now, and put it back if you like.
      </p>

      {versions.length === 0 ? (
        <EmptyState art="songs" title="No earlier versions yet">
          Make a change to this song and save it, and the version before it will be kept here.
        </EmptyState>
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-[16rem_1fr]">
          <ol data-tour="song-versions" aria-label="Versions" className="divide-y divide-line self-start overflow-hidden rounded-xl border border-line">
            {versions.map((v, i) => {
              // What the save that replaced this version changed: compared with the next newer one (or the song now).
              const newer = i === 0 ? now : snapshot(versions[i - 1]);
              const changed = changedFields(snapshot(v), newer);
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    aria-current={v.id === selectedId ? "true" : undefined}
                    onClick={() => {
                      setSelectedId(v.id);
                      setConfirming(false);
                    }}
                    className={`block w-full px-3 py-2.5 text-left ${v.id === selectedId ? "bg-hover" : "hover:bg-hover"}`}
                  >
                    <span className="block text-sm font-medium">{when(v.saved_at)}</span>
                    <span className="block truncate text-xs text-muted">{changed.length > 0 ? `Changed: ${changed.join(", ")}` : "Same as the next version"}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          {selected && view && (
            <section aria-label="Compare with now" className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="min-w-0 flex-1 font-medium">As it was on {when(selected.saved_at)}</h2>
                {confirming ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-muted">Replace the song with this version?</span>
                    <button type="button" className="btn btn-primary" onClick={() => void restore()} disabled={busy}>
                      {busy ? "Restoring…" : "Yes, restore"}
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)} disabled={view.differs.length === 0}>
                    Restore this version
                  </button>
                )}
              </div>

              {view.differs.length === 0 ? (
                <p className="mt-3 text-sm text-muted">This version is the same as the song now.</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-muted">Different from now: {view.differs.join(", ")}.</p>
                  {view.differs.includes("Chords and lyrics") &&
                    (view.rows && view.counts ? (
                      <>
                        <p className="mt-3 text-sm text-muted">
                          Green lines come back, red lines go away ({view.counts.added} back, {view.counts.removed} away).
                        </p>
                        <pre className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-line p-3 font-mono text-[0.8125rem] leading-6">
                          {view.rows.map((row, i) =>
                            row.kind === "gap" ? (
                              <span key={i} className="block text-muted">
                                … {row.hidden} unchanged {row.hidden === 1 ? "line" : "lines"}
                              </span>
                            ) : (
                              <span
                                key={i}
                                className={`block whitespace-pre-wrap break-words px-1 ${
                                  row.kind === "added"
                                    ? "bg-[#16a34a]/15 text-[#15803d] dark:text-[#4ade80]"
                                    : row.kind === "removed"
                                      ? "bg-[#dc2626]/15 text-[#b91c1c] dark:text-[#f87171]"
                                      : "text-muted"
                                }`}
                              >
                                <span aria-hidden>{row.kind === "added" ? "+ " : row.kind === "removed" ? "− " : "  "}</span>
                                <span className="sr-only">{row.kind === "added" ? "Comes back: " : row.kind === "removed" ? "Goes away: " : ""}</span>
                                {row.text || " "}
                              </span>
                            ),
                          )}
                        </pre>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-muted">This song is too long to compare line by line, but it can still be restored.</p>
                    ))}
                </>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
