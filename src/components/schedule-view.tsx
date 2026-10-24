"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { downloadFile, XLSX_TYPE } from "@/lib/download";
import { addDays, buildSlots, dayText, isoOf, onSlot, personName, thisOrNextSunday, type LogEntry, type Person, type ScheduleEvent, type Slot } from "@/lib/schedule";
import type { ScheduleColumn } from "@/lib/schedule-columns";
import type { LinkedSetlist } from "@/lib/schedule-data";
import { scheduleSheets } from "@/lib/schedule-grid";
import { daysBetween, summarize } from "@/lib/schedule-stats";
import { writeXlsx } from "@/lib/xlsx";
import { ChangeLog } from "./change-log";
import { ColumnManager } from "./column-manager";
import { EmptyState } from "./empty-state";
import { EventForm } from "./event-form";
import { RosterView } from "./roster-view";
import type { Insight } from "./schedule-bits";
import { ScheduleImport } from "./schedule-import";
import { ScheduleSidebar } from "./schedule-sidebar";
import { ScheduleStore, useScheduleApi } from "./schedule-store";
import { ScheduleTable } from "./schedule-table";
import type { SetlistChoice } from "./setlist-link";

type Tab = "schedule" | "people" | "log";

const MORE_WEEKS = 8;

/** Whether the window is wide enough for the side panel and for the table to fit without scrolling. */
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(min-width: 1024px)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

/** The browser's own idea of today (empty on the server, so nothing about dates is drawn until the page is live). */
function useToday(): string {
  return useSyncExternalStore(
    () => () => {},
    () => isoOf(new Date()),
    () => "",
  );
}

type Props = {
  people: Person[];
  events: ScheduleEvent[];
  columns: ScheduleColumn[];
  log: LogEntry[];
  /** Setlists linked to events, and the setlists a new link can be made to. */
  links: LinkedSetlist[];
  setlists: SetlistChoice[];
  myPersonId: string | null;
  myUserId: string | null;
  canManage: boolean;
};

/**
 * The schedule: every Sunday by default, with any events added in between, who is on each role, the roster of who can do
 * what, and a change log. Anyone in the church can put themselves or others on, and add an event; admins and main
 * accounts also change any event, manage the roster and the columns, and import from Excel. Every change shows at once
 * and is saved in the background.
 */
export function ScheduleView(props: Props) {
  const { people, events, columns, links, myUserId } = props;
  const initial = useMemo(() => ({ people, events, columns, links }), [people, events, columns, links]);
  return (
    <ScheduleStore initial={initial} createdBy={myUserId}>
      <Schedule {...props} />
    </ScheduleStore>
  );
}

function Schedule({ log, setlists, myPersonId, myUserId, canManage }: Props) {
  const router = useRouter();
  const api = useScheduleApi();
  const { people, events, columns, links } = api.data;
  const today = useToday();
  const [tab, setTab] = useState<Tab>("schedule");
  const [filterId, setFilterId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [managing, setManaging] = useState<false | "list" | "add">(false);
  const wide = useWide();
  const [weeks, setWeeks] = useState(MORE_WEEKS);
  const [showPast, setShowPast] = useState(false);
  const [form, setForm] = useState<Slot | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  // Someone else may have changed the schedule while this page sat in a tab: look again when it is brought back.
  useEffect(() => {
    let last = Date.now();
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 15_000) {
        last = Date.now();
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [router]);

  // The columns that have been used for something already, so importing never offers to hide them.
  const usedKeys = useMemo(() => new Set(events.flatMap((e) => [...e.assignments.map((a) => a.role), ...Object.keys(e.fields ?? {})])), [events]);
  const linksByEvent = useMemo(() => {
    const map = new Map<string, LinkedSetlist[]>();
    for (const l of links) map.set(l.event_id, [...(map.get(l.event_id) ?? []), l]);
    return map;
  }, [links]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const { slots, from, to } = useMemo(() => {
    if (!today) return { slots: [] as Slot[], from: "", to: "" };
    const first = showPast ? addDays(today, -56) : today;
    const last = addDays(thisOrNextSunday(today), weeks * 7 - 1);
    return { slots: buildSlots(events, first, last), from: first, to: last };
  }, [events, today, weeks, showPast]);

  const insight = useMemo<Insight>(() => ({ summaries: summarize(events, people, today || "1970-01-01", { periodDays: 91, choiceKey: null }), today }), [events, people, today]);
  const filtered = filterId ? people.find((p) => p.id === filterId) : undefined;
  const shown = filterId ? slots.filter((s) => onSlot(s, filterId)) : slots;

  /** Scrolls to a date on the schedule (showing more weeks first if it is further out) and marks it for a moment. */
  function jump(date: string) {
    if (date > to) setWeeks(Math.min(52, Math.ceil(daysBetween(today, date) / 7) + 1));
    if (date < from) setShowPast(true);
    setHighlight(date);
    setTimeout(() => document.getElementById(`slot-${date}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    setTimeout(() => setHighlight(null), 2500);
  }
  const canChange = (s: Slot) => canManage || (s.kind === "event" && !!myUserId && s.created_by === myUserId);

  function exportFile() {
    downloadFile(writeXlsx(scheduleSheets(slots, peopleById, columns)), `chordbase-schedule-${today}.xlsx`, XLSX_TYPE);
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "schedule", label: "Schedule" },
    { id: "people", label: "Roster", count: people.length },
    { id: "log", label: "Change log" },
  ];

  const panel = (
    <ScheduleSidebar
      events={events}
      people={people}
      columns={columns}
      today={today}
      onJump={(d) => {
        setTab("schedule");
        jump(d);
      }}
      onShowPerson={(id) => {
        setFilterId(id);
        setTab("schedule");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[88rem]" aria-busy={api.saving}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-muted">Every Sunday is here by default. Anyone can add an event in between, and put themselves or others on a role.</p>
        </div>
        <span aria-live="polite" className={`text-xs text-muted transition-opacity ${api.saving ? "opacity-100" : "opacity-0"}`}>
          Saving…
        </span>
      </div>

      <div role="tablist" data-tour="schedule-tabs" aria-label="Schedule sections" className="mt-5 flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`btn ${tab === t.id ? "btn-primary" : ""}`}>
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 opacity-70">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "schedule" && (
        <div className={`mt-4 lg:grid lg:items-start lg:gap-6 ${summaryOpen ? "lg:grid-cols-[minmax(0,1fr)_21rem]" : "lg:grid-cols-1"}`}>
          <div className="min-w-0">
            <div data-tour="schedule-toolbar" className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => setForm("new")}>
                Add an event
              </button>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm">
                <input type="checkbox" checked={!!myPersonId && filterId === myPersonId} onChange={(e) => setFilterId(e.target.checked ? myPersonId : null)} disabled={!myPersonId} />
                Only mine
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm">
                <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
                Show past weeks
              </label>
              <span className="ml-auto flex flex-wrap gap-2">
                <button type="button" className="btn hidden lg:inline-flex" aria-pressed={summaryOpen} onClick={() => setSummaryOpen((v) => !v)} title="The panel beside the schedule">
                  {summaryOpen ? "Hide summary" : "Show summary"}
                </button>
                {canManage && (
                  <button type="button" data-tour="schedule-columns" className="btn" onClick={() => setManaging("list")}>
                    Columns
                  </button>
                )}
                <button type="button" className="btn" onClick={exportFile} disabled={!today}>
                  Export to Excel
                </button>
                {canManage && (
                  <button type="button" data-tour="schedule-import" className="btn" onClick={() => setImporting(true)}>
                    Import from Excel
                  </button>
                )}
              </span>
            </div>

            {filtered && filterId !== myPersonId && (
              <p className="mt-3 flex items-center gap-2 text-sm">
                Showing only {personName(filtered)}’s dates
                <button type="button" className="btn btn-quiet px-2 text-xs" onClick={() => setFilterId(null)}>
                  Show everyone
                </button>
              </p>
            )}

            <button type="button" className="btn mt-3 w-full lg:hidden" aria-expanded={showPanel} onClick={() => setShowPanel((v) => !v)}>
              {showPanel ? "Hide the scheduler’s summary" : "Scheduler’s summary: open spots, who’s due, counts"}
            </button>
            <div className={`mt-3 lg:hidden ${showPanel ? "block" : "hidden"}`}>{showPanel && panel}</div>

            {!today ? null : shown.length === 0 ? (
              <EmptyState art="setlists" title={filterId ? (filterId === myPersonId ? "You're not on the schedule yet" : "Not on the schedule in this stretch") : "Nothing here yet"}>
                {filterId === myPersonId ? "Put yourself on a Sunday by pressing a role's cell and choosing “Put me on”, or ask someone to." : filterId ? "Show more weeks, or show everyone." : "Put someone on a role, or add an event."}
              </EmptyState>
            ) : (
              <div data-tour="schedule-table" className="mt-4">
                <ScheduleTable
                  slots={shown}
                  columns={columns}
                  linksByEvent={linksByEvent}
                  setlists={setlists}
                  people={peopleById}
                  myPersonId={myPersonId}
                  today={today}
                  insight={insight}
                  canChange={canChange}
                  onEdit={(s) => setForm(s)}
                  onAddRole={canManage ? () => setManaging("add") : undefined}
                  highlight={highlight}
                  scrolls={!wide}
                />
              </div>
            )}

            {today && (
              <div className="mt-6 flex justify-center">
                <button type="button" className="btn" onClick={() => setWeeks((w) => w + MORE_WEEKS)} disabled={weeks >= 52}>
                  Show {MORE_WEEKS} more weeks
                </button>
              </div>
            )}
            {today && <p className="mt-3 text-center text-xs text-muted">Showing {dayText(from, today)} to {dayText(to, today)}.</p>}
          </div>

          <aside data-tour="schedule-summary" className={summaryOpen ? "hidden lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:rounded-2xl" : "hidden"}>
            {today && wide && summaryOpen && panel}
          </aside>
        </div>
      )}

      {tab === "people" && (
        <div data-tour="schedule-roster" className="mt-5">
          <RosterView canManage={canManage} today={today} />
        </div>
      )}

      {tab === "log" && (
        <div className="mx-auto mt-5 max-w-4xl">
          {today && <ChangeLog log={log} today={today} />}
          {log.length >= 200 && <p className="mt-3 text-center text-xs text-muted">Showing the latest 200 changes.</p>}
        </div>
      )}

      <EventForm open={form !== null} editing={form === "new" ? null : form} defaultDate={today || isoOf(new Date())} onClose={() => setForm(null)} />
      <ScheduleImport open={importing} people={people} columns={columns} usedKeys={usedKeys} today={today} onClose={() => setImporting(false)} onImported={api.reload} />
      <ColumnManager open={managing !== false} adding={managing === "add"} columns={columns} onClose={() => setManaging(false)} />
    </div>
  );
}
