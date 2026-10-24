import { describe, expect, it } from "vitest";
import { addDays, buildSlots, byRole, dayText, hueFor, initials, isIsoDate, isSunday, onSlot, relativeDay, sundaysFrom, thisOrNextSunday, timeText, weekday, type Person, type ScheduleEvent } from "./schedule";

const person = (id: string, first: string, last: string): Person => ({ id, first_name: first, last_name: last, ministries: [], user_id: null });
const event = (over: Partial<ScheduleEvent>): ScheduleEvent => ({ id: "e", kind: "event", title: "Event", starts_on: "2026-10-27", starts_at: null, location: "", notes: "", created_by: null, fields: {}, assignments: [], ...over });

describe("dates", () => {
  it("know which day is Sunday", () => {
    expect(weekday("2026-10-25")).toBe(0);
    expect(isSunday("2026-10-25")).toBe(true);
    expect(isSunday("2026-10-26")).toBe(false);
  });

  it("add days across months and years", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    // Across the clocks changing, a day is still a day.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("find the Sunday on or after a date", () => {
    expect(thisOrNextSunday("2026-10-25")).toBe("2026-10-25");
    expect(thisOrNextSunday("2026-10-22")).toBe("2026-10-25");
    expect(thisOrNextSunday("2026-10-26")).toBe("2026-11-01");
  });

  it("list Sundays", () => {
    expect(sundaysFrom("2026-10-22", 3)).toEqual(["2026-10-25", "2026-11-01", "2026-11-08"]);
  });

  it("check a date is real", () => {
    expect(isIsoDate("2026-10-25")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("10/25/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("describe a day, a time and how far away it is", () => {
    expect(dayText("2026-10-25", "2026-10-22")).toBe("Sunday, Oct 25");
    expect(dayText("2027-01-03", "2026-10-22")).toContain("2027");
    expect(timeText("09:30")).toMatch(/9:30\s?AM/);
    expect(timeText("18:05")).toMatch(/6:05\s?PM/);
    expect(timeText(null)).toBe("");
    expect(relativeDay("2026-10-22", "2026-10-22")).toBe("today");
    expect(relativeDay("2026-10-23", "2026-10-22")).toBe("tomorrow");
    expect(relativeDay("2026-10-21", "2026-10-22")).toBe("yesterday");
    expect(relativeDay("2026-10-25", "2026-10-22")).toBe("in 3 days");
    expect(relativeDay("2026-10-29", "2026-10-22")).toBe("in 1 week");
    expect(relativeDay("2026-11-05", "2026-10-22")).toBe("in 2 weeks");
    expect(relativeDay("2026-10-08", "2026-10-22")).toBe("2 weeks ago");
  });
});

describe("the schedule's slots", () => {
  it("has every Sunday in the window, saved or not", () => {
    const slots = buildSlots([event({ id: "s1", kind: "sunday", title: "Sunday service", starts_on: "2026-11-01" })], "2026-10-22", "2026-11-08");
    expect(slots.map((s) => [s.date, s.id])).toEqual([
      ["2026-10-25", null],
      ["2026-11-01", "s1"],
      ["2026-11-08", null],
    ]);
    expect(slots.every((s) => s.kind === "sunday" && s.title === "Sunday service")).toBe(true);
  });

  it("puts events among the Sundays in date order, the Sunday service first on its own day", () => {
    const slots = buildSlots(
      [
        event({ id: "a", title: "Youth night", starts_on: "2026-10-27", starts_at: "18:30:00" }),
        event({ id: "b", title: "Prayer", starts_on: "2026-10-25", starts_at: "08:00:00" }),
        event({ id: "c", title: "Out of range", starts_on: "2027-05-01" }),
      ],
      "2026-10-22",
      "2026-11-02",
    );
    expect(slots.map((s) => s.title)).toEqual(["Sunday service", "Prayer", "Youth night", "Sunday service"]);
    expect(slots[2].time).toBe("18:30");
  });

  it("only counts events in the window", () => {
    expect(buildSlots([event({ starts_on: "2026-09-01" })], "2026-10-22", "2026-10-30").some((s) => s.kind === "event")).toBe(false);
  });
});

describe("who is on a slot", () => {
  const people = new Map([
    ["1", person("1", "Tom", "Okafor")],
    ["2", person("2", "Maria", "Reyes")],
  ]);
  const assignments = [
    { id: "a", person_id: "1", role: "keys" as const, note: "" },
    { id: "b", person_id: "2", role: "keys" as const, note: "" },
    { id: "c", person_id: "9", role: "drums" as const, note: "" },
  ];

  it("groups people by role, by name, and ignores people who are gone", () => {
    const groups = byRole(assignments, people);
    expect(groups.get("keys")!.map((x) => x.person.first_name)).toEqual(["Maria", "Tom"]);
    expect(groups.has("drums")).toBe(false);
  });

  it("knows whether someone is on a slot", () => {
    const slot = buildSlots([event({ kind: "sunday", starts_on: "2026-10-25", assignments })], "2026-10-25", "2026-10-25")[0];
    expect(onSlot(slot, "1")).toBe(true);
    expect(onSlot(slot, "3")).toBe(false);
    expect(onSlot(slot, null)).toBe(false);
  });

  it("gives initials and a steady colour", () => {
    expect(initials({ first_name: "maria", last_name: "reyes" })).toBe("MR");
    expect(initials({ first_name: "Eli", last_name: "" })).toBe("E");
    expect(hueFor("abc")).toBe(hueFor("abc"));
    expect(hueFor("abc")).toBeGreaterThanOrEqual(0);
    expect(hueFor("abc")).toBeLessThan(360);
  });
});
