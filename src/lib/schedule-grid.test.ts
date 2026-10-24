import { describe, expect, it } from "vitest";
import { buildSlots, type Person, type ScheduleEvent } from "./schedule";
import { GRID_HEADERS, countAssignments, gridRows, matchPerson, parseDate, parseTime, readGrid, readHeader, scheduleSheets, splitNames, unknownNames } from "./schedule-grid";
import { readXlsx, writeXlsx } from "./xlsx";

const TODAY = "2026-10-22";
const person = (id: string, first: string, last: string): Person => ({ id, first_name: first, last_name: last, ministries: [], user_id: null });
const people = [person("1", "Maria", "Reyes"), person("2", "Tom", "Okafor"), person("3", "Eli", "Elder")];
const byId = new Map(people.map((p) => [p.id, p]));

describe("reading dates", () => {
  it("accepts the ways people write them", () => {
    expect(parseDate("2026-10-25", TODAY)).toBe("2026-10-25");
    expect(parseDate("2026-1-5", TODAY)).toBe("2026-01-05");
    expect(parseDate("10/25/2026", TODAY)).toBe("2026-10-25");
    expect(parseDate("10/25/26", TODAY)).toBe("2026-10-25");
    expect(parseDate("Oct 25, 2026", TODAY)).toBe("2026-10-25");
    expect(parseDate("25 October 2026", TODAY)).toBe("2026-10-25");
    expect(parseDate("Sunday, Oct 25", TODAY)).toBe("2026-10-25");
    expect(parseDate("November 1st", TODAY)).toBe("2026-11-01");
    expect(parseDate("10/25", TODAY)).toBe("2026-10-25");
  });

  it("refuses what isn't a date", () => {
    for (const bad of ["", "soon", "2026-02-30", "13/40/2026", "Octember 5"]) expect([bad, parseDate(bad, TODAY)]).toEqual([bad, null]);
  });
});

describe("reading times", () => {
  it("accepts the ways people write them", () => {
    expect(parseTime("9:30")).toBe("09:30");
    expect(parseTime("09:30")).toBe("09:30");
    expect(parseTime("9:30 AM")).toBe("09:30");
    expect(parseTime("6pm")).toBe("18:00");
    expect(parseTime("12 am")).toBe("00:00");
    expect(parseTime("12:15 PM")).toBe("12:15");
    expect(parseTime("18:30:00")).toBe("18:30");
    expect(parseTime("0930")).toBe("09:30");
  });

  it("refuses what isn't a time", () => {
    for (const bad of ["", "noon", "25:00", "9:75", "13pm"]) expect([bad, parseTime(bad)]).toEqual([bad, null]);
  });
});

describe("names in a cell", () => {
  it("splits on commas, ands, semicolons and lines, once each", () => {
    expect(splitNames("Maria Reyes, Tom  Okafor")).toEqual(["Maria Reyes", "Tom Okafor"]);
    expect(splitNames("Maria Reyes & Tom Okafor")).toEqual(["Maria Reyes", "Tom Okafor"]);
    expect(splitNames("Maria Reyes and Tom Okafor; maria reyes")).toEqual(["Maria Reyes", "Tom Okafor"]);
    expect(splitNames("Maria Reyes\nTom Okafor\n")).toEqual(["Maria Reyes", "Tom Okafor"]);
    expect(splitNames("  ")).toEqual([]);
  });

  it("match people by full name, ignoring capitals and spacing", () => {
    expect(matchPerson("  maria   REYES ", people)?.id).toBe("1");
    expect(matchPerson("Maria", people)).toBeUndefined();
  });
});

describe("headings", () => {
  it("are recognised under the names people use", () => {
    const { columns, ignored } = readHeader(["Date", "Service", "Start", "Worship leader", "Backing vocals", "Piano", "Drummer", "Slides", "Comments", "Parking"]);
    expect([...columns.values()]).toEqual(["date", "title", "time", "song-leader", "backup-singer", "keys", "drums", "media", "notes"]);
    expect(ignored).toEqual(["Parking"]);
  });

  it("use each meaning once", () => {
    expect([...readHeader(["Date", "Keys", "Piano"]).columns.values()]).toEqual(["date", "keys"]);
  });
});

describe("a schedule as a sheet", () => {
  const events: ScheduleEvent[] = [
    {
      id: "s1",
      kind: "sunday",
      title: "Sunday service",
      starts_on: "2026-10-25",
      starts_at: "09:30:00",
      location: "Main hall",
      notes: "Communion",
      created_by: null,
      assignments: [
        { id: "a1", person_id: "2", role: "keys", note: "" },
        { id: "a2", person_id: "1", role: "keys", note: "" },
        { id: "a3", person_id: "1", role: "song-leader", note: "" },
      ],
    },
    { id: "e1", kind: "event", title: "Youth night", starts_on: "2026-10-27", starts_at: "18:30:00", location: "", notes: "", created_by: null, assignments: [] },
  ];
  const slots = buildSlots(events, TODAY, "2026-11-01");

  it("has a row for each Sunday and event, empty Sundays included", () => {
    const rows = gridRows(slots, byId);
    expect(rows[0]).toEqual(GRID_HEADERS);
    expect(rows).toHaveLength(1 + 3);
    expect(rows.map((r) => r[1]).slice(1)).toEqual(["Sunday service", "Youth night", "Sunday service"]);
    const first = rows[1];
    expect(first[0]).toEqual({ date: "2026-10-25" });
    expect(first[2]).toEqual({ time: "09:30" });
    expect(first[GRID_HEADERS.indexOf("Keys")]).toBe("Maria Reyes, Tom Okafor");
    expect(first[GRID_HEADERS.indexOf("Song leader")]).toBe("Maria Reyes");
  });

  it("goes through a real file and comes back as the same schedule", () => {
    const file = writeXlsx(scheduleSheets(slots, byId));
    const read = readXlsx(file);
    expect(read.name).toBe("Schedule");
    const back = readGrid(read.rows, TODAY);
    expect(back.issues).toEqual([]);
    expect(back.ignored).toEqual([]);
    expect(back.rows.map((r) => [r.date, r.title, r.time])).toEqual([
      ["2026-10-25", "Sunday service", "09:30"],
      ["2026-10-27", "Youth night", "18:30"],
      ["2026-11-01", "Sunday service", ""],
    ]);
    expect(back.rows[0].assign).toEqual({ "song-leader": ["Maria Reyes"], keys: ["Maria Reyes", "Tom Okafor"] });
    expect(back.rows[0].location).toBe("Main hall");
    expect(back.rows[0].notes).toBe("Communion");
    expect(unknownNames(back.rows, people)).toEqual([]);
    expect(countAssignments(back.rows)).toBe(3);
  });

  it("also carries a how-to sheet", () => {
    expect(scheduleSheets(slots, byId).map((s) => s.name)).toEqual(["Schedule", "How to use"]);
  });
});

describe("a file someone filled in", () => {
  const sheet = [
    ["Date", "Event", "Time", "Song leader", "Keys", "Drums", "Parking"],
    ["10/25/2026", "", "9:30 AM", "Maria Reyes", "Eli Elder & Nobody Known", "", "Lot B"],
    ["", "", "", "", "", "", ""],
    ["whenever", "Retreat", "", "", "Tom Okafor", "", ""],
    ["Nov 1", "Baptism", "25:00", "", "tom okafor", "Tom Okafor", ""],
  ];
  const result = readGrid(sheet, TODAY);

  it("keeps the rows it can read and says why it skipped the others", () => {
    expect(result.rows.map((r) => r.date)).toEqual(["2026-10-25", "2026-11-01"]);
    expect(result.issues.map((i) => i.line)).toEqual([4, 5]);
    expect(result.issues[0].message).toContain("whenever");
    expect(result.issues[1].message).toContain("25:00");
    expect(result.ignored).toEqual(["Parking"]);
  });

  it("uses what it can read of a row, and reads times", () => {
    expect(result.rows[0].time).toBe("09:30");
    expect(result.rows[0].assign.keys).toEqual(["Eli Elder", "Nobody Known"]);
    expect(result.rows[1].time).toBe("");
  });

  it("lists the names that aren't on the people list, once", () => {
    expect(unknownNames(result.rows, people)).toEqual(["Nobody Known"]);
  });

  it("needs a Date column", () => {
    const none = readGrid([["Event", "Keys"], ["x", "y"]], TODAY);
    expect(none.missingDate).toBe(true);
    expect(none.rows).toEqual([]);
  });

  it("stops at 400 rows", () => {
    const many = [["Date", "Keys"], ...Array.from({ length: 450 }, () => ["2026-11-01", "Tom Okafor"])];
    const big = readGrid(many, TODAY);
    expect(big.rows).toHaveLength(400);
    expect(big.issues.some((i) => i.message.includes("400"))).toBe(true);
  });
});
