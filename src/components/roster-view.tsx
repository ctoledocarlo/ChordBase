"use client";

import { useMemo, useState } from "react";
import { MAX_NAME } from "@/lib/ministries";
import { personName, type Person } from "@/lib/schedule";
import { sectionsOf, suitsColumn, type ScheduleColumn } from "@/lib/schedule-columns";
import { summarize } from "@/lib/schedule-stats";
import { EmptyState } from "./empty-state";
import { MinistryPicker } from "./ministry-picker";
import { Modal } from "./modal";
import { Avatar } from "./schedule-bits";
import { useScheduleApi } from "./schedule-store";

function PersonFields({ person, people, onClose }: { person: Person | null; people: Person[]; onClose: () => void }) {
  const api = useScheduleApi();
  const [first, setFirst] = useState(person?.first_name ?? "");
  const [last, setLast] = useState(person?.last_name ?? "");
  const [ministries, setMinistries] = useState(person?.ministries ?? []);
  const [error, setError] = useState<string | null>(null);

  function save() {
    const full = personName({ first_name: first, last_name: last }).toLowerCase();
    if (people.some((p) => p.id !== person?.id && personName(p).toLowerCase() === full)) return setError(`Someone called ${personName({ first_name: first, last_name: last })} is already on your list.`);
    // Shown at once; the server is asked in the background.
    if (person) api.updatePerson(person.id, first, last, ministries);
    else api.addPerson(first, last, ministries);
    onClose();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">First name</span>
          <input value={first} onChange={(e) => setFirst(e.target.value)} className="field" maxLength={MAX_NAME} required autoFocus />
        </label>
        <label className="block">
          <span className="label">Last name</span>
          <input value={last} onChange={(e) => setLast(e.target.value)} className="field" maxLength={MAX_NAME} />
        </label>
      </div>
      <MinistryPicker value={ministries} onChange={setMinistries} />
      {person?.user_id && <p className="text-sm text-muted">This person has an account, so their name and ministries are also changed there.</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!first.trim()}>
          {person ? "Save" : "Add person"}
        </button>
      </div>
    </form>
  );
}

/** Whether the person can do a column: their ministry fits it, or they have served in it before. */
function ability(person: Person, column: ScheduleColumn, served: number): "ministry" | "served" | null {
  if (suitsColumn(column, person.ministries)) return "ministry";
  return served > 0 ? "served" : null;
}

/**
 * Everyone who can be scheduled, and what each can do: a dot in each role column they are a fit for (their ministry says
 * so) or have served in before. Filter to the band, the sound booth or the vocals to see who covers what. A person with
 * an account is linked to it; a person without one can still be scheduled, and is linked when they join. Admins and main
 * accounts add, change and remove people (and change what someone can do by changing their ministries).
 */
export function RosterView({ canManage, today }: { canManage: boolean; today: string }) {
  const api = useScheduleApi();
  const { people, columns, events } = api.data;
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | null>(null);
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const sections = useMemo(() => sectionsOf(columns).map((s) => ({ ...s, columns: s.columns.filter((c) => c.kind === "people") })).filter((s) => s.columns.length > 0), [columns]);
  const history = useMemo(() => summarize(events, people, today || "1970-01-01", { periodDays: 365, choiceKey: null }), [events, people, today]);
  const shownSections = section === null ? sections : sections.filter((s) => (s.title || "Other") === section);
  const roleColumns = shownSections.flatMap((s) => s.columns);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => q === "" || personName(p).toLowerCase().includes(q))
      .map((p) => ({ person: p, can: roleColumns.map((c) => ability(p, c, history.get(p.id)?.byColumn.get(c.key)?.count ?? 0)) }))
      .filter((r) => section === null || r.can.some(Boolean))
      .sort((a, b) => personName(a.person).localeCompare(personName(b.person)));
  }, [people, query, roleColumns, section, history]);

  const cover = roleColumns.map((c, i) => rows.filter((r) => r.can[i] === "ministry").length);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person" aria-label="Find a person" className="field min-w-0 flex-1 sm:max-w-xs" autoComplete="off" />
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {[null, ...sections.map((s) => s.title || "Other")].map((s) => (
            <button key={s ?? "all"} type="button" aria-pressed={section === s} onClick={() => setSection(s)} className={`btn ${section === s ? "btn-primary" : ""}`}>
              {s ?? "Everyone"}
            </button>
          ))}
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary ml-auto" onClick={() => setEditing("new")}>
            Add a person
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">
        <span className="font-medium text-foreground">●</span> can do it (their ministry) · <span className="font-medium text-foreground">○</span> has served in it before. Change what someone can do by editing them. People without an account can be scheduled too, and are linked when they join.
      </p>

      {people.length === 0 ? (
        <EmptyState art="songs" title="No people yet">
          {canManage ? "Add the people who serve, then put them on the schedule." : "An admin adds the people who serve."}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState art="search" title="No one matches" />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className="sticky left-0 z-10 min-w-[11rem] border-b border-line bg-surface px-3 py-2 text-left align-bottom text-[0.6875rem] font-medium text-muted">
                  {rows.length} {rows.length === 1 ? "person" : "people"}
                </th>
                {shownSections.map((s) => (
                  <th key={s.title || "other"} colSpan={s.columns.length} scope="colgroup" className="border-l border-line px-1.5 pt-2 text-center text-[0.625rem] font-semibold uppercase tracking-wider text-muted">
                    {s.title}
                  </th>
                ))}
                {canManage && <th rowSpan={2} scope="col" className="w-[8.5rem] border-b border-l border-line" />}
              </tr>
              <tr>
                {shownSections.map((s) =>
                  s.columns.map((c, i) => (
                    <th key={c.key} scope="col" className={`min-w-[4.25rem] border-b border-line px-1.5 pb-1.5 text-center text-[0.6875rem] font-medium leading-tight text-muted ${i === 0 ? "border-l" : ""}`}>
                      {c.label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, can }) => (
                <tr key={person.id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="sticky left-0 bg-surface px-3 py-1.5 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <Avatar person={person} size={24} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium leading-tight">{personName(person)}</span>
                        <span className="block text-[0.6875rem] leading-4 text-muted">{person.user_id ? "Has an account" : "No account yet"}</span>
                      </span>
                    </span>
                  </th>
                  {roleColumns.map((c, i) => {
                    const edge = shownSections.some((s) => s.columns[0] === c) ? "border-l border-line" : "";
                    const served = history.get(person.id)?.byColumn.get(c.key)?.count ?? 0;
                    return (
                      <td key={c.key} className={`px-1.5 py-1.5 text-center ${edge}`} title={can[i] === "ministry" ? `Can do ${c.label.toLowerCase()}` : can[i] === "served" ? `Has served on ${c.label.toLowerCase()} ${served}×` : undefined}>
                        {can[i] === "ministry" ? <span aria-label={`Can do ${c.label}`}>●</span> : can[i] === "served" ? <span className="text-muted" aria-label={`Has served on ${c.label}`}>○</span> : null}
                      </td>
                    );
                  })}
                  {canManage && (
                    <td className="border-l border-line px-2 py-1.5 text-right">
                      {removing === person.id ? (
                        <span className="flex items-center justify-end gap-1.5 text-xs">
                          <button
                            type="button"
                            className="btn border-[#dc2626] bg-[#dc2626] px-2 text-xs text-white hover:!bg-[#b91c1c]"
                            onClick={() => {
                              setRemoving(null);
                              api.deletePerson(person);
                            }}
                          >
                            Remove
                          </button>
                          <button type="button" className="btn px-2 text-xs" onClick={() => setRemoving(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <span className="flex justify-end gap-1">
                          <button type="button" className="btn btn-quiet px-2 text-xs" onClick={() => setEditing(person)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-quiet px-2 text-xs hover:!text-[#dc2626] disabled:opacity-40"
                            disabled={!!person.user_id}
                            title={person.user_id ? "This person has an account. Remove them from the church on the Team page." : "Take them off the list and every day"}
                            onClick={() => setRemoving(person.id)}
                          >
                            Remove
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-hover/40">
                <th scope="row" className="sticky left-0 bg-hover/40 px-3 py-1.5 text-left text-[0.6875rem] font-medium text-muted">
                  Can do it
                </th>
                {roleColumns.map((c, i) => (
                  <td key={c.key} className={`px-1.5 py-1.5 text-center text-xs tabular-nums ${cover[i] === 0 ? "font-semibold text-[#dc2626]" : "text-muted"} ${shownSections.some((s) => s.columns[0] === c) ? "border-l border-line" : ""}`} title={cover[i] === 0 ? `No one is listed for ${c.label.toLowerCase()}` : undefined}>
                    {cover[i]}
                  </td>
                ))}
                {canManage && <td className="border-l border-line" />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Modal open={editing !== null} title={editing === "new" ? "Add a person" : "Change person"} onClose={() => setEditing(null)}>
        <PersonFields person={editing === "new" ? null : editing} people={people} onClose={() => setEditing(null)} />
      </Modal>
    </div>
  );
}
