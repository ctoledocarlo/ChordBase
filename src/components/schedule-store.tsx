"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import * as actions from "@/app/(app)/schedule/actions";
import type { ScheduleResult } from "@/app/(app)/schedule/actions";
import type { Person } from "@/lib/schedule";
import * as change from "@/lib/schedule-change";
import { isTemp, sundayOf, tempId, type ColumnDraft, type EventInput, type ScheduleData, type Target } from "@/lib/schedule-change";
import { useToast } from "./toast";

/**
 * The schedule as the page shows it, and every way to change it. A change is shown at once, and the server is asked to
 * make it in the background, one change at a time and in order. If the server says no, a message says why and the page
 * goes back to what the server has. When the changes have all been made, the page looks once more, so what it shows is
 * what is saved (the change log and the counts included).
 */
export type ScheduleApi = {
  data: ScheduleData;
  /** True while changes are still being saved. */
  saving: boolean;
  assign: (target: Target, person: Person, role: string) => void;
  unassign: (assignmentId: string) => void;
  setField: (target: Target, key: string, value: string) => void;
  linkSetlist: (setlist: { id: string; name: string; service_date: string | null }, target: Target) => void;
  unlinkSetlist: (setlistId: string) => void;
  addEvent: (input: EventInput) => void;
  updateEvent: (id: string, input: EventInput) => void;
  /** The details of a Sunday that may not be saved yet. */
  updateSunday: (date: string, input: EventInput) => void;
  deleteEvent: (id: string, title: string) => void;
  addPerson: (first: string, last: string, ministries: string[]) => void;
  updatePerson: (id: string, first: string, last: string, ministries: string[]) => void;
  deletePerson: (person: Person) => void;
  addColumn: (draft: ColumnDraft) => void;
  updateColumn: (id: string, draft: Omit<ColumnDraft, "kind">) => void;
  moveColumn: (id: string, direction: -1 | 1) => void;
  archiveColumn: (id: string, archived: boolean) => void;
  deleteColumn: (id: string) => void;
  /** Looks at the server again (after something that was saved the slow way, like an import). */
  reload: () => void;
};

const Context = createContext<ScheduleApi | null>(null);

export function useScheduleApi(): ScheduleApi {
  const api = useContext(Context);
  if (!api) throw new Error("useScheduleApi needs a ScheduleStore around it.");
  return api;
}

type Ids = Map<string, string>;
type Run = (ids: Ids) => Promise<ScheduleResult>;

/** The id the server knows, for one the page made up (or null when that never got saved). */
const real = (id: string, map: Ids): string | null => (isTemp(id) ? (map.get(id) ?? null) : id);
const NOT_SAVED: ScheduleResult = { error: "That wasn't saved, so this couldn't be done. Try again." };

/** What to ask the server about a target: the event, or the Sunday's date when it hasn't been saved yet. */
const asTarget = (t: Target, map: Ids): Target | null => {
  if ("sunday" in t) return t;
  const date = sundayOf(t.eventId);
  if (date && !map.has(t.eventId)) return { sunday: date };
  const id = real(t.eventId, map);
  return id ? { eventId: id } : null;
};

export function ScheduleStore({ initial, createdBy = null, children }: { initial: ScheduleData; createdBy?: string | null; children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [busy, setBusy] = useState(0);
  const pending = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const ids = useRef<Ids>(new Map());

  // What the server sends replaces what is shown, unless changes are still on their way (they would flicker away).
  if (initial !== seen) {
    setSeen(initial);
    if (busy === 0) setData(initial);
  }

  const reload = useCallback(() => router.refresh(), [router]);

  /** Shows a change now, and has the server make it, after the ones before it. */
  const commit = useCallback(
    (apply: (d: ScheduleData) => ScheduleData, run: Run, patch?: (d: ScheduleData, res: ScheduleResult) => ScheduleData, done?: string) => {
      setData(apply);
      pending.current++;
      setBusy((n) => n + 1);
      chain.current = chain.current.then(async () => {
        let res: ScheduleResult;
        try {
          res = await run(ids.current);
        } catch {
          res = { error: "That couldn't be saved. Check your connection and try again." };
        }
        if ("error" in res) toast(res.error, { tone: "error" });
        else {
          if (patch) setData((d) => patch(d, res));
          if (done) toast(done, { tone: "success" });
        }
        pending.current--;
        setBusy((n) => n - 1);
        // The last change has been saved (or refused): look again so the page matches the server.
        if (pending.current === 0) router.refresh();
      });
    },
    [router, toast],
  );

  const api = useMemo<ScheduleApi>(() => {
    /** After a Sunday or event was saved, its real id replaces the one the page made up. */
    const adoptEvent = (tmp: string, res: ScheduleResult, map: Ids) => (d: ScheduleData) => {
      if (!("ok" in res) || !res.event_id) return d;
      map.set(tmp, res.event_id);
      return change.renameEvent(d, tmp, res.event_id);
    };
    const tempFor = (t: Target) => ("eventId" in t ? t.eventId : change.tempSunday(t.sunday));

    return {
      data,
      saving: busy > 0,
      reload,

      assign(target, person, role) {
        const id = tempId("a");
        const tmpEvent = tempFor(target);
        commit(
          (d) => change.assign(d, target, person.id, role, id),
          async (map) => {
            const t = asTarget(target, map);
            const personId = real(person.id, map);
            if (!t || !personId) return NOT_SAVED;
            return "eventId" in t ? actions.assignPerson(t.eventId, personId, role) : actions.assignToSunday(t.sunday, personId, role);
          },
          (d, res) => {
            let next = adoptEvent(tmpEvent, res, ids.current)(d);
            if ("ok" in res && res.id) {
              ids.current.set(id, res.id);
              next = change.renameAssignment(next, id, res.id);
            }
            return next;
          },
        );
      },

      unassign(assignmentId) {
        commit(
          (d) => change.unassign(d, assignmentId),
          async (map) => {
            const id = real(assignmentId, map);
            return id ? actions.unassign(id) : NOT_SAVED;
          },
        );
      },

      setField(target, key, value) {
        const tmpEvent = tempFor(target);
        commit(
          (d) => change.setField(d, target, key, value),
          async (map) => {
            const t = asTarget(target, map);
            if (!t) return NOT_SAVED;
            return "eventId" in t ? actions.setField(t.eventId, key, value) : actions.setFieldOnSunday(t.sunday, key, value);
          },
          (d, res) => adoptEvent(tmpEvent, res, ids.current)(d),
        );
      },

      linkSetlist(setlist, target) {
        const tmpEvent = tempFor(target);
        commit(
          (d) => change.linkSetlist(d, target, setlist),
          async (map) => {
            const t = asTarget(target, map);
            return t ? actions.linkSetlist(setlist.id, t) : NOT_SAVED;
          },
          (d, res) => adoptEvent(tmpEvent, res, ids.current)(d),
        );
      },

      unlinkSetlist(setlistId) {
        commit(
          (d) => change.unlinkSetlist(d, setlistId),
          () => actions.unlinkSetlist(setlistId),
        );
      },

      addEvent(input) {
        const id = tempId("e");
        commit(
          (d) => change.addEvent(d, id, input, createdBy),
          () => actions.addEvent(input.title, input.date, input.time, input.location, input.notes),
          (d, res) => adoptEvent(id, res, ids.current)(d),
        );
      },

      updateEvent(id, input) {
        commit(
          (d) => change.updateEvent(d, id, input),
          async (map) => {
            const eventId = real(id, map);
            return eventId ? actions.updateEvent(eventId, input.title, input.date, input.time, input.location, input.notes) : NOT_SAVED;
          },
        );
      },

      updateSunday(date, input) {
        const tmp = change.tempSunday(date);
        commit(
          (d) => change.updateSunday(d, date, input),
          async () => {
            const made = await actions.ensureSunday(date);
            if ("error" in made) return made;
            const res = await actions.updateEvent(made.event_id ?? "", "Sunday service", date, input.time, input.location, input.notes);
            return "ok" in res ? { ...res, event_id: made.event_id } : res;
          },
          (d, res) => adoptEvent(tmp, res, ids.current)(d),
        );
      },

      deleteEvent(id, title) {
        commit(
          (d) => change.deleteEvent(d, id),
          async (map) => {
            const eventId = real(id, map);
            return eventId ? actions.deleteEvent(eventId) : NOT_SAVED;
          },
          undefined,
          `“${title}” was removed.`,
        );
      },

      addPerson(first, last, ministries) {
        const id = tempId("p");
        commit(
          (d) => change.addPerson(d, { id, first_name: first.trim(), last_name: last.trim(), ministries, user_id: null }),
          () => actions.addPerson(first, last, ministries),
          (d, res) => {
            if (!("ok" in res) || !res.person_id) return d;
            ids.current.set(id, res.person_id);
            return change.renamePerson(d, id, res.person_id);
          },
        );
      },

      updatePerson(id, first, last, ministries) {
        commit(
          (d) => change.updatePerson(d, id, { first_name: first.trim(), last_name: last.trim(), ministries }),
          async (map) => {
            const personId = real(id, map);
            return personId ? actions.updatePerson(personId, first, last, ministries) : NOT_SAVED;
          },
        );
      },

      deletePerson(person) {
        commit(
          (d) => change.deletePerson(d, person.id),
          async (map) => {
            const personId = real(person.id, map);
            return personId ? actions.deletePerson(personId) : NOT_SAVED;
          },
          undefined,
          `${person.first_name} ${person.last_name}`.trim() + " was taken off the list.",
        );
      },

      addColumn(draft) {
        const id = tempId("c");
        commit(
          (d) => change.addColumn(d, id, draft),
          () => actions.addColumn(draft),
          (d, res) => {
            if (!("ok" in res) || !res.id || !res.key) return d;
            ids.current.set(id, res.id);
            return change.renameColumn(d, id, { id: res.id, key: res.key });
          },
        );
      },

      updateColumn(id, draft) {
        commit(
          (d) => change.updateColumn(d, id, draft),
          async (map) => {
            const columnId = real(id, map);
            return columnId ? actions.updateColumn(columnId, draft) : NOT_SAVED;
          },
        );
      },

      moveColumn(id, direction) {
        commit(
          (d) => change.moveColumn(d, id, direction),
          async (map) => {
            const columnId = real(id, map);
            return columnId ? actions.moveColumn(columnId, direction) : NOT_SAVED;
          },
        );
      },

      archiveColumn(id, archived) {
        commit(
          (d) => change.archiveColumn(d, id, archived),
          async (map) => {
            const columnId = real(id, map);
            return columnId ? actions.archiveColumn(columnId, archived) : NOT_SAVED;
          },
        );
      },

      deleteColumn(id) {
        commit(
          (d) => change.deleteColumn(d, id),
          async (map) => {
            const columnId = real(id, map);
            return columnId ? actions.deleteColumn(columnId) : NOT_SAVED;
          },
        );
      },
    };
  }, [data, busy, commit, reload, createdBy]);

  return <Context.Provider value={api}>{children}</Context.Provider>;
}
