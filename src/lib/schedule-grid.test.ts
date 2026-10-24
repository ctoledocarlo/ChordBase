import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSlots, type Person, type ScheduleEvent } from "./schedule";
import { STARTER_AS_COLUMNS, type ScheduleColumn } from "./schedule-columns";
import { countAssignments, gridHeaders, gridRows, guessKind, matchPerson, parseDate, parseTime, readWorkbook, scheduleSheets, splitNames, tidyLabel, toImportRows, unknownNames } from "./schedule-grid";
import { readXlsx, readXlsxSheets, writeXlsx } from "./xlsx";

const TODAY = "2026-10-22";
const person = (id: string, first: string, last: string): Person => ({ id, first_name: first, last_name: last, ministries: [], user_id: null });
const people = [person("1", "Maria", "Reyes"), person("2", "Tom", "Okafor"), person("3", "Eli", "Elder")];
const byId = new Map(people.map((p) => [p.id, p]));
const column = (over: Partial<ScheduleColumn> & Pick<ScheduleColumn, "key" | "label">): ScheduleColumn => ({ id: over.key, kind: "people", section: "", options: [], ministries: [], optional: false, position: 500, archived: false, ...over });
const sundayType = column({ key: "sunday-type", label: "Type of Sunday", kind: "choice", options: ["Communion Sunday", "Canada Sunday"], position: 5 });
const COLUMNS = [...STARTER_AS_COLUMNS, sundayType];

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

  it("reads an Excel day number that wasn't formatted as a date", () => {
    expect(parseDate("46026", TODAY)).toBe("2026-01-04");
    expect(parseDate("46026.0", TODAY)).toBe("2026-01-04");
    expect(parseDate("123", TODAY)).toBeNull();
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
    expect(splitNames("David/Eliel")).toEqual(["David", "Eliel"]);
    expect(splitNames("  ")).toEqual([]);
  });

  it("match people by full name, ignoring capitals and spacing", () => {
    expect(matchPerson("  maria   REYES ", people)?.id).toBe("1");
    expect(matchPerson("Maria", people)).toBeUndefined();
  });
});

describe("headings as labels", () => {
  it("close up letters spaced apart, split numbers off words and soften shouting", () => {
    expect(tidyLabel("S O U N D    B O O T H")).toBe("Sound booth");
    expect(tidyLabel("Camera1 & mixer")).toBe("Camera 1 & mixer");
    expect(tidyLabel("REV 5 TEAM")).toBe("Rev 5 team");
    expect(tidyLabel("DANCERS")).toBe("Dancers");
    expect(tidyLabel("Praise and Worship Leader")).toBe("Praise and Worship Leader");
  });

  it("guess what a new column holds", () => {
    expect(guessKind("Dancers", [])).toBe("people");
    expect(guessKind("Piano", ["Ethan", "Austin", "Evan"])).toBe("people");
    expect(guessKind("Type of Sunday", ["Israel Sunday", "Canada Sunday"])).toBe("choice");
    expect(guessKind("Sermon", ["Walking by faith in uncertain times", "The good shepherd and his sheep"])).toBe("text");
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
      fields: { "sunday-type": "Communion Sunday" },
      assignments: [
        { id: "a1", person_id: "2", role: "keys", note: "" },
        { id: "a2", person_id: "1", role: "keys", note: "" },
        { id: "a3", person_id: "1", role: "song-leader", note: "" },
      ],
    },
    { id: "e1", kind: "event", title: "Youth night", starts_on: "2026-10-27", starts_at: "18:30:00", location: "", notes: "", created_by: null, fields: {}, assignments: [] },
  ];
  const slots = buildSlots(events, TODAY, "2026-11-01");

  it("has a row for each Sunday and event, empty Sundays included, and a column for each of the church's own", () => {
    const rows = gridRows(slots, byId, COLUMNS);
    const headers = gridHeaders(COLUMNS);
    expect(rows[0]).toEqual(headers);
    expect(headers).toContain("Type of Sunday");
    expect(rows).toHaveLength(1 + 3);
    expect(rows.map((r) => r[1]).slice(1)).toEqual(["Sunday service", "Youth night", "Sunday service"]);
    const first = rows[1];
    expect(first[0]).toEqual({ date: "2026-10-25" });
    expect(first[2]).toEqual({ time: "09:30" });
    expect(first[headers.indexOf("Keys")]).toBe("Maria Reyes, Tom Okafor");
    expect(first[headers.indexOf("Song leader")]).toBe("Maria Reyes");
    expect(first[headers.indexOf("Type of Sunday")]).toBe("Communion Sunday");
  });

  it("leaves out hidden columns", () => {
    const hidden = COLUMNS.map((c) => (c.key === "bass" ? { ...c, archived: true } : c));
    expect(gridHeaders(hidden)).not.toContain("Bass");
  });

  it("goes through a real file and comes back as the same schedule", () => {
    const file = writeXlsx(scheduleSheets(slots, byId, COLUMNS));
    const read = readXlsx(file);
    expect(read.name).toBe("Schedule");
    const back = readWorkbook([read], TODAY, COLUMNS);
    expect(back.issues).toEqual([]);
    expect(back.ignored).toEqual([]);
    expect(back.columns.every((c) => c.existing)).toBe(true);
    expect(back.rows.map((r) => [r.date, r.title, r.time])).toEqual([
      ["2026-10-25", "Sunday service", "09:30"],
      ["2026-10-27", "Youth night", "18:30"],
      ["2026-11-01", "Sunday service", ""],
    ]);
    const rows = toImportRows(back.rows, back.columns, (c) => c.existing?.key ?? null);
    // A column holds one person, so only the first name of a cell is read.
    expect(rows[0].assign).toEqual({ "song-leader": ["Maria Reyes"], keys: ["Maria Reyes"] });
    expect(rows[0].fields).toEqual({ "sunday-type": "Communion Sunday" });
    expect(rows[0].location).toBe("Main hall");
    expect(rows[0].notes).toBe("Communion");
    expect(unknownNames(rows, people)).toEqual([]);
    expect(countAssignments(rows)).toBe(2);
  });

  it("also carries a how-to sheet", () => {
    expect(scheduleSheets(slots, byId, COLUMNS).map((s) => s.name)).toEqual(["Schedule", "How to use"]);
  });
});

describe("a file someone filled in", () => {
  const sheet = [
    ["Date", "Event", "Time", "Worship leader", "Piano", "Drummer", "Parking"],
    ["10/25/2026", "", "9:30 AM", "Maria Reyes", "Eli Elder & Nobody Known", "", "Lot B"],
    ["", "", "", "", "", "", ""],
    ["whenever", "Retreat", "", "", "Tom Okafor", "", ""],
    ["Nov 1", "Baptism", "25:00", "", "tom okafor", "Tom Okafor", ""],
  ];
  const result = readWorkbook([{ name: "Plan", rows: sheet }], TODAY, STARTER_AS_COLUMNS);

  it("keeps the rows it can read and says why it skipped the others", () => {
    expect(result.rows.map((r) => r.date)).toEqual(["2026-10-25", "2026-11-01"]);
    expect(result.issues.map((i) => i.line)).toEqual([4, 5]);
    expect(result.issues[0].message).toContain("whenever");
    expect(result.issues[1].message).toContain("25:00");
  });

  it("lines up headings with the church's columns, and offers to make one for the rest", () => {
    const matched = Object.fromEntries(result.columns.map((c) => [c.label, c.existing?.key ?? null]));
    expect(matched).toEqual({ "Song leader": "song-leader", Keys: "keys", Drums: "drums", Parking: null });
    const parking = result.columns.find((c) => c.label === "Parking")!;
    expect(parking.id).toBe("new:parking");
    expect(parking.kind).toBe("people");
  });

  it("uses what it can read of a row, and reads times", () => {
    expect(result.rows[0].time).toBe("09:30");
    const rows = toImportRows(result.rows, result.columns, (c) => c.existing?.key ?? null);
    expect(rows[0].assign.keys).toEqual(["Eli Elder"]);
    expect(result.rows[1].time).toBe("");
  });

  it("lists the names that aren't on the people list, once", () => {
    const rows = toImportRows(result.rows, result.columns, (c) => c.existing?.key ?? null);
    expect(unknownNames(rows, people)).toEqual([]);
    expect(unknownNames([{ ...rows[0], assign: { keys: ["Nobody Known"], drums: ["nobody known"] } }], people)).toEqual(["nobody known"]);
  });

  it("puts new columns under the key they were given, or leaves them out", () => {
    const withNew = toImportRows(result.rows, result.columns, (c) => (c.existing ? c.existing.key : c.id === "new:parking" ? "parking" : null));
    expect(withNew[0].assign.parking).toEqual(["Lot B"]);
    const without = toImportRows(result.rows, result.columns, (c) => c.existing?.key ?? null);
    expect(without[0].assign.parking).toBeUndefined();
  });

  it("needs a Date column", () => {
    const none = readWorkbook([{ name: "Plan", rows: [["Event", "Keys"], ["x", "y"]] }], TODAY, STARTER_AS_COLUMNS);
    expect(none.rows).toEqual([]);
    expect(none.skippedSheets).toEqual(["Plan"]);
  });

  it("stops at 400 rows", () => {
    const many = [["Date", "Keys"], ...Array.from({ length: 450 }, () => ["2026-11-01", "Tom Okafor"])];
    const big = readWorkbook([{ name: "Plan", rows: many }], TODAY, STARTER_AS_COLUMNS);
    expect(big.rows).toHaveLength(400);
    expect(big.issues.some((i) => i.message.includes("400"))).toBe(true);
  });
});

describe("a church's own sheet with headings over several rows", () => {
  // The shape of a typical worship-team sheet: group headings in the first heading row (some spelled a letter to a cell),
  // the roles under them, a note like "1 & 2" under one, and a side table to the right that isn't part of the schedule.
  const sheet = [
    ["", "Team schedule"],
    [],
    ["Date", "S O U N D    B O O T H", "", "", "B", "A", "N", "D", "SUNDAYS", "REV 5 TEAM", "Praise and Worship Leader", "DANCERS", "", "", "Month", "Notes"],
    ["", "Projection", "Audio", "Camera1 & mixer", "Piano", "Drums", "Guitars", "Bass"],
    ["", "", "", "", "", "", "1 & 2"],
    ["46026", "Shekinah", "Hanz", "Jacqueline", "Ethan", "Carlo", "Jong", "Jose", "Israel Sunday", "YA", "Immanuel", "", "", "", "January"],
    ["46033", "Tammy", "Evan", "Jake", "Jessah", "Patrick", "Hanz", "James", "Canada Sunday", "Gents", "Orly"],
    ["46040", "Eliana", "Jong", "Tammy", "Austin", "Evan", "Jason C", "Michael", "Filipino Sunday", "YA", "Jol"],
    [],
    ["46054", "Emem", "Hanz", "Jacqueline", "John", "Patrick", "Jong", "Jose", "Israel Sunday", "YA", "Joy", "Rose & Ana"],
    ["46061", "Tammy", "Austin", "Jake", "Evan", "Chaym", "Eliel", "EmEm", "Canada Sunday", "Youth", "Jason"],
    ["46068", "Eliel", "Jong", "Ethan", "Austin", "Evan", "Jason C", "Michael", "Filipino Sunday", "YA", "Joann"],
  ];
  const result = readWorkbook([{ name: "Jan - Jun 2026", rows: sheet }], TODAY, STARTER_AS_COLUMNS);
  const byLabel = new Map(result.columns.map((c) => [c.label, c]));

  it("finds the heading row and the days under it", () => {
    expect(result.rows).toHaveLength(6);
    expect(result.rows[0].date).toBe("2026-01-04");
    expect(result.rows[0].line).toBe(6);
    expect(result.issues).toEqual([]);
  });

  it("joins the headings, with the group each sits under", () => {
    expect(result.columns.map((c) => c.label)).toEqual([
      "Projection", // matches the church's own Projection
      "Audio",
      "Camera 1 & mixer",
      "Keys", // "Piano" is the church's Keys
      "Drums",
      "Guitars",
      "Bass",
      "Sundays",
      "Rev 5 team",
      "Song leader", // "Praise and Worship Leader"
      "Dancers",
    ]);
    expect(byLabel.get("Camera 1 & mixer")?.section).toBe("Sound booth");
    expect(byLabel.get("Guitars")?.section).toBe("Band");
    expect(byLabel.get("Guitars")?.existing).toBeNull();
    expect(byLabel.get("Keys")?.existing?.key).toBe("keys");
    expect(byLabel.get("Song leader")?.existing?.key).toBe("song-leader");
  });

  it("ends the table where the headings stop, so a table beside it isn't read", () => {
    expect(result.columns.some((c) => c.label === "Month" || c.label === "Notes")).toBe(false);
  });

  it("guesses which new columns are choices, and lists their choices", () => {
    expect(byLabel.get("Sundays")?.kind).toBe("choice");
    expect(byLabel.get("Sundays")?.options).toEqual(["Israel Sunday", "Canada Sunday", "Filipino Sunday"]);
    expect(byLabel.get("Rev 5 team")?.kind).toBe("choice");
    expect(byLabel.get("Rev 5 team")?.options).toEqual(["YA", "Gents", "Youth"]);
    expect(byLabel.get("Camera 1 & mixer")?.kind).toBe("people");
    expect(byLabel.get("Dancers")?.kind).toBe("people");
  });

  it("turns the cells into people on columns and values on choice columns", () => {
    const rows = toImportRows(result.rows, result.columns, (c) => (c.existing ? c.existing.key : c.id.replace("new:", "")));
    expect(rows[0].assign).toMatchObject({ "song-leader": ["Immanuel"], keys: ["Ethan"], drums: ["Carlo"], guitars: ["Jong"], bass: ["Jose"], projection: ["Shekinah"], audio: ["Hanz"] });
    expect(rows[0].fields).toEqual({ sundays: "Israel Sunday", "rev-5-team": "YA" });
    expect(rows[3].assign.dancers).toEqual(["Rose"]);
  });

  it("counts how often each column is used", () => {
    expect(byLabel.get("Dancers")?.used).toBe(1);
    expect(byLabel.get("Bass")?.used).toBe(6);
  });
});

// The church's real sheet, when it is in the project's SampleDocs folder.
const REAL = "SampleDocs/2026 Praise and Worship .xlsx";
describe.skipIf(!existsSync(REAL))("the sample sheet", () => {
  it("is read: every role from the sound booth to the band is a column", () => {
    const sheets = readXlsxSheets(new Uint8Array(readFileSync(REAL)));
    const result = readWorkbook(sheets, "2026-01-01", STARTER_AS_COLUMNS);
    const labels = result.columns.map((c) => c.label);
    for (const wanted of ["Projection", "Audio", "Camera 1 & mixer", "Camera 2", "Keys", "Drums", "Guitars", "Bass", "Sundays", "Rev 5 team", "Song leader", "Dancers", "Video", "Camera"]) {
      expect(labels, wanted).toContain(wanted);
    }
    expect(result.rows.length).toBeGreaterThan(40);
    expect(result.rows[0].date).toBe("2026-01-04");
    expect(result.skippedSheets).toContain("Leaders and Musicians");
    expect(result.columns.find((c) => c.label === "Sundays")?.kind).toBe("choice");
  });
});
