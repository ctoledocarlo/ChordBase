"use client";

import { useMemo, useState } from "react";
import { dayNumber, dayText, monthShort, personName, type Person, type ScheduleEvent } from "@/lib/schedule";
import { activeColumns, columnByKey, type ScheduleColumn } from "@/lib/schedule-columns";
import { agoText, DEFAULT_PERIOD, openSpots, PERIODS, sortSummaries, summarize, typeTotals, watchList, type Order, type PersonSummary } from "@/lib/schedule-stats";
import { Avatar } from "./schedule-bits";

const shortDate = (iso: string) => `${monthShort(iso)} ${dayNumber(iso)}`;

const names = (keys: string[], columns: Map<string, ScheduleColumn>) => keys.map((k) => columns.get(k)?.label ?? k).join(", ");

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3 last:border-b-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** One person's detail: when they are next on, what they have done in each column, and how they have been spread across the kinds of Sunday. */
function PersonDetail({
  summary,
  columns,
  choice,
  totals,
  today,
  periodLabel,
  onShow,
}: {
  summary: PersonSummary;
  columns: ScheduleColumn[];
  choice: ScheduleColumn | null;
  totals: Map<string, number>;
  today: string;
  periodLabel: string;
  onShow: () => void;
}) {
  const byKey = columnByKey(columns);
  const done = [...summary.byColumn.entries()].sort((a, b) => (b[1].last ?? "").localeCompare(a[1].last ?? ""));
  return (
    <div className="space-y-3 pb-1 pl-8 pr-1 text-xs">
      <p>
        {summary.next ? (
          <>
            <span className="text-muted">Next:</span> {dayText(summary.next.date, today)} · {names(summary.next.columns, byKey)}
            {summary.upcoming > 1 && <span className="text-muted"> (+{summary.upcoming - 1} more)</span>}
          </>
        ) : (
          <span className="text-muted">Not scheduled ahead.</span>
        )}
      </p>

      {done.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-muted">Every role, last time and how often</p>
          <ul className="space-y-0.5">
            {done.map(([key, h]) => (
              <li key={key} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{byKey.get(key)?.label ?? key}</span>
                <span className="flex-none text-muted">
                  {h.last ? `${shortDate(h.last)} · ${agoText(Math.round((Date.parse(today) - Date.parse(h.last)) / 86_400_000))}` : ""} · {h.inPeriod}× in {periodLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {choice && choice.options.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-muted">{choice.label}, last {periodLabel}</p>
          <ul className="space-y-0.5">
            {choice.options.map((o) => {
              const n = summary.byChoice.get(o) ?? 0;
              const last = summary.lastChoice.get(o);
              return (
                <li key={o} className="flex items-baseline justify-between gap-2">
                  <span className={`truncate ${n === 0 ? "text-muted" : ""}`}>{o}</span>
                  <span className="flex-none text-muted">
                    <strong className={`font-semibold ${n === 0 ? "" : "text-foreground"}`}>{n}×</strong>
                    {totals.get(o) ? ` of ${totals.get(o)}` : ""}
                    {last ? ` · last ${shortDate(last)}` : " · never"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button type="button" className="underline hover:text-foreground" onClick={onShow}>
        Show only their dates
      </button>
    </div>
  );
}

/**
 * What a scheduler wants beside the schedule: the coming services that still have empty roles, who is on a lot, and
 * every person with when they last served, how often lately and how they have been spread across the kinds of Sunday
 * (or whichever choice column is picked). It is worked out from the events already on the page.
 */
export function ScheduleSidebar({
  events,
  people,
  columns,
  today,
  onJump,
  onShowPerson,
}: {
  events: ScheduleEvent[];
  people: Person[];
  columns: ScheduleColumn[];
  today: string;
  /** Scrolls the schedule to that date. */
  onJump: (date: string) => void;
  onShowPerson: (personId: string) => void;
}) {
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [order, setOrder] = useState<Order>("rested");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const choices = useMemo(() => activeColumns(columns).filter((c) => c.kind === "choice"), [columns]);
  const [choiceKey, setChoiceKey] = useState<string | null>(null);
  const choice = choices.find((c) => c.key === choiceKey) ?? choices[0] ?? null;
  const days = PERIODS.find((p) => p.id === period)?.days ?? 91;
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? "3 months";
  const byKey = useMemo(() => columnByKey(columns), [columns]);

  const summaries = useMemo(() => summarize(events, people, today, { periodDays: days, choiceKey: choice?.key ?? null }), [events, people, today, days, choice]);
  const totals = useMemo(() => typeTotals(events, choice?.key ?? null, today, days), [events, choice, today, days]);
  const spots = useMemo(() => openSpots(events, columns, today), [events, columns, today]);
  const watch = useMemo(() => watchList(summaries), [summaries]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortSummaries([...summaries.values()].filter((s) => q === "" || personName(s.person).toLowerCase().includes(q)), order);
  }, [summaries, query, order]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Scheduler's summary">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-semibold leading-tight">Scheduler’s summary</h2>
        <p className="mt-0.5 text-xs text-muted">Worked out from the schedule as it is now.</p>
      </div>

      <Section title="Needs people" hint="Roles still empty in the next four weeks">
        {spots.length === 0 ? (
          <p className="text-sm text-muted">Every role for the next four weeks has someone.</p>
        ) : (
          <ul className="space-y-1">
            {spots.slice(0, 6).map(({ slot, missing }) => (
              <li key={slot.id ?? slot.date}>
                <button type="button" className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-hover" onClick={() => onJump(slot.date)}>
                  <span className="font-medium">{shortDate(slot.date)}</span>
                  {slot.kind === "event" && <span className="text-muted"> · {slot.title}</span>}
                  <span className="block truncate text-xs text-muted">
                    {missing.length} open: {missing.slice(0, 4).map((c) => c.label).join(", ")}
                    {missing.length > 4 ? `, +${missing.length - 4}` : ""}
                  </span>
                </button>
              </li>
            ))}
            {spots.length > 6 && <li className="px-2 text-xs text-muted">and {spots.length - 6} more days</li>}
          </ul>
        )}
      </Section>

      {watch.length > 0 && (
        <Section title="Going easy" hint="On a lot lately">
          <ul className="space-y-1">
            {watch.map((w) => (
              <li key={w.person.id} className="flex items-center gap-2 text-sm">
                <Avatar person={w.person} size={20} />
                <span className="min-w-0 flex-1 truncate">{personName(w.person)}</span>
                <span className="flex-none text-xs text-muted">{w.reason}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="People">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="sr-only">Order</span>
            <select value={order} onChange={(e) => setOrder(e.target.value as Order)} className="field field-sm" aria-label="Order people by">
              <option value="rested">Longest since served</option>
              <option value="busiest">Busiest</option>
              <option value="name">Name</option>
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Counting</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="field field-sm" aria-label="Count the last">
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  Last {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {choices.length > 1 && (
          <select value={choice?.key ?? ""} onChange={(e) => setChoiceKey(e.target.value)} className="field field-sm mt-2" aria-label="Break down by">
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                Break down by {c.label}
              </option>
            ))}
          </select>
        )}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person" aria-label="Find a person" className="field field-sm mt-2" autoComplete="off" />

        {choice && totals.size > 0 && (
          <p className="mt-2 text-xs text-muted">
            {choice.label}, last {periodLabel}: {[...totals.entries()].map(([k, n]) => `${k} ${n}`).join(" · ")}
          </p>
        )}

        {list.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{people.length === 0 ? "Add people on the Roster tab." : "No one by that name."}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {list.map((s) => {
              const expanded = open === s.person.id;
              return (
                <li key={s.person.id} className="py-1.5">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.person.id)} className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-hover">
                    <Avatar person={s.person} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{personName(s.person)}</span>
                      <span className="block truncate text-xs text-muted">
                        {s.last && s.daysSince !== null ? `${shortDate(s.last.date)} · ${names(s.last.columns, byKey)} · ${agoText(s.daysSince)}` : s.next ? "Not served yet" : "Never scheduled"}
                      </span>
                    </span>
                    <span className="flex-none text-right text-xs text-muted" title={`${s.inPeriod} in the last ${periodLabel}, ${s.upcoming} coming up`}>
                      <strong className="block text-sm font-semibold text-foreground">{s.inPeriod}×</strong>
                      {s.upcoming > 0 ? `+${s.upcoming} ahead` : ""}
                    </span>
                  </button>
                  {expanded && <PersonDetail summary={s} columns={columns} choice={choice} totals={totals} today={today} periodLabel={periodLabel} onShow={() => onShowPerson(s.person.id)} />}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          Counts are services served up to today in the last {periodLabel}; “ahead” is what is already scheduled.
        </p>
      </Section>
    </div>
  );
}
