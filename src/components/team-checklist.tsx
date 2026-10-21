"use client";

import { useState } from "react";
import { MAX_TASK, taskOwner, taskProgress, tasksFor } from "@/lib/setlist-team";
import type { Team } from "./use-team";

/**
 * The pre-service checklist. Everyone's items are for all; an item can also belong to one instrument ("Drums:
 * kit checked"). `manage` is for whoever runs the service (all items, add and remove); otherwise it shows a
 * Stage screen's own items to tick off. Ticking records which view did it.
 */
export function Checklist({ team, manage }: { team: Team; manage: boolean }) {
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const visible = tasksFor(team.tasks, team.views, team.myView?.id ?? null, manage);
  const { done, total } = taskProgress(visible);
  const by = manage ? "Media" : (team.myView?.kind === "instrument" ? team.myView.name : "Stage");

  async function add() {
    setBusy(true);
    const ok = await team.addTask(label, owner || null);
    setBusy(false);
    if (ok) setLabel("");
  }

  return (
    <div data-tour="team-checklist" className="space-y-3">
      {total > 0 && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Checklist progress">
            <div className="h-full rounded-full bg-[#16a34a] transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted" aria-live="polite">
            {done === total ? "All ready." : `${done} of ${total} ready.`}
          </p>
        </div>
      )}

      {total === 0 && (
        <p className="text-sm text-muted">{manage ? "Nothing on the list yet." : "Nothing for you to check before the service."}</p>
      )}

      <ul className="space-y-1">
        {visible.map((t) => (
          <li key={t.id} className="flex items-start gap-2 rounded-md px-1 py-1 text-sm hover:bg-hover">
            <input type="checkbox" className="mt-1 h-4 w-4 flex-none" checked={t.done} onChange={(e) => void team.toggleTask(t.id, e.target.checked, by)} aria-label={t.label} />
            <span className="min-w-0 flex-1">
              <span className={t.done ? "text-muted line-through" : ""}>{t.label}</span>
              <span className="block text-xs text-muted">
                {manage && t.view_id ? `${taskOwner(t, team.views)} · ` : ""}
                {t.done && t.done_by ? `ticked by ${t.done_by}` : manage && !t.view_id ? "Everyone" : ""}
              </span>
            </span>
            {manage && (
              <button type="button" className="btn btn-quiet btn-icon flex-none text-xs hover:!text-[#dc2626]" onClick={() => void team.removeTask(t.id)} aria-label={`Remove ${t.label}`}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {manage && (
        <>
          {total === 0 && (
            <button type="button" className="btn w-full" onClick={() => void team.addUsualTasks()}>
              Start with the usual list
            </button>
          )}
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (label.trim()) void add();
            }}
          >
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={MAX_TASK} placeholder="Add something to check…" aria-label="New checklist item" className="field field-sm" autoComplete="off" />
            <div className="flex gap-1.5">
              <select className="field field-sm min-w-0 flex-1" aria-label="Who it is for" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">For everyone</option>
                {team.views
                  .filter((v) => v.kind === "instrument")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      For {v.name}
                    </option>
                  ))}
              </select>
              <button type="submit" className="btn" disabled={busy || !label.trim()}>
                Add
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
