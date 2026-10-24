"use client";

import { useMemo, useState } from "react";
import { applyColumns, importSchedule } from "@/app/(app)/schedule/actions";
import { downloadFile, XLSX_TYPE } from "@/lib/download";
import { buildSlots, dayText, sundaysFrom, type Person } from "@/lib/schedule";
import { activeColumns, KIND_LABEL, type ColumnKind, type ScheduleColumn } from "@/lib/schedule-columns";
import { countAssignments, optionsFrom, readWorkbook, scheduleSheets, toImportRows, unknownNames, type DetectedColumn, type ParsedImport } from "@/lib/schedule-grid";
import { MAX_XLSX_BYTES, readXlsxSheets, writeXlsx } from "@/lib/xlsx";
import { Modal } from "./modal";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const KINDS: ColumnKind[] = ["people", "choice", "text"];

function ImportSteps({ people, columns, usedKeys, today, onClose, onImported }: { people: Person[]; columns: ScheduleColumn[]; usedKeys: Set<string>; today: string; onClose: () => void; onImported: () => void }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [detected, setDetected] = useState<DetectedColumn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createPeople, setCreatePeople] = useState(false);
  const [hideUnused, setHideUnused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    setError(null);
    setParsed(null);
    setDetected([]);
    if (!file) return;
    if (file.size > MAX_XLSX_BYTES) return setError("That file is too big (up to 3 MB).");
    try {
      const result = readWorkbook(readXlsxSheets(new Uint8Array(await file.arrayBuffer())), today, columns);
      if (result.rows.length === 0) {
        return setError(result.issues[0]?.message ?? "I couldn't find a table with a Date column. Use the headings from an exported file or the template, or a sheet with a “Date” heading above the dates.");
      }
      setFileName(file.name);
      setParsed(result);
      setDetected(result.columns);
      // Offered when the file leaves out several of the columns the church has and none were ever used.
      setHideUnused(result.columns.filter((c) => c.existing).length >= 3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  }

  const change = (id: string, patch: Partial<DetectedColumn>) => setDetected((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const changeKind = (c: DetectedColumn, kind: ColumnKind) => change(c.id, { kind, options: kind === "choice" && parsed ? optionsFrom(parsed.rows, c.id) : [] });

  const active = useMemo(() => activeColumns(columns), [columns]);
  // A heading sent into a column the church already has counts as that column.
  const resolved = useMemo(
    () =>
      detected.map((d) => {
        const col = !d.existing && d.mapTo ? active.find((c) => c.key === d.mapTo) : undefined;
        return col ? { ...d, existing: col, kind: col.kind, options: col.options } : d;
      }),
    [detected, active],
  );
  const unusedColumns = useMemo(() => active.filter((c) => !resolved.some((d) => d.existing?.key === c.key) && !usedKeys.has(c.key)), [active, resolved, usedKeys]);
  const newColumns = resolved.filter((d) => !d.existing && d.include);

  // For the preview the new columns stand in under their proposed ids.
  const previewRows = useMemo(() => (parsed ? toImportRows(parsed.rows, resolved, (d) => (d.existing ? d.existing.key : d.include ? d.id : null)) : []), [parsed, resolved]);
  const unknown = useMemo(() => unknownNames(previewRows, people), [previewRows, people]);
  const assignments = countAssignments(previewRows);

  async function run() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    const keys = new Map<string, string>();
    let hidden = 0;
    if (newColumns.length > 0 || (hideUnused && unusedColumns.length > 0)) {
      const made = await applyColumns(
        newColumns.map((d) => ({ ref: d.id, label: d.label, kind: d.kind, section: d.section, options: d.options })),
        hideUnused ? resolved.flatMap((d) => (d.existing ? [d.existing.key] : [])) : null,
      );
      if ("error" in made) {
        setBusy(false);
        return setError(made.error);
      }
      for (const c of made.created ?? []) keys.set(c.ref, c.key);
      hidden = made.hidden ?? 0;
    }
    const rows = toImportRows(parsed.rows, resolved, (d) => (d.existing ? d.existing.key : d.include ? (keys.get(d.id) ?? null) : null));
    const res = await importSchedule(rows, createPeople);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    const left = res.unknown ?? [];
    setDone(
      `Added ${plural(res.assignments ?? 0, "assignment", "assignments")} across ${plural(res.events ?? 0, "day", "days")}` +
        (newColumns.length > 0 ? `, ${plural(newColumns.length, "new column", "new columns")}` : "") +
        ((res.created_people ?? 0) > 0 ? `, and ${plural(res.created_people ?? 0, "new person", "new people")}` : "") +
        "." +
        (hidden > 0 ? ` ${plural(hidden, "unused column was", "unused columns were")} hidden.` : "") +
        (left.length > 0 ? ` Not on the people list, so left off: ${left.join(", ")}.` : "") +
        ((res.conflicts ?? 0) > 0 ? ` ${plural(res.conflicts ?? 0, "person was", "people were")} left off a column because they were already on another that day.` : ""),
    );
    onImported();
  }

  /** Eight empty Sundays in the layout the import reads, with this church's own columns. */
  function template() {
    const last = sundaysFrom(today, 8)[7];
    downloadFile(writeXlsx(scheduleSheets(buildSlots([], today, last), new Map(), columns)), "chordbase-schedule-template.xlsx", XLSX_TYPE);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p role="status">{done}</p>
        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const existing = detected.filter((d) => d.existing);
  const fresh = detected.filter((d) => !d.existing);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Choose an Excel file: one you exported, or your church’s own sheet. ChordBase finds the Date column, reads the headings (even over two rows), and offers to make a column for any heading it doesn’t have yet. Importing only <strong className="font-medium text-foreground">adds</strong>: it never takes anyone off the schedule or changes an event that is already there. A column holds one person, so only the first name in a cell is used.{" "}
        <button type="button" className="underline hover:text-foreground" onClick={template}>
          Download a blank template
        </button>
      </p>

      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => void choose(e.target.files?.[0])}
        aria-label="Excel file"
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm hover:file:bg-hover"
      />

      {parsed && (
        <div className="space-y-4">
          <p className="text-sm">
            <strong className="font-medium">{fileName}</strong>: {plural(parsed.rows.length, "day", "days")}, {plural(assignments, "person", "people")} on roles.
            {parsed.skippedSheets.length > 0 && <span className="text-muted"> Not used (no table with dates): {parsed.skippedSheets.join(", ")}.</span>}
          </p>

          <ul className="max-h-36 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm" aria-label="Days to import">
            {parsed.rows.slice(0, 12).map((r) => (
              <li key={`${r.sheet}-${r.line}`} className="flex items-baseline gap-3 px-3 py-1.5">
                <span className="w-32 flex-none text-muted">{dayText(r.date, today)}</span>
                <span className="min-w-0 flex-1 truncate">{r.title || "Sunday service"}</span>
                <span className="flex-none text-xs text-muted">{Object.keys(r.cells).length} filled</span>
              </li>
            ))}
            {parsed.rows.length > 12 && <li className="px-3 py-1.5 text-muted">and {parsed.rows.length - 12} more</li>}
          </ul>

          {existing.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">Columns you already have</p>
              <p className="text-sm text-muted">{existing.map((d) => d.label).join(", ")}</p>
            </div>
          )}

          {fresh.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">New columns from your file</p>
              <p className="mb-2 text-xs text-muted">Untick any you don’t want. Check what each holds: people to put on (names), a choice from a list, or text. If you already have a column for it, put it there instead.</p>
              <ul className="space-y-2" aria-label="New columns">
                {fresh.map((d) => (
                  <li key={d.id} className="rounded-lg border border-line p-2.5">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={d.include} onChange={(e) => change(d.id, { include: e.target.checked })} aria-label={`Use ${d.label}`} />
                      <input value={d.label} onChange={(e) => change(d.id, { label: e.target.value })} className="field field-sm min-w-0 flex-1" maxLength={40} aria-label="Column name" disabled={!d.include || !!d.mapTo} />
                      <select value={d.kind} onChange={(e) => changeKind(d, e.target.value as ColumnKind)} className="field field-sm w-28 flex-none" aria-label={`What ${d.label} holds`} disabled={!d.include || !!d.mapTo}>
                        {KINDS.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="mt-1.5 flex items-center gap-2 pl-6 text-xs text-muted">
                      Put it in
                      <select value={d.mapTo ?? ""} onChange={(e) => change(d.id, { mapTo: e.target.value || null })} className="field field-sm min-w-0 flex-1" aria-label={`Where ${d.label} goes`} disabled={!d.include}>
                        <option value="">a new column</option>
                        {active.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label} ({KIND_LABEL[c.kind].toLowerCase()})
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="mt-1 pl-6 text-xs text-muted">
                      {d.section && <>under {d.section} · </>}
                      {d.used === 0 ? "empty in the file" : `${plural(d.used, "day", "days")}`}
                      {d.kind === "choice" && d.options.length > 0 && ` · choices: ${d.options.slice(0, 6).join(", ")}${d.options.length > 6 ? ", …" : ""}`}
                      {d.kind !== "choice" && d.sample.length > 0 && ` · e.g. ${d.sample.slice(0, 3).join(", ")}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unusedColumns.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={hideUnused} onChange={(e) => setHideUnused(e.target.checked)} />
              <span>
                Hide the columns this file doesn’t have
                <span className="block text-xs text-muted">
                  {unusedColumns.map((c) => c.label).join(", ")}. Only ones nobody has been put on are hidden, and you can bring them back under Columns.
                </span>
              </span>
            </label>
          )}

          {unknown.length > 0 && (
            <div className="rounded-lg border border-line p-3 text-sm">
              <p className="font-medium">{unknown.length === 1 ? "1 name isn't" : `${unknown.length} names aren't`} on your people list</p>
              <p className="mt-1 text-muted">{unknown.join(", ")}</p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={createPeople} onChange={(e) => setCreatePeople(e.target.checked)} />
                Add them as new people (without accounts)
              </label>
              {!createPeople && <p className="mt-1 text-muted">Left unticked, they are left off the schedule and everything else is imported.</p>}
            </div>
          )}

          {parsed.ignored.length > 0 && <p className="text-sm text-muted">Columns that aren&apos;t used: {parsed.ignored.join(", ")}.</p>}
          {parsed.issues.length > 0 && (
            <ul className="space-y-0.5 text-sm text-muted">
              {parsed.issues.slice(0, 5).map((i) => (
                <li key={`${i.line}-${i.message}`}>
                  {i.line > 0 ? `Row ${i.line}: ` : ""}
                  {i.message}
                </li>
              ))}
              {parsed.issues.length > 5 && <li>and {parsed.issues.length - 5} more.</li>}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!parsed || busy || (fresh.some((d) => d.include && !d.label.trim()))} onClick={() => void run()}>
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}

/** Adding to the schedule from an Excel file (admins and main accounts). The file is read here; only its rows are sent. */
export function ScheduleImport({ open, people, columns, usedKeys, today, onClose, onImported }: { open: boolean; people: Person[]; columns: ScheduleColumn[]; usedKeys: Set<string>; today: string; onClose: () => void; onImported: () => void }) {
  return (
    <Modal open={open} title="Import from Excel" onClose={onClose}>
      <ImportSteps people={people} columns={columns} usedKeys={usedKeys} today={today} onClose={onClose} onImported={onImported} />
    </Modal>
  );
}
