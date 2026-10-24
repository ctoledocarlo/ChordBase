"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { assignPerson, assignToSunday, unassign } from "@/app/(app)/schedule/actions";
import { byRole, hueFor, initials, personName, type Assignment, type Person } from "@/lib/schedule";
import { ROLE_GROUPS, SCHEDULE_ROLES, roleInfo, suitsRole, type RoleInfo, type ScheduleRole } from "@/lib/schedule-roles";
import { useToast } from "./toast";

/** A round badge with someone's initials, in a colour that stays the same for them. */
export function Avatar({ person, size = 24 }: { person: Pick<Person, "id" | "first_name" | "last_name">; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex flex-none items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), backgroundColor: `hsl(${hueFor(person.id)} 48% 42%)` }}
    >
      {initials(person)}
    </span>
  );
}

/**
 * Choosing a person for a role: a small panel with search, "Me" first, then the people whose ministry fits the role,
 * then everyone else. People already in the role are left out.
 */
function PersonPicker({
  role,
  people,
  taken,
  myPersonId,
  onPick,
  onClose,
}: {
  role: RoleInfo;
  people: Person[];
  taken: Set<string>;
  myPersonId: string | null;
  onPick: (person: Person) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // Closes on a click outside, or Escape.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const { suggested, others } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const free = people.filter((p) => !taken.has(p.id) && (q === "" || personName(p).toLowerCase().includes(q)));
    return { suggested: free.filter((p) => suitsRole(role.id, p.ministries)), others: free.filter((p) => !suitsRole(role.id, p.ministries)) };
  }, [people, taken, query, role.id]);
  const me = myPersonId ? people.find((p) => p.id === myPersonId && !taken.has(p.id)) : undefined;

  const row = (p: Person) => (
    <li key={p.id}>
      <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover" onClick={() => onPick(p)}>
        <Avatar person={p} size={22} />
        <span className="min-w-0 flex-1 truncate">{personName(p)}</span>
        {p.user_id === null && <span className="flex-none text-[0.6875rem] text-muted">no account</span>}
      </button>
    </li>
  );

  return (
    <div ref={box} role="dialog" aria-label={`Add to ${role.label}`} className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl">
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" aria-label="Search people" className="field field-sm" autoComplete="off" />
      {me && (
        <button type="button" className="mt-1.5 flex w-full items-center gap-2 rounded-md border border-line px-2 py-1.5 text-left text-sm font-medium hover:bg-hover" onClick={() => onPick(me)}>
          <Avatar person={me} size={22} /> Put me on ({personName(me)})
        </button>
      )}
      <div className="mt-1.5 max-h-60 overflow-y-auto">
        {suggested.length > 0 && (
          <>
            <p className="px-2 pb-0.5 pt-1 text-[0.6875rem] font-medium uppercase tracking-wide text-muted">Usually serve as {role.label.toLowerCase()}</p>
            <ul>{suggested.map(row)}</ul>
          </>
        )}
        {others.length > 0 && (
          <>
            <p className="px-2 pb-0.5 pt-1 text-[0.6875rem] font-medium uppercase tracking-wide text-muted">{suggested.length > 0 ? "Everyone else" : "People"}</p>
            <ul>{others.map(row)}</ul>
          </>
        )}
        {suggested.length === 0 && others.length === 0 && <p className="px-2 py-3 text-sm text-muted">{people.length === 0 ? "No one is on the people list yet." : "No one left to add."}</p>}
      </div>
    </div>
  );
}

/** What puts people on and takes them off a service: the event it is for (or, for a Sunday with none yet, its date). */
export type Target = { eventId: string } | { sunday: string };

/** One role at an event: who is on it, with a button to add someone and a cross to take someone off. */
export function RoleSlot({
  role,
  target,
  assignments,
  people,
  myPersonId,
  onChanged,
  compact = false,
}: {
  role: RoleInfo;
  target: Target;
  assignments: Assignment[];
  people: Map<string, Person>;
  myPersonId: string | null;
  /** Called after a change has been saved, to load the new schedule. */
  onChanged: () => void;
  compact?: boolean;
}) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = byRole(assignments, people).get(role.id) ?? [];
  const peopleList = useMemo(() => [...people.values()].sort((a, b) => personName(a).localeCompare(personName(b))), [people]);
  const taken = new Set(mine.map((m) => m.person.id));

  async function add(person: Person) {
    setPicking(false);
    setBusy(true);
    const res = "eventId" in target ? await assignPerson(target.eventId, person.id, role.id) : await assignToSunday(target.sunday, person.id, role.id);
    setBusy(false);
    if ("error" in res) return toast(res.error, { tone: "error" });
    onChanged();
  }

  async function remove(a: Assignment, person: Person) {
    setBusy(true);
    const res = await unassign(a.id);
    setBusy(false);
    if ("error" in res) return toast(res.error, { tone: "error" });
    onChanged();
    void person;
  }

  return (
    <div className={`flex min-w-0 items-start gap-2 ${compact ? "py-1" : "py-1.5"}`}>
      <span className="w-[6.75rem] flex-none pt-1 text-xs font-medium text-muted">{role.label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {mine.map(({ assignment, person }) => (
          <span
            key={assignment.id}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-1.5 text-sm ${person.id === myPersonId ? "border-accent bg-accent/10" : "border-line bg-hover"}`}
          >
            <Avatar person={person} size={22} />
            <span className="min-w-0 truncate">{personName(person)}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(assignment, person)}
              aria-label={`Take ${personName(person)} off ${role.label}`}
              className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-muted hover:bg-line hover:text-foreground disabled:opacity-50"
            >
              ×
            </button>
          </span>
        ))}
        <span className="relative">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPicking((p) => !p)}
            aria-expanded={picking}
            aria-label={`Add someone to ${role.label}`}
            className={`inline-flex h-7 items-center rounded-full border border-dashed border-line px-2.5 text-xs text-muted hover:border-foreground hover:text-foreground disabled:opacity-50 ${mine.length === 0 ? "" : "w-7 justify-center px-0"}`}
          >
            {mine.length === 0 ? "+ Add" : "+"}
          </button>
          {picking && <PersonPicker role={role} people={peopleList} taken={taken} myPersonId={myPersonId} onPick={(p) => void add(p)} onClose={() => setPicking(false)} />}
        </span>
      </div>
    </div>
  );
}

/**
 * All the roles of an event: the vocals (song leader, with optional backup singers), the band by instrument, and media.
 * Backup singers and other instruments appear when they have people, or when asked for.
 */
export function RoleGrid({
  target,
  assignments,
  people,
  myPersonId,
  onChanged,
  columns = 2,
}: {
  target: Target;
  assignments: Assignment[];
  people: Map<string, Person>;
  myPersonId: string | null;
  onChanged: () => void;
  columns?: 1 | 2;
}) {
  const [asked, setAsked] = useState<Set<ScheduleRole>>(new Set());
  const filled = new Set(assignments.map((a) => a.role));
  const shown = (r: RoleInfo) => !r.optional || filled.has(r.id) || asked.has(r.id);
  const hiddenOptional = SCHEDULE_ROLES.filter((r) => !shown(r));

  return (
    <div>
      <div className={`grid gap-x-6 ${columns === 2 ? "md:grid-cols-2" : ""}`}>
        {ROLE_GROUPS.flatMap((g) => g.roles)
          .filter(shown)
          .map((role) => (
            <RoleSlot key={role.id} role={role} target={target} assignments={assignments} people={people} myPersonId={myPersonId} onChanged={onChanged} compact />
          ))}
      </div>
      {hiddenOptional.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {hiddenOptional.map((r) => (
            <button key={r.id} type="button" className="underline hover:text-foreground" onClick={() => setAsked((s) => new Set(s).add(r.id))}>
              + {roleInfo(r.id)?.plural}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
