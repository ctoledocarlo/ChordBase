"use client";

import { useState } from "react";
import { MINISTRY_GROUPS, toggleMinistry } from "@/lib/ministries";
import { activeColumns, COLUMN_IDEAS, KIND_HELP, KIND_LABEL, MAX_COLUMNS, MAX_OPTIONS, sectionNames, sectionsOf, type ColumnIdea, type ColumnKind, type ScheduleColumn } from "@/lib/schedule-columns";
import { Modal } from "./modal";
import { useScheduleApi } from "./schedule-store";

const MINISTRY_OPTIONS = MINISTRY_GROUPS.flatMap((g) => g.options);
const KINDS: ColumnKind[] = ["people", "choice", "text"];

/** The list a choice column picks from: type a value and press Enter (or a comma); paste several lines to add them all. */
function OptionsEditor({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add(text: string) {
    const parts = text.split(/[\n,;]/).map((p) => p.replace(/\s+/g, " ").trim().slice(0, 40)).filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) if (next.length < MAX_OPTIONS && !next.some((o) => o.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft("");
  }

  return (
    <div>
      <span className="label">The choices</span>
      <div className="flex flex-wrap gap-1.5">
        {value.map((o) => (
          <span key={o} className="inline-flex items-center gap-1 rounded-full border border-line bg-hover py-0.5 pl-2.5 pr-1 text-sm">
            {o}
            <button type="button" aria-label={`Remove ${o}`} className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-line hover:text-foreground" onClick={() => onChange(value.filter((x) => x !== o))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[\n,;]/.test(text)) {
            e.preventDefault();
            add(text);
          }
        }}
        placeholder={value.length === 0 ? "Type a choice and press Enter" : "Add another"}
        className="field mt-2"
        maxLength={40}
      />
      <p className="mt-1 text-xs text-muted">Each Sunday or event then picks one. You can change the list any time; days that already used a removed choice keep it.</p>
    </div>
  );
}

type Draft = { label: string; kind: ColumnKind; section: string; options: string[]; ministries: string[]; optional: boolean };

/** Deleting a column for good asks twice, and says what goes with it. */
function DeleteColumn({ column, onDeleted }: { column: ScheduleColumn; onDeleted?: () => void }) {
  const api = useScheduleApi();
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" className="btn btn-quiet px-2 text-xs hover:!text-[#dc2626]" onClick={() => setAsking(true)}>
        Delete
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">Delete “{column.label}” and everyone put on it?</span>
      <button
        type="button"
        className="btn border-[#dc2626] bg-[#dc2626] px-2 text-xs text-white hover:!bg-[#b91c1c]"
        onClick={() => {
          api.deleteColumn(column.id);
          onDeleted?.();
        }}
      >
        Yes, delete
      </button>
      <button type="button" className="btn px-2 text-xs" onClick={() => setAsking(false)}>
        Keep
      </button>
    </span>
  );
}

function ColumnForm({ editing, idea, columns, onDone }: { editing: ScheduleColumn | null; idea: ColumnIdea | null; columns: ScheduleColumn[]; onDone: () => void }) {
  const api = useScheduleApi();
  const [draft, setDraft] = useState<Draft>({
    label: editing?.label ?? idea?.label ?? "",
    kind: editing?.kind ?? idea?.kind ?? "people",
    section: editing?.section ?? idea?.section ?? "",
    options: editing?.options ?? idea?.options ?? [],
    ministries: editing?.ministries ?? idea?.ministries ?? [],
    optional: editing?.optional ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const sections = sectionNames(columns);

  // Shown at once; the server is asked in the background.
  function save() {
    const label = draft.label.trim();
    if (columns.some((c) => !c.archived && c.id !== editing?.id && c.label.toLowerCase() === label.toLowerCase())) return setError(`You already have a column called ${label}.`);
    if (editing) api.updateColumn(editing.id, { ...draft, label });
    else api.addColumn({ ...draft, label });
    onDone();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="block">
        <span className="label">Name</span>
        <input value={draft.label} onChange={(e) => set({ label: e.target.value })} className="field" maxLength={40} placeholder="Dancers, Ushers, Type of Sunday…" required autoFocus />
      </label>

      {!editing && (
        <fieldset>
          <legend className="label">What goes in it?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <label key={k} className={`cursor-pointer rounded-lg border p-2.5 text-sm ${draft.kind === k ? "border-accent bg-accent/10" : "border-line hover:bg-hover"}`}>
                <input type="radio" name="kind" className="sr-only" checked={draft.kind === k} onChange={() => set({ kind: k })} />
                <span className="block font-medium">{KIND_LABEL[k]}</span>
                <span className="mt-0.5 block text-xs text-muted">{KIND_HELP[k]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="block">
        <span className="label">Heading (optional)</span>
        <input value={draft.section} onChange={(e) => set({ section: e.target.value })} className="field" maxLength={40} list="schedule-sections" placeholder="Sound booth, Band, Other…" />
        <datalist id="schedule-sections">
          {sections.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <span className="mt-1 block text-xs text-muted">Columns with the same heading sit together.</span>
      </label>

      {draft.kind === "choice" && <OptionsEditor value={draft.options} onChange={(options) => set({ options })} />}

      {draft.kind === "people" && (
        <>
          <fieldset>
            <legend className="label">Who is suggested first (optional)</legend>
            <div className="flex flex-wrap gap-1.5">
              {MINISTRY_OPTIONS.map((o) => (
                <label key={o.token} className={`cursor-pointer rounded-full border px-2.5 py-1 text-sm ${draft.ministries.includes(o.token) ? "border-accent bg-accent/10" : "border-line hover:bg-hover"}`}>
                  <input type="checkbox" className="sr-only" checked={draft.ministries.includes(o.token)} onChange={() => set({ ministries: toggleMinistry(draft.ministries, o.token) })} />
                  {o.label}
                </label>
              ))}
            </div>
            <span className="mt-1 block text-xs text-muted">People who have served in this column before are suggested too, whatever you pick here.</span>
          </fieldset>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={draft.optional} onChange={(e) => set({ optional: e.target.checked })} />
            <span>
              Only needed some weeks
              <span className="block text-xs text-muted">It stays out of the “open spots” list and out of each day’s card until someone is on it.</span>
            </span>
          </label>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing && (
          <span className="mr-auto">
            <DeleteColumn column={editing} onDeleted={onDone} />
          </span>
        )}
        <button type="button" className="btn" onClick={onDone}>
          Back
        </button>
        <button type="submit" className="btn btn-primary" disabled={!draft.label.trim()}>
          {editing ? "Save" : "Add column"}
        </button>
      </div>
    </form>
  );
}

type View = { mode: "list" } | { mode: "form"; editing: ScheduleColumn | null; idea: ColumnIdea | null };

function ManagerBody({ columns, adding }: { columns: ScheduleColumn[]; adding: boolean }) {
  const api = useScheduleApi();
  const [view, setView] = useState<View>(adding ? { mode: "form", editing: null, idea: null } : { mode: "list" });
  const active = activeColumns(columns);
  const hidden = columns.filter((c) => c.archived);
  const taken = new Set(active.map((c) => c.label.toLowerCase()));
  const ideas = COLUMN_IDEAS.filter((i) => !taken.has(i.label.toLowerCase()));

  if (view.mode === "form") {
    return <ColumnForm editing={view.editing} idea={view.idea} columns={columns} onDone={() => setView({ mode: "list" })} />;
  }

  const sections = sectionsOf(active);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">These are the columns of your schedule. Add the ones your church uses, rename or reorder them, and hide the ones you don’t, or delete them. Hiding keeps the history; deleting removes it.</p>

      {sections.map((s) => (
        <div key={s.title || "other"}>
          <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">{s.title || "No heading"}</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {s.columns.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.label}</span>
                  <span className="block truncate text-xs text-muted">
                    {KIND_LABEL[c.kind]}
                    {c.kind === "choice" && ` · ${c.options.length === 0 ? "no choices yet" : c.options.slice(0, 3).join(", ") + (c.options.length > 3 ? `, +${c.options.length - 3}` : "")}`}
                    {c.optional && " · only some weeks"}
                  </span>
                </span>
                <button type="button" className="btn btn-quiet px-2 text-xs" aria-label={`Move ${c.label} up`} disabled={i === 0} onClick={() => api.moveColumn(c.id, -1)}>
                  ↑
                </button>
                <button type="button" className="btn btn-quiet px-2 text-xs" aria-label={`Move ${c.label} down`} disabled={i === s.columns.length - 1} onClick={() => api.moveColumn(c.id, 1)}>
                  ↓
                </button>
                <button type="button" className="btn btn-quiet px-2 text-xs" onClick={() => setView({ mode: "form", editing: c, idea: null })}>
                  Edit
                </button>
                <button type="button" className="btn btn-quiet px-2 text-xs" onClick={() => api.archiveColumn(c.id, true)}>
                  Hide
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {hidden.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-foreground">Hidden columns ({hidden.length})</summary>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {hidden.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-muted">{c.label}</span>
                <button type="button" className="btn btn-quiet px-2 text-xs" onClick={() => api.archiveColumn(c.id, false)}>
                  Bring back
                </button>
                <DeleteColumn column={c} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {ideas.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Ideas</p>
          <div className="flex flex-wrap gap-1.5">
            {ideas.map((i) => (
              <button key={i.label} type="button" title={i.hint} className="rounded-full border border-dashed border-line px-2.5 py-1 text-sm hover:border-foreground" onClick={() => setView({ mode: "form", editing: null, idea: i })}>
                + {i.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" disabled={active.length >= MAX_COLUMNS} onClick={() => setView({ mode: "form", editing: null, idea: null })}>
          Add a column
        </button>
      </div>
    </div>
  );
}

/** Admins and main accounts shape the schedule's columns here: add (people, choice or text), rename, reorder, hide. */
export function ColumnManager({ open, adding = false, columns, onClose }: { open: boolean; adding?: boolean; columns: ScheduleColumn[]; onClose: () => void }) {
  return (
    <Modal open={open} title="Schedule columns" onClose={onClose}>
      <ManagerBody columns={columns} adding={adding} />
    </Modal>
  );
}
