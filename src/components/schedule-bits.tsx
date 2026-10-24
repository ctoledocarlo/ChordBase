"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { byRole, hueFor, initials, personName, shortPersonName, type Assignment, type Person } from "@/lib/schedule";
import { activeColumns, sectionsOf, suitsColumn, type ScheduleColumn } from "@/lib/schedule-columns";
import { agoText, type PersonSummary } from "@/lib/schedule-stats";
import type { Target } from "@/lib/schedule-change";
import { useScheduleApi } from "./schedule-store";

export type { Target };

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

/** What the pickers know about how much and how recently people have served. */
export type Insight = { summaries: Map<string, PersonSummary>; today: string };

const NEVER = 100_000;

/** "last on drums 3 weeks ago" for the picker: this column first, then anything. */
function hintFor(summary: PersonSummary | undefined, column: ScheduleColumn, today: string): { text: string; busy: boolean; rank: number } {
  if (!summary) return { text: "", busy: false, rank: NEVER };
  const here = summary.byColumn.get(column.key)?.last;
  const busy = summary.soon >= 3 || summary.run >= 3;
  if (here) return { text: `${column.label}: ${agoText(Math.max(0, Math.round((Date.parse(today) - Date.parse(here)) / 86_400_000)))}`, busy, rank: summary.daysSince ?? NEVER };
  if (summary.last && summary.daysSince !== null) return { text: `Last served ${agoText(summary.daysSince)}`, busy, rank: summary.daysSince };
  return { text: "Not scheduled yet", busy, rank: NEVER };
}

/**
 * Choosing a person for a column: a panel with search, "Me" first, then the people who usually serve there (their
 * ministry fits, or they have served in it before), then everyone else. Each name says when they last served, and the
 * people who have been off the longest come first. People already in the column are left out.
 */
function PersonPicker({
  column,
  people,
  taken,
  myPersonId,
  insight,
  anchor,
  replacing,
  onRemove,
  onPick,
  onClose,
}: {
  column: ScheduleColumn;
  people: Person[];
  taken: Set<string>;
  myPersonId: string | null;
  insight?: Insight;
  anchor: DOMRect;
  /** Who is on the column now, when choosing someone else to take their place. */
  replacing?: string;
  /** Takes the person off the column (offered when someone is on it). */
  onRemove?: () => void;
  onPick: (person: Person) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // Closes on a click outside, Escape, or scrolling (the panel is fixed to where the button was).
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const today = insight?.today ?? "";
  const { suggested, others } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const free = people.filter((p) => !taken.has(p.id) && (q === "" || personName(p).toLowerCase().includes(q)));
    const rested = (a: Person, b: Person) => hintFor(insight?.summaries.get(b.id), column, today).rank - hintFor(insight?.summaries.get(a.id), column, today).rank || personName(a).localeCompare(personName(b));
    const fits = (p: Person) => suitsColumn(column, p.ministries) || (insight?.summaries.get(p.id)?.byColumn.get(column.key)?.count ?? 0) > 0;
    return { suggested: free.filter(fits).sort(rested), others: free.filter((p) => !fits(p)).sort(rested) };
  }, [people, taken, query, column, insight, today]);
  const me = myPersonId ? people.find((p) => p.id === myPersonId && !taken.has(p.id)) : undefined;

  const row = (p: Person) => {
    const hint = insight ? hintFor(insight.summaries.get(p.id), column, today) : null;
    return (
      <li key={p.id}>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover" onClick={() => onPick(p)}>
          <Avatar person={p} size={22} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{personName(p)}</span>
            {hint?.text && <span className="block truncate text-[0.6875rem] text-muted">{hint.text}</span>}
          </span>
          {hint?.busy && <span className="flex-none rounded-full border border-line px-1.5 text-[0.625rem] text-muted">busy</span>}
          {p.user_id === null && <span className="flex-none text-[0.6875rem] text-muted">no account</span>}
        </button>
      </li>
    );
  };

  // Below the button when there is room, above it when not; never off the sides.
  const width = 288;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const below = window.innerHeight - anchor.bottom;
  const style: React.CSSProperties = below >= 340 || below >= anchor.top ? { top: anchor.bottom + 4, left, width } : { bottom: window.innerHeight - anchor.top + 4, left, width };

  return (
    <div ref={box} role="dialog" aria-label={`Add to ${column.label}`} style={style} className="fixed z-50 rounded-xl border border-line bg-surface p-2 shadow-xl">
      {replacing && (
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5 text-xs text-muted">
          <span className="min-w-0 truncate">Replacing {replacing}</span>
          {onRemove && (
            <button type="button" className="flex-none rounded px-1.5 py-0.5 text-foreground underline hover:bg-hover" onClick={onRemove}>
              Take off
            </button>
          )}
        </div>
      )}
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" aria-label="Search people" className="field field-sm" autoComplete="off" />
      {me && (
        <button type="button" className="mt-1.5 flex w-full items-center gap-2 rounded-md border border-line px-2 py-1.5 text-left text-sm font-medium hover:bg-hover" onClick={() => onPick(me)}>
          <Avatar person={me} size={22} /> Put me on ({personName(me)})
        </button>
      )}
      <div className="mt-1.5 max-h-72 overflow-y-auto">
        {suggested.length > 0 && (
          <>
            <p className="px-2 pb-0.5 pt-1 text-[0.6875rem] font-medium uppercase tracking-wide text-muted">Usually {column.label.toLowerCase()}{insight ? " · rested first" : ""}</p>
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

/**
 * One people column at an event. A column holds one person: "+ Add" chooses someone, and pressing the name chooses
 * someone else instead (they replace the first). The cross takes the person off. People who are already on another
 * column that day are not offered, because no one is in two places at a service.
 */
export function RoleSlot({
  column,
  target,
  assignments,
  people,
  myPersonId,
  insight,
  variant = "chip",
}: {
  column: ScheduleColumn;
  target: Target;
  assignments: Assignment[];
  people: Map<string, Person>;
  myPersonId: string | null;
  insight?: Insight;
  /** "cell" is the plain text form for the table: a short name you press to change. */
  variant?: "chip" | "cell";
}) {
  const api = useScheduleApi();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const mine = byRole(assignments, people).get(column.key) ?? [];
  const peopleList = useMemo(() => [...people.values()].sort((a, b) => personName(a).localeCompare(personName(b))), [people]);
  // Everyone already on this day, in any column.
  const taken = new Set(assignments.map((a) => a.person_id));

  // Shown at once; the server is asked in the background.
  function add(person: Person) {
    setAnchor(null);
    api.assign(target, person, column.key);
  }

  function remove(a: Assignment) {
    api.unassign(a.id);
  }

  const open = (e: React.MouseEvent<HTMLButtonElement>) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect());

  if (variant === "cell") {
    const who = mine.map((m) => personName(m.person)).join(", ");
    const me = mine.some((m) => m.person.id === myPersonId);
    return (
      <div className="min-w-0">
        <button
          type="button"
          onClick={open}
          aria-expanded={!!anchor}
          aria-label={mine.length > 0 ? `${column.label}: ${who}. Change` : `Add someone to ${column.label}`}
          title={who || `Add someone to ${column.label}`}
          className={`block w-full truncate rounded px-1.5 py-1.5 text-left text-xs transition-colors hover:bg-hover ${me ? "font-semibold text-accent" : ""} ${mine.length === 0 ? "text-muted/40 hover:text-foreground" : ""}`}
        >
          {mine.length > 0 ? mine.map((m) => shortPersonName(m.person)).join(", ") : "+"}
        </button>
        {anchor && (
          <PersonPicker
            column={column}
            people={peopleList}
            taken={taken}
            myPersonId={myPersonId}
            insight={insight}
            anchor={anchor}
            replacing={mine.length > 0 ? who : undefined}
            onRemove={mine.length > 0 ? () => { setAnchor(null); remove(mine[0].assignment); } : undefined}
            onPick={add}
            onClose={() => setAnchor(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <span className="block truncate text-[0.6875rem] font-medium leading-4 text-muted">{column.label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {mine.map(({ assignment, person }) => (
          <span
            key={assignment.id}
            className={`inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-1 text-sm ${person.id === myPersonId ? "border-accent bg-accent/10" : "border-line bg-hover"}`}
          >
            <button type="button" onClick={open} aria-expanded={!!anchor} aria-label={`Replace ${personName(person)} on ${column.label}`} title="Choose someone else" className="flex min-w-0 items-center gap-1.5 rounded-full pr-1 hover:opacity-80">
              <Avatar person={person} size={22} />
              <span className="min-w-0 truncate">{personName(person)}</span>
            </button>
            <button
              type="button"
              onClick={() => remove(assignment)}
              aria-label={`Take ${personName(person)} off ${column.label}`}
              className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-muted hover:bg-line hover:text-foreground"
            >
              ×
            </button>
          </span>
        ))}
        {mine.length === 0 && (
          <button
            type="button"
            onClick={open}
            aria-expanded={!!anchor}
            aria-label={`Add someone to ${column.label}`}
            className="inline-flex h-7 items-center justify-center rounded-full border border-dashed border-line px-3 text-xs text-muted hover:border-foreground hover:text-foreground"
          >
            + Add
          </button>
        )}
        {anchor && (
          <PersonPicker column={column} people={peopleList} taken={taken} myPersonId={myPersonId} insight={insight} anchor={anchor} replacing={mine.length > 0 ? mine.map((m) => personName(m.person)).join(" and ") : undefined} onPick={add} onClose={() => setAnchor(null)} />
        )}
      </div>
    </div>
  );
}

// A choice or text value in a table cell: no box until it is pointed at.
const BARE = "block w-full min-w-0 truncate rounded bg-transparent px-1.5 py-1.5 text-xs outline-none transition-colors hover:bg-hover focus:bg-hover focus:ring-1 focus:ring-accent";

/** A choice column (a pick from a list) or a text column for an event. Saved as soon as it is picked or typed. */
export function FieldControl({ column, target, value, compact = false, bare = false }: { column: ScheduleColumn; target: Target; value: string; compact?: boolean; bare?: boolean }) {
  const api = useScheduleApi();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // A change from outside (another tab, an import) replaces what was typed.
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  // Shown at once; the server is asked in the background.
  function save(next: string) {
    if (next.trim() === value) return;
    api.setField(target, column.key, next);
  }

  const input =
    column.kind === "choice" ? (
      <select value={column.options.includes(value) || value === "" ? value : "__other"} onChange={(e) => save(e.target.value)} aria-label={column.label} className={bare ? BARE : "field field-sm max-w-[16rem]"}>
        <option value="">—</option>
        {column.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {value && !column.options.includes(value) && <option value="__other">{value}</option>}
      </select>
    ) : (
      <input
        value={draft}
        maxLength={200}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => save(draft)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label={column.label}
        placeholder="—"
        className={bare ? BARE : "field field-sm max-w-[16rem]"}
      />
    );

  if (bare) return input;

  return (
    <label className={`flex min-w-0 items-center gap-2 ${compact ? "" : "py-1"}`}>
      <span className={`flex-none text-xs font-medium text-muted ${compact ? "" : "w-[7.5rem] break-words"}`}>{column.label}</span>
      {input}
    </label>
  );
}

/**
 * All the columns of an event under their headings, packed so a whole day fits in as little height as possible: each
 * heading is a block, and a heading with three or more columns lays them out two across. The choice and text columns
 * come first as details unless `details` is false (the schedule puts them in the card's header). Optional people columns
 * appear when they have someone, or when asked for. `onAddRole` (for those who may change the columns) adds a "+ Add a
 * role" link that makes a custom one. `layout` 1 stacks everything in one column (for a narrow panel).
 */
export function RoleGrid({
  target,
  columns,
  fields = {},
  assignments,
  people,
  myPersonId,
  insight,
  layout = 2,
  details = true,
  onAddRole,
}: {
  target: Target;
  columns: ScheduleColumn[];
  fields?: Record<string, string>;
  assignments: Assignment[];
  people: Map<string, Person>;
  myPersonId: string | null;
  insight?: Insight;
  layout?: 1 | 2;
  details?: boolean;
  onAddRole?: () => void;
}) {
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const filled = new Set(assignments.map((a) => a.role));
  const active = activeColumns(columns);
  const shown = (c: ScheduleColumn) => !c.optional || filled.has(c.key) || asked.has(c.key);
  const detailColumns = details ? active.filter((c) => c.kind !== "people") : [];
  const hiddenOptional = active.filter((c) => c.kind === "people" && !shown(c));
  const sections = sectionsOf(active.filter((c) => c.kind === "people" && shown(c)));

  return (
    <div className="space-y-2">
      {detailColumns.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {detailColumns.map((c) => (
            <FieldControl key={c.key} column={c} target={target} value={fields[c.key] ?? ""} compact />
          ))}
        </div>
      )}
      <div className={layout === 2 ? "flex flex-wrap items-start gap-x-6 gap-y-3" : "space-y-3"}>
        {sections.map((s) => (
          <div key={s.title || "other"}>
            {s.title && <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted/80">{s.title}</p>}
            <div className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: `repeat(${layout === 2 && s.columns.length >= 3 ? 2 : 1}, minmax(0, 10rem))` }}>
              {s.columns.map((c) => (
                <RoleSlot key={c.key} column={c} target={target} assignments={assignments} people={people} myPersonId={myPersonId} insight={insight} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {(hiddenOptional.length > 0 || onAddRole) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {hiddenOptional.map((c) => (
            <button key={c.key} type="button" className="underline hover:text-foreground" onClick={() => setAsked((s) => new Set(s).add(c.key))}>
              + {c.label}
            </button>
          ))}
          {onAddRole && (
            <button type="button" className="underline hover:text-foreground" onClick={onAddRole}>
              + Add a role
            </button>
          )}
        </p>
      )}
    </div>
  );
}
