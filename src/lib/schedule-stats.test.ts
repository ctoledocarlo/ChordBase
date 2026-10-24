import { describe, expect, it } from "vitest";
import type { Person, ScheduleEvent } from "./schedule";
import { STARTER_AS_COLUMNS } from "./schedule-columns";
import { agoText, daysBetween, openSpots, sortSummaries, summarize, typeTotals, watchList } from "./schedule-stats";

const TODAY = "2026-10-22"; // a Thursday
const person = (id: string, first: string): Person => ({ id, first_name: first, last_name: "", ministries: [], user_id: null });
const ana = person("a", "Ana");
const ben = person("b", "Ben");
const cy = person("c", "Cy");
const people = [ana, ben, cy];

let n = 0;
const sunday = (date: string, type: string | null, who: [string, string][]): ScheduleEvent => ({
  id: `e${++n}`,
  kind: "sunday",
  title: "Sunday service",
  starts_on: date,
  starts_at: null,
  location: "",
  notes: "",
  created_by: null,
  fields: type ? { type } : {},
  assignments: who.map(([person_id, role]) => ({ id: `x${++n}`, person_id, role, note: "" })),
});

const events = [
  sunday("2026-08-30", "Canada", [["a", "drums"], ["b", "keys"]]),
  sunday("2026-09-27", "Communion", [["a", "drums"]]),
  sunday("2026-10-11", "Canada", [["a", "drums"], ["a", "song-leader"], ["b", "bass"]]),
  sunday("2026-10-18", "Canada", [["b", "keys"]]),
  sunday("2026-10-25", "Communion", [["a", "drums"]]),
  sunday("2026-11-01", null, [["a", "drums"]]),
  sunday("2026-11-08", null, [["a", "keys"]]),
];

describe("gaps between dates", () => {
  it("count days and say them plainly", () => {
    expect(daysBetween("2026-10-01", "2026-10-22")).toBe(21);
    expect(daysBetween("2026-10-22", "2026-10-01")).toBe(-21);
    expect(agoText(0)).toBe("today");
    expect(agoText(1)).toBe("yesterday");
    expect(agoText(5)).toBe("5 days ago");
    expect(agoText(21)).toBe("3 weeks ago");
    expect(agoText(120)).toBe("4 months ago");
  });
});

describe("a person's history", () => {
  const sums = summarize(events, people, TODAY, { periodDays: 91, choiceKey: "type" });
  const a = sums.get("a")!;

  it("knows the last and next time they served, and in what", () => {
    expect(a.last).toEqual({ date: "2026-10-11", title: "Sunday service", columns: ["drums", "song-leader"] });
    expect(a.daysSince).toBe(11);
    expect(a.next?.date).toBe("2026-10-25");
  });

  it("counts services, not roles, in the period and ahead", () => {
    expect(a.inPeriod).toBe(3);
    expect(a.upcoming).toBe(3);
    expect(sums.get("c")).toMatchObject({ last: null, next: null, daysSince: null, inPeriod: 0, upcoming: 0 });
  });

  it("keeps a history for each column", () => {
    expect(a.byColumn.get("drums")).toEqual({ count: 3, inPeriod: 3, last: "2026-10-11" });
    expect(a.byColumn.get("song-leader")?.count).toBe(1);
    expect(sums.get("b")?.byColumn.get("keys")).toEqual({ count: 2, inPeriod: 2, last: "2026-10-18" });
  });

  it("spreads services across the kinds of Sunday", () => {
    expect([...a.byChoice]).toEqual([["Canada", 2], ["Communion", 1]]);
    expect(a.lastChoice.get("Canada")).toBe("2026-10-11");
    expect(summarize(events, people, TODAY, { periodDays: 28, choiceKey: "type" }).get("a")?.byChoice.get("Canada")).toBe(1);
    expect(typeTotals(events, "type", TODAY, 91)).toEqual(new Map([["Canada", 3], ["Communion", 1]]));
  });

  it("only counts what's inside a shorter period", () => {
    const short = summarize(events, people, TODAY, { periodDays: 28, choiceKey: null }).get("a")!;
    expect(short.inPeriod).toBe(2);
    expect(short.byColumn.get("drums")).toEqual({ count: 3, inPeriod: 2, last: "2026-10-11" });
  });
});

describe("who is on a lot", () => {
  it("flags three Sundays in a row, and three services in four weeks", () => {
    const sums = summarize(events, people, TODAY, { periodDays: 91, choiceKey: null });
    expect(sums.get("a")?.run).toBe(3);
    expect(sums.get("b")?.run).toBe(2);
    expect(watchList(sums).map((w) => [w.person.id, w.reason])).toEqual([["a", "3 Sundays in a row"]]);
  });
});

describe("ordering people", () => {
  const sums = [...summarize(events, people, TODAY, { periodDays: 91, choiceKey: null }).values()];
  it("puts the longest since they served first, never-scheduled most of all", () => {
    expect(sortSummaries(sums, "rested").map((s) => s.person.id)).toEqual(["c", "a", "b"]);
  });
  it("can put the busiest first, or go by name", () => {
    expect(sortSummaries(sums, "busiest")[0].person.id).toBe("a");
    expect(sortSummaries(sums, "name").map((s) => s.person.first_name)).toEqual(["Ana", "Ben", "Cy"]);
  });
});

describe("open spots", () => {
  it("lists the required people columns nobody is on, leaving out optional ones", () => {
    const spots = openSpots(events, STARTER_AS_COLUMNS, TODAY, 14);
    expect(spots.map((s) => s.slot.date)).toEqual(["2026-10-25", "2026-11-01"]);
    const first = spots[0].missing.map((c) => c.key);
    expect(first).toContain("song-leader");
    expect(first).not.toContain("drums");
    expect(first).not.toContain("backup-singer");
    expect(first).not.toContain("other");
  });

  it("is empty when there are no people columns", () => {
    expect(openSpots(events, [], TODAY)).toEqual([]);
  });
});
