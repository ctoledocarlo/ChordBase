"use client";

import { useState } from "react";
import { INSTRUMENT_PRESETS, MAX_NOTE, MAX_VIEW_NAME, notesToShow } from "@/lib/setlist-team";
import type { Team } from "./use-team";
import type { ScreenRole } from "./use-screen-role";

/**
 * The notes for the song on screen, in a card above it: what the whole band should know, then what is for this
 * instrument. A Stage screen can write notes for its own instrument; a Viewer only reads; Media sees every
 * view's note and writes them in the sidebar.
 */
export function NotesCard({ team, itemId, role }: { team: Team; itemId: string; role: ScreenRole }) {
  const [editing, setEditing] = useState(false);
  const mine = team.myView;

  const shown =
    role === "media"
      ? team.views.map((view) => ({ view, body: team.noteText(itemId, view.id).trim() })).filter((n) => n.body !== "")
      : notesToShow(team.notes, team.views, itemId, mine?.id ?? null);

  const canEdit = role === "stage" && !!mine;

  if (editing && canEdit && mine) {
    return (
      <div data-tour="team-notes" className="mb-3 rounded-lg border border-line bg-hover p-2.5 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            Notes for {mine.kind === "all" ? "everyone" : mine.name}
          </span>
          <textarea
            autoFocus
            value={team.noteText(itemId, mine.id)}
            onChange={(e) => team.setNote(itemId, mine.id, e.target.value)}
            maxLength={MAX_NOTE}
            rows={3}
            className="field field-sm"
            placeholder="Start on the 2nd verse, drums in at the chorus…"
          />
        </label>
        <button type="button" className="btn mt-2 px-2.5 py-0.5 text-xs" onClick={() => setEditing(false)}>
          Done
        </button>
      </div>
    );
  }

  if (shown.length === 0) {
    return canEdit ? (
      <p className="mb-2 text-xs">
        <button type="button" className="text-muted underline hover:text-foreground" onClick={() => setEditing(true)}>
          Add a note for {mine?.kind === "all" ? "the band" : mine?.name}
        </button>
      </p>
    ) : null;
  }

  return (
    <div data-tour="team-notes" className="mb-3 space-y-1.5 rounded-lg border border-line bg-hover px-3 py-2 text-sm">
      {shown.map(({ view, body }) => (
        <p key={view.id} className="leading-snug">
          <span className="mr-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">{view.kind === "all" ? "Everyone" : view.name}</span>
          <span className="whitespace-pre-wrap">{body}</span>
        </p>
      ))}
      {canEdit && (
        <button type="button" className="text-xs text-muted underline hover:text-foreground" onClick={() => setEditing(true)}>
          Edit my notes
        </button>
      )}
    </div>
  );
}

/** Media's sidebar: write the notes for the song on screen, one view at a time. */
export function NotesEditor({ team, itemId }: { team: Team; itemId: string }) {
  const [viewId, setViewId] = useState<string | null>(null);
  const view = team.views.find((v) => v.id === viewId) ?? team.everyone ?? team.views[0];
  if (!view) return <p className="text-sm text-muted">Notes aren&apos;t available yet (the team-tools database update hasn&apos;t been run).</p>;
  const text = team.noteText(itemId, view.id);

  return (
    <div data-tour="team-notes-editor" className="space-y-2">
      <select className="field field-sm" aria-label="Who the note is for" value={view.id} onChange={(e) => setViewId(e.target.value)}>
        {team.views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.kind === "all" ? "Everyone" : v.name}
            {team.noteText(itemId, v.id).trim() ? " •" : ""}
          </option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(e) => team.setNote(itemId, view.id, e.target.value)}
        maxLength={MAX_NOTE}
        rows={4}
        aria-label={`Notes for ${view.kind === "all" ? "everyone" : view.name}`}
        placeholder={view.kind === "all" ? "Start on the 2nd verse, repeat the last chorus…" : `For ${view.name}: when to come in, what to play…`}
        className="field field-sm"
      />
      <p className="text-xs text-muted">Shown on the Stage screens set to {view.kind === "all" ? "any instrument" : view.name}. A • marks a view that has a note for this song.</p>
    </div>
  );
}

/** Media's sidebar: the instruments this setlist has views for, added with a tap or by name. */
export function ViewManager({ team }: { team: Team }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const used = new Set(team.views.map((v) => v.name.toLowerCase()));
  const presets = INSTRUMENT_PRESETS.filter((p) => !used.has(p.name.toLowerCase()));

  async function add(name: string, chords: boolean) {
    setBusy(true);
    const ok = await team.addView(name, chords);
    setBusy(false);
    if (ok) setCustom("");
  }

  return (
    <div data-tour="team-views" className="space-y-3">
      <p className="text-sm text-muted">
        Each instrument gets its own view for this setlist. A Stage screen picks which one it is, and sees that part&apos;s notes (and chords, if you leave them on).
      </p>
      <ul className="space-y-1.5">
        {team.views.map((v) => (
          <li key={v.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-sm">
            {v.kind === "all" ? (
              <span className="min-w-0 flex-1 truncate font-medium">Everyone</span>
            ) : (
              <input
                defaultValue={v.name}
                key={v.name}
                aria-label={`Name of the ${v.name} view`}
                maxLength={MAX_VIEW_NAME}
                className="min-w-0 flex-1 bg-transparent font-medium outline-none focus-visible:underline"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== v.name) void team.changeView(v.id, { name: next });
                  else e.target.value = v.name;
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            )}
            <label className="flex flex-none items-center gap-1 text-xs text-muted">
              <input type="checkbox" checked={v.show_chords} onChange={(e) => void team.changeView(v.id, { show_chords: e.target.checked })} />
              Chords
            </label>
            {v.kind === "instrument" && (
              <button type="button" className="btn btn-quiet btn-icon text-xs hover:!text-[#dc2626]" onClick={() => void team.removeView(v.id)} aria-label={`Remove the ${v.name} view`} title="Remove">
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {presets.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Add an instrument</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button key={p.name} type="button" className="btn px-2.5 py-1 text-[0.8125rem]" disabled={busy} onClick={() => void add(p.name, p.show_chords)}>
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) void add(custom, true);
        }}
      >
        <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={MAX_VIEW_NAME} placeholder="Another instrument…" aria-label="Name of another instrument" className="field field-sm min-w-0 flex-1" autoComplete="off" />
        <button type="submit" className="btn" disabled={busy || !custom.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}
