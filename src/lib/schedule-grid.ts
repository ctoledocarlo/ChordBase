import { personName, isIsoDate, type Person, type Slot } from "./schedule";
import { SCHEDULE_ROLES, type ScheduleRole } from "./schedule-roles";
import { type Cell, type Sheet } from "./xlsx";

/**
 * The schedule as an Excel table: one row for each Sunday or event, with a column for each role and the people
 * on it separated by commas. Exported empty Sundays make a form to fill in; the same layout is what import reads,
 * so a file can go out, be edited in Excel, and come back.
 */

export const GRID_HEADERS = ["Date", "Event", "Time", "Location", ...SCHEDULE_ROLES.map((r) => r.plural), "Notes"];

const ROLE_COLUMN_START = 4;

/** One row of an imported file, ready to send to the database. */
export type ImportRow = {
  /** The row's number in the file, to point at it in a message. */
  line: number;
  date: string;
  title: string;
  time: string;
  location: string;
  notes: string;
  assign: Partial<Record<ScheduleRole, string[]>>;
};

export type ImportIssue = { line: number; message: string };

// ---- Export ----------------------------------------------------------------------------------------------------------

/** The people on a slot for one role, as "Maria Reyes, Tom Okafor". */
function namesFor(slot: Slot, role: ScheduleRole, people: Map<string, Person>): string {
  return slot.assignments
    .filter((a) => a.role === role)
    .map((a) => people.get(a.person_id))
    .filter((p): p is Person => !!p)
    .map(personName)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
}

export function gridRows(slots: Slot[], people: Map<string, Person>): Cell[][] {
  return [
    GRID_HEADERS,
    ...slots.map((s): Cell[] => [
      { date: s.date },
      s.title,
      s.time ? { time: s.time } : null,
      s.location,
      ...SCHEDULE_ROLES.map((r) => namesFor(s, r.id, people)),
      s.notes,
    ]),
  ];
}

const HOW_TO: string[][] = [
  ["How to use this file"],
  [""],
  ["Each row is a Sunday or an event. Put the people on each role in its column, with a comma between names: Maria Reyes, Tom Okafor."],
  ["Names have to match the people list in ChordBase (spelling and spacing; capital letters don't matter). Names that don't are listed before you import, and you can choose to add them as new people."],
  ["Date is required. Leave Event empty for the Sunday service. Time can be like 9:30 AM or 18:30."],
  ["Importing only adds: it never removes anyone who is already on the schedule, and it leaves existing events as they are."],
  ["Keep the first row (the headings) as it is. You can add rows, but not new columns."],
];

/** The schedule as a workbook: the table, and a sheet saying how to use it. */
export function scheduleSheets(slots: Slot[], people: Map<string, Person>): Sheet[] {
  const wrap = SCHEDULE_ROLES.map((_, i) => ROLE_COLUMN_START + i).concat(GRID_HEADERS.length - 1);
  return [
    {
      name: "Schedule",
      rows: gridRows(slots, people),
      widths: [20, 22, 11, 18, ...SCHEDULE_ROLES.map((r) => (r.id === "backup-singer" ? 28 : 22)), 30],
      wrap: [1, 3, ...wrap],
    },
    { name: "How to use", rows: HOW_TO.map((r) => r), widths: [110], wrap: [0] },
  ];
}

// ---- Import ----------------------------------------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  day: "date",
  event: "title",
  title: "title",
  service: "title",
  eventname: "title",
  time: "time",
  start: "time",
  starts: "time",
  starttime: "time",
  location: "location",
  place: "location",
  where: "location",
  notes: "notes",
  note: "notes",
  comments: "notes",
  songleader: "song-leader",
  leader: "song-leader",
  worshipleader: "song-leader",
  vocalist: "song-leader",
  backupsingers: "backup-singer",
  backupsinger: "backup-singer",
  backup: "backup-singer",
  backupvocals: "backup-singer",
  backing: "backup-singer",
  backingvocals: "backup-singer",
  keys: "keys",
  keyboard: "keys",
  piano: "keys",
  acousticguitar: "acoustic-guitar",
  acoustic: "acoustic-guitar",
  electricguitar: "electric-guitar",
  electric: "electric-guitar",
  leadguitar: "electric-guitar",
  bass: "bass",
  bassguitar: "bass",
  drums: "drums",
  drummer: "drums",
  otherinstruments: "other",
  otherinstrument: "other",
  other: "other",
  media: "media",
  tech: "media",
  sound: "media",
  slides: "media",
};

/** Which column is which, from the heading row. Columns that aren't recognised are named so they can be mentioned. */
export function readHeader(header: string[]): { columns: Map<number, string>; ignored: string[] } {
  const columns = new Map<number, string>();
  const ignored: string[] = [];
  const seen = new Set<string>();
  header.forEach((h, i) => {
    const text = (h ?? "").trim();
    if (!text) return;
    const key = HEADER_ALIASES[norm(text)];
    if (key && !seen.has(key)) {
      seen.add(key);
      columns.set(i, key);
    } else ignored.push(text);
  });
  return { columns, ignored };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A date from what a person might type or Excel might give: 2026-10-25, 10/25/2026, Oct 25 2026, 25 October 2026, Sunday Oct 25. */
export function parseDate(text: string, today: string): string | null {
  const s = text.trim();
  if (!s) return null;
  if (isIsoDate(s)) return s;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (iso) {
    const out = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    return isIsoDate(out) ? out : null;
  }
  const todayYear = Number(today.slice(0, 4));
  const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  // 10/25/2026, 10-25-26 (month first, as people write it in North America)
  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s);
  if (numeric) {
    const out = `${numeric[3] ? fullYear(numeric[3]) : todayYear}-${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`;
    return isIsoDate(out) ? out : null;
  }
  const words = s.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/[,.]/g, " ");
  const month = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.exec(words);
  if (!month) return null;
  const nums = words.replace(month[0], " ").match(/\b\d{1,4}\b/g) ?? [];
  const dayText = nums.find((n) => n.length <= 2);
  const yearText = nums.find((n) => n.length === 4);
  if (!dayText) return null;
  const out = `${yearText ? Number(yearText) : todayYear}-${String(MONTHS.indexOf(month[1].slice(0, 3)) + 1).padStart(2, "0")}-${dayText.padStart(2, "0")}`;
  return isIsoDate(out) ? out : null;
}

/** A time as "09:30" from "9:30", "9:30 AM", "6pm", "18:30:00" or "0930". */
export function parseTime(text: string): string | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = /^(\d{1,2})(?::?(\d{2}))?(?::\d{2})?(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].startsWith("p") ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** The names in a cell: "Maria Reyes, Tom Okafor", "Maria Reyes & Tom Okafor", one per line. */
export function splitNames(cell: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of cell.split(/[,;\n&]|\s+and\s+/i)) {
    const name = part.replace(/\s+/g, " ").trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

export const MAX_IMPORT_ROWS = 400;

/** Turns the rows of a sheet (heading row first) into what the database takes, and says what it couldn't use. */
export function readGrid(rows: string[][], today: string): { rows: ImportRow[]; issues: ImportIssue[]; ignored: string[]; missingDate: boolean } {
  const issues: ImportIssue[] = [];
  const { columns, ignored } = readHeader(rows[0] ?? []);
  if (![...columns.values()].includes("date")) return { rows: [], issues, ignored, missingDate: true };

  const out: ImportRow[] = [];
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    if (!cells || cells.every((c) => !(c ?? "").trim())) return;
    const get = (key: string) => {
      for (const [col, k] of columns) if (k === key) return (cells[col] ?? "").trim();
      return "";
    };
    const dateText = get("date");
    const date = parseDate(dateText, today);
    if (!date) {
      issues.push({ line, message: dateText ? `“${dateText}” isn't a date I can read, so the row was skipped.` : "There's no date, so the row was skipped." });
      return;
    }
    const timeText = get("time");
    const time = parseTime(timeText) ?? "";
    if (timeText && !time) issues.push({ line, message: `“${timeText}” isn't a time I can read, so the time was left out.` });
    const assign: ImportRow["assign"] = {};
    for (const role of SCHEDULE_ROLES) {
      const names = splitNames(get(role.id));
      if (names.length > 0) assign[role.id] = names;
    }
    out.push({ line, date, title: get("title"), time, location: get("location"), notes: get("notes"), assign });
  });
  if (out.length > MAX_IMPORT_ROWS) {
    issues.push({ line: 0, message: `Only the first ${MAX_IMPORT_ROWS} rows can be imported at once.` });
    out.length = MAX_IMPORT_ROWS;
  }
  return { rows: out, issues, ignored, missingDate: false };
}

/** The person a typed name means, by full name (ignoring capitals and extra spaces), or undefined. */
export function matchPerson(name: string, people: Person[]): Person | undefined {
  const wanted = name.replace(/\s+/g, " ").trim().toLowerCase();
  return people.find((p) => personName(p).toLowerCase() === wanted);
}

/** The names in the rows that aren't on the people list. */
export function unknownNames(rows: ImportRow[], people: Person[]): string[] {
  const unknown = new Map<string, string>();
  for (const row of rows) for (const names of Object.values(row.assign)) for (const name of names ?? []) if (!matchPerson(name, people)) unknown.set(name.toLowerCase(), name);
  return [...unknown.values()].sort((a, b) => a.localeCompare(b));
}

/** How many assignments the rows hold. */
export const countAssignments = (rows: ImportRow[]): number => rows.reduce((n, r) => n + Object.values(r.assign).reduce((m, names) => m + (names?.length ?? 0), 0), 0);
