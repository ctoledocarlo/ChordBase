"use client";

import { Fragment } from "react";
import { dayNumber, monthShort, onSlot, relativeDay, timeText, weekdayShort, type Person, type Slot } from "@/lib/schedule";
import { sectionsOf, type ScheduleColumn } from "@/lib/schedule-columns";
import type { LinkedSetlist } from "@/lib/schedule-data";
import { FieldControl, RoleSlot, type Insight, type Target } from "./schedule-bits";
import { SetlistLinks, type SetlistChoice } from "./setlist-link";

const monthOf = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

/**
 * The schedule as a clean table: a row for each Sunday or event, a column for each role under its heading. It is made to
 * fit the page without sideways scrolling: names are short ("Maria R."), a cell is just text until it is pressed, and
 * pressing it chooses someone, or someone else, or takes them off. Choice and text columns are edited in place, the
 * setlist for the day is in the last column, and the headings stay at the top while scrolling.
 */
export function ScheduleTable({
  slots,
  columns,
  linksByEvent,
  setlists,
  people,
  myPersonId,
  today,
  insight,
  canChange,
  onEdit,
  onAddRole,
  highlight,
  scrolls,
}: {
  slots: Slot[];
  columns: ScheduleColumn[];
  linksByEvent: Map<string, LinkedSetlist[]>;
  setlists: SetlistChoice[];
  people: Map<string, Person>;
  myPersonId: string | null;
  today: string;
  insight: Insight;
  canChange: (slot: Slot) => boolean;
  onEdit: (slot: Slot) => void;
  /** For people who may change the columns: opens the screen that adds one. */
  onAddRole?: () => void;
  /** A date to mark for a moment after jumping to it. */
  highlight: string | null;
  /** On a window too narrow for the columns, the table scrolls sideways rather than squeezing. */
  scrolls: boolean;
}) {
  const sections = sectionsOf(columns);
  const all = sections.flatMap((s) => s.columns);
  const details = all.filter((c) => c.kind !== "people");
  const roles = sections.map((s) => ({ ...s, columns: s.columns.filter((c) => c.kind === "people") })).filter((s) => s.columns.length > 0);
  const roleCount = roles.reduce((n, s) => n + s.columns.length, 0);
  const targetOf = (s: Slot): Target => (s.id ? { eventId: s.id } : { sunday: s.date });
  const span = 2 + details.length + roleCount;
  const head = "bg-surface text-left text-[0.6875rem] font-medium text-muted";

  return (
    <div className={`rounded-xl border border-line bg-surface ${scrolls ? "overflow-x-auto" : ""}`}>
      <table className={`w-full table-fixed border-collapse text-sm ${scrolls ? "min-w-[64rem]" : ""}`}>
        <colgroup>
          <col style={{ width: "7rem" }} />
          {details.map((c) => (
            <col key={c.key} style={{ width: "7rem" }} />
          ))}
          {roles.flatMap((s) => s.columns).map((c) => (
            <col key={c.key} />
          ))}
          <col style={{ width: "9.5rem" }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} scope="col" className={`sticky top-0 z-10 border-b border-line px-3 py-2 align-bottom ${head}`}>
              Day
            </th>
            {details.length > 0 && <th colSpan={details.length} scope="colgroup" className={`sticky top-0 z-10 px-1.5 pt-2 ${head}`} />}
            {roles.map((s) => (
              <th key={s.title || "other"} colSpan={s.columns.length} scope="colgroup" className={`sticky top-0 z-10 border-l border-line px-1.5 pt-2 text-[0.625rem] font-semibold uppercase tracking-wider ${head}`}>
                {s.title}
              </th>
            ))}
            <th rowSpan={2} scope="col" className={`sticky top-0 z-10 border-b border-l border-line px-3 py-2 align-bottom ${head}`}>
              Setlist
            </th>
          </tr>
          <tr>
            {details.map((c) => (
              <th key={c.key} scope="col" className={`sticky top-[1.6rem] z-10 border-b border-line px-1.5 pb-1.5 ${head}`}>
                {c.label}
              </th>
            ))}
            {roles.map((s) =>
              s.columns.map((c, i) => (
                <th key={c.key} scope="col" className={`sticky top-[1.6rem] z-10 border-b border-line px-1.5 pb-1.5 ${i === 0 ? "border-l" : ""} ${head}`}>
                  <span className="block break-words leading-tight">{c.label}</span>
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, i) => {
            const mine = onSlot(slot, myPersonId);
            const past = slot.date < today;
            const newMonth = i === 0 || monthOf(slot.date) !== monthOf(slots[i - 1].date);
            const target = targetOf(slot);
            const linked = slot.id ? (linksByEvent.get(slot.id) ?? []) : [];
            const sub = [slot.kind === "event" ? slot.title : null, slot.time ? timeText(slot.time) : null, slot.location || null].filter(Boolean).join(" · ");
            return (
              <Fragment key={slot.id ?? `sunday-${slot.date}`}>
                {newMonth && (
                  <tr>
                    <th colSpan={span} scope="colgroup" className="border-b border-line bg-hover/50 px-3 py-1 text-left text-xs font-semibold text-muted">
                      {monthOf(slot.date)}
                    </th>
                  </tr>
                )}
                <tr id={`slot-${slot.date}`} className={`group border-b border-line last:border-b-0 ${highlight === slot.date ? "bg-accent/10" : ""} ${past ? "opacity-70" : ""}`}>
                  <th scope="row" className={`px-3 py-1.5 text-left align-top font-normal ${mine ? "shadow-[inset_3px_0_0_var(--accent)]" : ""}`}>
                    <span className="block font-medium leading-tight">
                      {weekdayShort(slot.date)}, {monthShort(slot.date)} {dayNumber(slot.date)}
                    </span>
                    <span className="block truncate text-[0.6875rem] leading-4 text-muted" title={sub || relativeDay(slot.date, today)}>
                      {sub || relativeDay(slot.date, today)}
                    </span>
                  </th>
                  {details.map((c) => (
                    <td key={c.key} className="px-0.5 py-1 align-top">
                      <FieldControl column={c} target={target} value={slot.fields[c.key] ?? ""} bare />
                    </td>
                  ))}
                  {roles.map((s) =>
                    s.columns.map((c, k) => (
                      <td key={c.key} className={`px-0.5 py-1 align-top ${k === 0 ? "border-l border-line" : ""}`}>
                        <RoleSlot column={c} target={target} assignments={slot.assignments} people={people} myPersonId={myPersonId} insight={insight} variant="cell" />
                      </td>
                    )),
                  )}
                  <td className="border-l border-line px-2 py-1.5 align-top">
                    <div className="flex items-center justify-between gap-2" data-tour="schedule-setlist">
                      <div className="min-w-0 flex-1">
                        <SetlistLinks target={target} date={slot.date} linked={linked} choices={setlists} narrow />
                      </div>
                      {canChange(slot) && (
                        <button type="button" className="flex-none text-[0.6875rem] text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={() => onEdit(slot)} aria-label={`Edit ${slot.title}, ${slot.date}`}>
                          {slot.id ? "Edit" : "Details"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {onAddRole && (
        <div className="border-t border-line px-3 py-1.5">
          <button type="button" className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={onAddRole}>
            + Add a role
          </button>
        </div>
      )}
    </div>
  );
}
