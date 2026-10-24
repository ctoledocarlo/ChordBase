"use client";

import { useMemo, useState } from "react";
import { addPerson, deletePerson, updatePerson } from "@/app/(app)/schedule/actions";
import { MAX_NAME, describeMinistries } from "@/lib/ministries";
import { personName, type Person } from "@/lib/schedule";
import { EmptyState } from "./empty-state";
import { MinistryPicker } from "./ministry-picker";
import { Modal } from "./modal";
import { Avatar } from "./schedule-bits";
import { useToast } from "./toast";

function PersonFields({ person, onClose, onSaved }: { person: Person | null; onClose: () => void; onSaved: () => void }) {
  const [first, setFirst] = useState(person?.first_name ?? "");
  const [last, setLast] = useState(person?.last_name ?? "");
  const [ministries, setMinistries] = useState(person?.ministries ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = person ? await updatePerson(person.id, first, last, ministries) : await addPerson(first, last, ministries);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    onSaved();
    onClose();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
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
      <MinistryPicker value={ministries} onChange={setMinistries} disabled={busy} />
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
        <button type="submit" className="btn btn-primary" disabled={busy || !first.trim()}>
          {busy ? "Saving…" : person ? "Save" : "Add person"}
        </button>
      </div>
    </form>
  );
}

/**
 * Everyone who can be scheduled. A person with an account is linked to it; a person without one can still be put on
 * the schedule, and is linked when they join (the church's main account chooses). Admins and main accounts can add,
 * change and remove people.
 */
export function PeopleView({ people, canManage, onChanged }: { people: Person[]; canManage: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => q === "" || personName(p).toLowerCase().includes(q));
  }, [people, query]);

  async function remove(person: Person) {
    setBusy(true);
    const res = await deletePerson(person.id);
    setBusy(false);
    setRemoving(null);
    if ("error" in res) return toast(res.error, { tone: "error" });
    toast(`${personName(person)} was taken off the list.`, { tone: "success" });
    onChanged();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person" aria-label="Find a person" className="field min-w-0 flex-1 sm:max-w-xs" autoComplete="off" />
        <span className="text-sm text-muted">
          {people.length} {people.length === 1 ? "person" : "people"}
        </span>
        {canManage && (
          <button type="button" className="btn btn-primary ml-auto" onClick={() => setEditing("new")}>
            Add a person
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">
        People without an account can be scheduled too. When one of them joins, the church&apos;s main account links them, and they keep everything they were scheduled for.
      </p>

      {people.length === 0 ? (
        <EmptyState art="songs" title="No people yet">
          {canManage ? "Add the people who serve, then put them on the schedule." : "An admin adds the people who serve."}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState art="search" title="No one has that name" />
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <Avatar person={p} size={36} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{personName(p)}</span>
                  <span className={`flex-none rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide ${p.user_id ? "border-accent text-accent" : "border-line text-muted"}`}>
                    {p.user_id ? "Has an account" : "No account yet"}
                  </span>
                </p>
                <p className="text-sm text-muted">{describeMinistries(p.ministries) || "No ministry chosen"}</p>
              </div>
              {canManage &&
                (removing === p.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted">Take {personName(p)} off the list and every event?</span>
                    <button type="button" className="btn border-[#dc2626] bg-[#dc2626] text-white hover:!bg-[#b91c1c]" disabled={busy} onClick={() => void remove(p)}>
                      Yes, remove
                    </button>
                    <button type="button" className="btn" onClick={() => setRemoving(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-none gap-2">
                    <button type="button" className="btn" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet hover:!text-[#dc2626] disabled:opacity-40"
                      disabled={!!p.user_id}
                      title={p.user_id ? "This person has an account. Remove them from the church on the Team page." : undefined}
                      onClick={() => setRemoving(p.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} title={editing === "new" ? "Add a person" : "Change person"} onClose={() => setEditing(null)}>
        <PersonFields person={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={onChanged} />
      </Modal>
    </div>
  );
}
