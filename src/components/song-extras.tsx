"use client";

import Link from "next/link";
import { useState } from "react";
import { setSongTags } from "@/app/(app)/songs/tools-actions";
import type { SongLink } from "@/lib/song-links";
import { tidyTags } from "@/lib/tags";
import { CloseIcon } from "./icons";

/**
 * The tags on a song (collections like "Easter"). Press one to see every song with it; add or remove tags
 * here without opening the editor.
 */
export function SongTags({ songId, initial }: { songId: string; initial: string[] }) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string[]) {
    const before = tags;
    setTags(next);
    setBusy(true);
    setError(null);
    const res = await setSongTags(songId, next);
    setBusy(false);
    if (res.error) {
      setTags(before);
      setError(res.error);
    } else if (res.tags) setTags(res.tags);
  }

  function add() {
    const next = tidyTags([...tags, ...draft.split(",")]);
    setDraft("");
    if (next.length !== tags.length) void save(next);
  }

  return (
    <div data-tour="song-tags" className="space-y-2">
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li key={t} className="flex items-center rounded-full border border-line bg-hover text-xs">
              <Link href={`/?tag=${encodeURIComponent(t)}`} className="rounded-l-full py-1 pl-2.5 pr-1 hover:underline" title={`All songs tagged ${t}`}>
                #{t}
              </Link>
              <button type="button" onClick={() => void save(tags.filter((x) => x !== t))} disabled={busy} aria-label={`Remove the tag ${t}`} className="rounded-r-full px-1.5 py-1 text-muted hover:text-foreground">
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a tag…" aria-label="Add a tag" maxLength={40} className="field field-sm min-w-0 flex-1" autoComplete="off" />
        <button type="submit" className="btn" disabled={busy || draft.trim() === ""}>
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const KIND_LABEL: Record<SongLink["kind"], string> = { recording: "Listen", video: "Watch", sheet: "Chart", other: "Link" };

/** The links kept with a song, opening in a new tab. */
export function SongLinkList({ links }: { links: SongLink[] }) {
  return (
    <ul data-tour="song-links" className="space-y-1.5">
      {links.map((l) => {
        let host = "";
        try {
          host = new URL(l.url).hostname.replace(/^www\./, "");
        } catch {
          // The address was checked when it was saved.
        }
        return (
          <li key={l.url + l.label}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="group flex items-baseline gap-2 rounded-md px-1 py-1 text-sm hover:bg-hover">
              <span className="w-12 flex-none text-[0.6875rem] font-medium uppercase tracking-wide text-muted">{KIND_LABEL[l.kind]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate group-hover:underline">{l.label}</span>
                {host && <span className="block truncate text-xs text-muted">{host}</span>}
              </span>
              <span aria-hidden className="text-muted">
                ↗
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
