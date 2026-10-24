import { describe, expect, it } from "vitest";
import type { Person, ScheduleEvent } from "./schedule";
import { STARTER_AS_COLUMNS } from "./schedule-columns";
import * as c from "./schedule-change";

const person = (id: string): Person => ({ id, first_name: id, last_name: "", ministries: [], user_id: null });
const sunday = (id: string, date: string): ScheduleEvent => ({ id, kind: "sunday", title: "Sunday service", starts_on: date, starts_at: null, location: "", notes: "", created_by: null, fields: {}, assignments: [] });
const data = (events: ScheduleEvent[] = []): c.ScheduleData => ({ events, people: [person("ana"), person("ben")], columns: STARTER_AS_COLUMNS, links: [] });

describe("showing a change at once", () => {
  it("puts a person on a column, replacing whoever was there", () => {
    const d1 = c.assign(data([sunday("s1", "2026-11-01")]), { eventId: "s1" }, "ana", "drums", "a1");
    const d2 = c.assign(d1, { eventId: "s1" }, "ben", "drums", "a2");
    expect(d2.events[0].assignments).toEqual([{ id: "a2", person_id: "ben", role: "drums", note: "" }]);
  });

  it("does not change what it was given", () => {
    const before = data([sunday("s1", "2026-11-01")]);
    c.assign(before, { eventId: "s1" }, "ana", "drums");
    expect(before.events[0].assignments).toEqual([]);
  });

  it("makes a Sunday that isn't saved yet the first time it is used, and only once", () => {
    const d1 = c.assign(data(), { sunday: "2026-11-08" }, "ana", "keys", "a1");
    const d2 = c.setField(d1, { sunday: "2026-11-08" }, "sunday-type", "Communion");
    expect(d2.events).toHaveLength(1);
    expect(d2.events[0]).toMatchObject({ id: "tmp-sun-2026-11-08", kind: "sunday", starts_on: "2026-11-08", fields: { "sunday-type": "Communion" } });
    expect(c.sundayOf(d2.events[0].id)).toBe("2026-11-08");
  });

  it("is the same when done twice", () => {
    const once = c.assign(data([sunday("s1", "2026-11-01")]), { eventId: "s1" }, "ana", "drums", "a1");
    expect(c.assign(once, { eventId: "s1" }, "ana", "drums", "a9")).toEqual(once);
  });

  it("takes a person off, and clears a value", () => {
    const d1 = c.assign(data([sunday("s1", "2026-11-01")]), { eventId: "s1" }, "ana", "drums", "a1");
    expect(c.unassign(d1, "a1").events[0].assignments).toEqual([]);
    const d2 = c.setField(d1, { eventId: "s1" }, "theme", "Grace");
    expect(c.setField(d2, { eventId: "s1" }, "theme", "  ").events[0].fields).toEqual({});
  });

  it("links one setlist to a day: another replaces it, and a setlist is on one day", () => {
    const base = data([sunday("s1", "2026-11-01"), sunday("s2", "2026-11-08")]);
    const a = c.linkSetlist(base, { eventId: "s1" }, { id: "L1", name: "One", service_date: null });
    const b = c.linkSetlist(a, { eventId: "s1" }, { id: "L2", name: "Two", service_date: "2026-11-01" });
    expect(b.links.map((l) => l.id)).toEqual(["L2"]);
    const moved = c.linkSetlist(b, { eventId: "s2" }, { id: "L2", name: "Two", service_date: "2026-11-01" });
    expect(moved.links.map((l) => [l.id, l.event_id])).toEqual([["L2", "s2"]]);
    expect(c.unlinkSetlist(moved, "L2").links).toEqual([]);
  });

  it("swaps a made-up id for the real one", () => {
    const d1 = c.linkSetlist(c.assign(data(), { sunday: "2026-11-08" }, "ana", "keys", "a1"), { sunday: "2026-11-08" }, { id: "L1", name: "One", service_date: null });
    const d2 = c.renameAssignment(c.renameEvent(d1, "tmp-sun-2026-11-08", "real-1"), "a1", "real-a");
    expect(d2.events[0].id).toBe("real-1");
    expect(d2.links[0].event_id).toBe("real-1");
    expect(d2.events[0].assignments[0].id).toBe("real-a");
  });

  it("adds, changes and removes events; a Sunday keeps its name and date", () => {
    const input = { title: "Youth night", date: "2026-11-03", time: "18:30", location: "Hall", notes: "" };
    const added = c.addEvent(data([sunday("s1", "2026-11-01")]), "tmp-e-1", input, "me");
    expect(added.events.find((e) => e.id === "tmp-e-1")).toMatchObject({ kind: "event", title: "Youth night", starts_at: "18:30:00", created_by: "me" });
    const changed = c.updateEvent(added, "s1", { ...input, title: "Nope", date: "2026-12-01" });
    expect(changed.events[0]).toMatchObject({ title: "Sunday service", starts_on: "2026-11-01", location: "Hall" });
    const linked = c.linkSetlist(changed, { eventId: "tmp-e-1" }, { id: "L1", name: "One", service_date: null });
    const gone = c.deleteEvent(linked, "tmp-e-1");
    expect(gone.events.map((e) => e.id)).toEqual(["s1"]);
    expect(gone.links).toEqual([]);
  });

  it("takes a deleted person off every day", () => {
    const d1 = c.assign(data([sunday("s1", "2026-11-01")]), { eventId: "s1" }, "ana", "drums", "a1");
    const d2 = c.deletePerson(d1, "ana");
    expect(d2.people.map((p) => p.id)).toEqual(["ben"]);
    expect(d2.events[0].assignments).toEqual([]);
  });
});

describe("columns", () => {
  it("adds a column with a key from its name, avoiding keys in use", () => {
    const d1 = c.addColumn(data(), "tmp-c-1", { label: "Drums", kind: "people", section: "Band", options: [], ministries: [], optional: false });
    const added = d1.columns.find((x) => x.id === "tmp-c-1")!;
    expect(added.key).toBe("drums-2");
    expect(added.position).toBeGreaterThan(Math.max(...STARTER_AS_COLUMNS.map((x) => x.position)));
  });

  it("moves a column within its heading, hides and deletes it", () => {
    const d = data();
    const moved = c.moveColumn(d, "starter:bass", -1);
    const pos = (key: string) => moved.columns.find((x) => x.key === key)!.position;
    expect(pos("bass")).toBeLessThan(pos("drums"));
    expect(c.moveColumn(d, "starter:keys", -1)).toEqual(d);
    expect(c.archiveColumn(d, "starter:bass", true).columns.find((x) => x.key === "bass")!.archived).toBe(true);
    const withDrums = c.assign({ ...d, events: [sunday("s1", "2026-11-01")] }, { eventId: "s1" }, "ana", "drums", "a1");
    const deleted = c.deleteColumn(withDrums, "starter:drums");
    expect(deleted.columns.some((x) => x.key === "drums")).toBe(false);
    expect(deleted.events[0].assignments).toEqual([]);
  });
});
