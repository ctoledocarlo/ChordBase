"use client";

import { LINK_KINDS, MAX_LINKS, type LinkKind } from "@/lib/song-links";
import { PlusIcon, TrashIcon } from "./icons";

/** A link being edited: the address may still be half typed, so it isn't checked until the song is saved. */
export type LinkDraft = { label: string; url: string; kind: LinkKind };

/**
 * Links kept with a song: a recording to listen to, a video, sheet music. They show up on the song's page and
 * in any setlist it is in. Addresses are checked when the song is saved.
 */
export function EditorLinks({ links, onChange }: { links: LinkDraft[]; onChange: (links: LinkDraft[]) => void }) {
  const set = (i: number, patch: Partial<LinkDraft>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      {links.length === 0 && <p className="text-sm text-muted">Add a recording to learn it from, a video, or a chart. Anyone looking at the song can open it.</p>}
      {links.map((link, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[9rem_1fr_2fr_auto] sm:items-center">
          <select aria-label="Kind of link" value={link.kind} onChange={(e) => set(i, { kind: e.target.value as LinkKind })} className="field field-sm">
            {LINK_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input aria-label="Name of the link" value={link.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Name (optional)" maxLength={60} className="field field-sm" />
          <input
            aria-label="Web address"
            value={link.url}
            onChange={(e) => set(i, { url: e.target.value })}
            placeholder="https://…"
            inputMode="url"
            autoComplete="off"
            className="field field-sm"
          />
          <button type="button" className="btn btn-quiet btn-icon justify-self-start" onClick={() => onChange(links.filter((_, j) => j !== i))} aria-label="Remove this link" title="Remove">
            <TrashIcon />
          </button>
        </div>
      ))}
      {links.length < MAX_LINKS && (
        <button type="button" className="btn" onClick={() => onChange([...links, { label: "", url: "", kind: "recording" }])}>
          <PlusIcon /> Add a link
        </button>
      )}
    </div>
  );
}
