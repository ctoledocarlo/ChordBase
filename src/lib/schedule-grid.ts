import { isIsoDate, personName, type Person, type Slot } from "./schedule";
import { activeColumns, slugKey, type ColumnKind, type ScheduleColumn } from "./schedule-columns";
import { serialToIso, type Cell, type Sheet } from "./xlsx";

/**
 * The schedule as an Excel table: one row for each Sunday or event, with a column for each of the church's own columns
 * (people separated by commas, a choice or text as it is). Exported empty Sundays make a form to fill in; the same layout
 * is what import reads, so a file can go out, be edited in Excel, and come back. Import also reads a church's own
 * spreadsheet: it finds the heading row, joins headings spread over two or three rows, and offers to make columns for
 * any heading the schedule doesn't have yet.
 */

const FIXED_BEFORE = ["Date", "Event", "Time", "Location"];

/** The headings of the table, for the columns in use. */
export const gridHeaders = (columns: ScheduleColumn[]): string[] => [...FIXED_BEFORE, ...activeColumns(columns).map((c) => c.label), "Notes"];

/** One row of an imported file, ready to send to the database. Keys are column keys. */
export type ImportRow = {
  /** The row's number in the file, to point at it in a message. */
  line: number;
  date: string;
  title: string;
  time: string;
  location: string;
  notes: string;
  assign: Record<string, string[]>;
  fields: Record<string, string>;
};

export type ImportIssue = { line: number; message: string };

// ---- Export ----------------------------------------------------------------------------------------------------------

/** The people on a slot for one column, as "Maria Reyes, Tom Okafor". */
function namesFor(slot: Slot, key: string, people: Map<string, Person>): string {
  return slot.assignments
    .filter((a) => a.role === key)
    .map((a) => people.get(a.person_id))
    .filter((p): p is Person => !!p)
    .map(personName)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
}

export function gridRows(slots: Slot[], people: Map<string, Person>, columns: ScheduleColumn[]): Cell[][] {
  const cols = activeColumns(columns);
  return [
    gridHeaders(columns),
    ...slots.map((s): Cell[] => [
      { date: s.date },
      s.title,
      s.time ? { time: s.time } : null,
      s.location,
      ...cols.map((c) => (c.kind === "people" ? namesFor(s, c.key, people) : (s.fields[c.key] ?? ""))),
      s.notes,
    ]),
  ];
}

const HOW_TO: string[][] = [
  ["How to use this file"],
  [""],
  ["Each row is a Sunday or an event. Put one person in each column: Maria Reyes. A person can be on only one column a day. Choice and text columns just hold a word or two."],
  ["Names have to match the people list in ChordBase (spelling and spacing; capital letters don't matter). Names that don't are listed before you import, and you can choose to add them as new people."],
  ["Date is required. Leave Event empty for the Sunday service. Time can be like 9:30 AM or 18:30."],
  ["Importing only adds: it never removes anyone who is already on the schedule, and it leaves existing events as they are."],
  ["Need another column? Type a new heading in the first row. When you import, ChordBase offers to create it and asks whether it holds people, a choice from a list, or text."],
];

/** The schedule as a workbook: the table, and a sheet saying how to use it. */
export function scheduleSheets(slots: Slot[], people: Map<string, Person>, columns: ScheduleColumn[]): Sheet[] {
  const cols = activeColumns(columns);
  const first = FIXED_BEFORE.length;
  return [
    {
      name: "Schedule",
      rows: gridRows(slots, people, columns),
      widths: [20, 22, 11, 18, ...cols.map((c) => (c.kind === "people" ? 24 : 22)), 30],
      wrap: [1, 3, ...cols.map((_, i) => first + i), first + cols.length],
    },
    { name: "How to use", rows: HOW_TO.map((r) => r), widths: [110], wrap: [0] },
  ];
}

// ---- Reading what people type ---------------------------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A date from what a person might type or Excel might give: 2026-10-25, 10/25/2026, Oct 25 2026, 25 October 2026, Sunday Oct 25, or an Excel day number. */
export function parseDate(text: string, today: string): string | null {
  const s = text.trim();
  if (!s) return null;
  if (isIsoDate(s)) return s;
  // An Excel day number that wasn't formatted as a date (46026 is 2026-01-04).
  const serial = /^(\d{5})(?:\.\d+)?$/.exec(s);
  if (serial) {
    const n = Number(serial[1]);
    return n >= 25000 && n <= 80000 ? serialToIso(n) : null;
  }
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
  for (const part of cell.split(/[,;\n&/]|\s+and\s+/i)) {
    const name = part.replace(/\s+/g, " ").trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

export const MAX_IMPORT_ROWS = 400;

// ---- Reading headings --------------------------------------------------------------------------------------------------------

/** The headings that mean one of the fixed fields. */
const FIXED_ALIASES: Record<string, "date" | "title" | "time" | "location" | "notes"> = {
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
};

/** Headings people use for the starter columns, so a file from before (or from another church) still lines up. */
const COLUMN_ALIASES: Record<string, string> = {
  songleader: "song-leader",
  leader: "song-leader",
  worshipleader: "song-leader",
  praiseandworshipleader: "song-leader",
  praiseworshipleader: "song-leader",
  vocalist: "song-leader",
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
  audio: "audio",
  sound: "audio",
  soundboard: "audio",
  projection: "projection",
  slides: "projection",
  lyrics: "projection",
  camera: "camera",
  media: "media",
  tech: "media",
};

/** "S O U N D    B O O T H" → "SOUND BOOTH". Headings written with a gap between every letter are joined. */
function closeUp(text: string): string {
  const t = text.trim();
  const tokens = t.split(/\s+/);
  if (tokens.length < 3 || !tokens.every((x) => x.length === 1)) return t;
  return t
    .split(/\s{2,}/)
    .map((word) => word.replace(/\s+/g, ""))
    .join(" ");
}

/** A heading as a label: closed up, "Camera1" → "Camera 1", and SHOUTING sentence-cased ("REV 5 TEAM" → "Rev 5 team"). */
export function tidyLabel(text: string): string {
  let t = closeUp(text).replace(/\s+/g, " ").trim().replace(/([A-Za-z])(\d)/g, "$1 $2");
  if (/[A-Z]/.test(t) && t === t.toUpperCase() && t.length > 3) t = t.charAt(0) + t.slice(1).toLowerCase();
  return t.slice(0, 40);
}

const isLetter = (t: string) => /^[A-Za-z]$/.test(t.trim());

export type DetectedColumn = {
  /** The column's key when it exists already, otherwise a proposed one ("new:dancers"). */
  id: string;
  label: string;
  section: string;
  /** The column this heading matched, or null when it would be new. */
  existing: ScheduleColumn | null;
  kind: ColumnKind;
  options: string[];
  /** Rows with something in this column. */
  used: number;
  sample: string[];
  /** New columns can be left out. */
  include: boolean;
  /** For a new column: the key of a column the church has that it should go into instead. */
  mapTo: string | null;
};

/** One row of a file before it is known which columns will exist: cells are by detected column id. */
export type RawRow = { line: number; sheet: string; date: string; title: string; time: string; location: string; notes: string; cells: Record<string, string> };

export type ParsedImport = { rows: RawRow[]; columns: DetectedColumn[]; issues: ImportIssue[]; ignored: string[]; skippedSheets: string[] };

const BLANK = /^(#ref!|#n\/a|n\/a|-|–|—|tbd|\?)$/i;
const cleanCell = (s: string | undefined) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return BLANK.test(t) ? "" : t;
};

/** What a new column most likely holds, from its heading and what is in it. The person can change it in the preview. */
export function guessKind(label: string, values: string[]): ColumnKind {
  const filled = values.filter(Boolean);
  if (filled.length === 0) return "people";
  const distinct = new Set(filled.map((v) => v.toLowerCase()));
  if (/(type|sunday|team|theme|series|category|status|kind|topic|colou?r)/i.test(label) && distinct.size <= 12) return "choice";
  const words = filled.reduce((n, v) => n + v.split(/\s+/).length, 0) / filled.length;
  if (words > 3 || filled.some((v) => v.length > 40)) return "text";
  return "people";
}

type SheetRead = { rows: RawRow[]; columns: Map<string, DetectedColumn>; issues: ImportIssue[]; ignored: string[] };

const rowText = (cells: string[] | undefined, j: number) => (cells?.[j] ?? "").trim();

/** Reads one sheet, or returns null when it has no heading row with a Date. */
function readSheet(name: string, rows: string[][], today: string, existing: ScheduleColumn[]): SheetRead | null {
  // The heading row: the first (in the top of the sheet) with a "Date" cell.
  let h = -1;
  let dateCol = -1;
  for (let i = 0; i < Math.min(rows.length, 25) && h < 0; i++) {
    const j = (rows[i] ?? []).findIndex((c) => ["date", "day"].includes(norm(c ?? "")));
    if (j >= 0) {
      h = i;
      dateCol = j;
    }
  }
  if (h < 0) return null;

  // Data starts at the first row after the headings with a date. The rows between them are sub-headings (at most two).
  let start = -1;
  for (let i = h + 1; i < rows.length; i++) {
    if (parseDate(rowText(rows[i], dateCol), today)) {
      start = i;
      break;
    }
  }
  const subs = [h + 1, h + 2].filter((i) => start < 0 || i < start);
  const width = Math.max(0, ...rows.slice(h, h + 3).map((r) => r?.length ?? 0), ...rows.slice(start < 0 ? rows.length : start).map((r) => r?.length ?? 0));

  const top = (j: number) => rowText(rows[h], j);
  const sub1 = (j: number) => (subs[0] !== undefined ? rowText(rows[subs[0]], j) : "");
  const sub2 = (j: number) => (subs[1] !== undefined ? rowText(rows[subs[1]], j) : "");

  // The table ends at the second blank column in a row of headings.
  let end = dateCol;
  for (let j = dateCol + 1, gap = 0; j < width && gap < 2; j++) {
    if (top(j) || sub1(j) || sub2(j)) {
      end = j;
      gap = 0;
    } else gap++;
  }

  // Headings a letter to a cell ("B", "A", "N", "D") spell a word across the cells.
  const letterWord = new Map<number, string>();
  for (let j = dateCol + 1; j <= end; j++) {
    if (!isLetter(top(j)) || letterWord.has(j)) continue;
    let k = j;
    let word = "";
    while (k <= end && isLetter(top(k))) word += top(k++).trim();
    for (let x = j; x < k; x++) letterWord.set(x, word);
  }

  const byId = new Map<string, DetectedColumn>();
  const columnAt = new Map<number, string>();
  const fixedAt = new Map<number, "title" | "time" | "location" | "notes">();
  const ignored: string[] = [];
  let section = "";
  for (let j = dateCol + 1; j <= end; j++) {
    const t = top(j);
    const s1 = sub1(j);
    const s2 = sub2(j);
    let raw = "";
    if (s1) {
      section = letterWord.get(j) ? tidyLabel(letterWord.get(j)!) : t ? tidyLabel(t) : section;
      // "1 & 2" under Guitars says there are two of them, not that it is another column.
      raw = s2 && !/^[\d\s&,/+-]+$/.test(s2) ? `${s1} ${s2}` : s1;
    } else if (t) {
      section = "";
      raw = t;
    } else continue;

    const label = tidyLabel(raw);
    const n = norm(label);
    const fixed = FIXED_ALIASES[n];
    if (fixed === "date") continue;
    if (fixed) {
      if (![...fixedAt.values()].includes(fixed)) fixedAt.set(j, fixed);
      else ignored.push(label);
      continue;
    }
    const active = existing.filter((c) => !c.archived);
    const match = active.find((c) => norm(c.label) === n || norm(c.key) === n) ?? active.find((c) => c.key === COLUMN_ALIASES[n]);
    const id = match ? match.key : `new:${slugKey(label)}`;
    if (columnAt.has(j) || [...columnAt.values()].includes(id)) {
      ignored.push(label);
      continue;
    }
    columnAt.set(j, id);
    if (!byId.has(id)) byId.set(id, { id, label: match ? match.label : label, section: match ? match.section : section, existing: match ?? null, kind: match ? match.kind : "people", options: match ? match.options : [], used: 0, sample: [], include: true, mapTo: null });
  }

  const out: RawRow[] = [];
  const issues: ImportIssue[] = [];
  if (start < 0) return { rows: out, columns: byId, issues, ignored };
  for (let i = start; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || cells.every((c) => !(c ?? "").trim())) continue;
    const line = i + 1;
    const dateText = rowText(cells, dateCol);
    const date = parseDate(dateText, today);
    if (!date) {
      // Notes under the table and similar are not worth a warning unless something else is in the row.
      if (dateText || cells.some((c, j) => j !== dateCol && columnAt.has(j) && cleanCell(c))) {
        issues.push({ line, message: dateText ? `“${dateText}” has no date I can read, so the row was skipped. Add it as an event once the rest is in.` : "There's no date, so the row was skipped." });
      }
      continue;
    }
    const fixedValue = (kind: string) => {
      for (const [j, k] of fixedAt) if (k === kind) return cleanCell(cells[j]);
      return "";
    };
    const timeText = fixedValue("time");
    const time = parseTime(timeText) ?? "";
    if (timeText && !time) issues.push({ line, message: `“${timeText}” isn't a time I can read, so the time was left out.` });
    const values: Record<string, string> = {};
    for (const [j, id] of columnAt) {
      const v = cleanCell(cells[j]);
      if (!v) continue;
      values[id] = v;
      const col = byId.get(id)!;
      col.used++;
      if (col.sample.length < 12 && !col.sample.includes(v)) col.sample.push(v);
    }
    out.push({ line, sheet: name, date, title: fixedValue("title"), time, location: fixedValue("location"), notes: fixedValue("notes"), cells: values });
  }
  return { rows: out, columns: byId, issues, ignored };
}

/** Reads the sheets of a workbook that have a table with a Date column, and works out which columns they use. */
export function readWorkbook(sheets: { name: string; rows: string[][] }[], today: string, existing: ScheduleColumn[]): ParsedImport {
  const rows: RawRow[] = [];
  const columns = new Map<string, DetectedColumn>();
  const issues: ImportIssue[] = [];
  const ignored: string[] = [];
  const skippedSheets: string[] = [];
  const multiple = sheets.length > 1;
  for (const sheet of sheets) {
    const read = readSheet(sheet.name, sheet.rows, today, existing);
    if (!read || read.rows.length === 0) {
      if (!read || sheet.rows.some((r) => r?.some((c) => (c ?? "").trim()))) skippedSheets.push(sheet.name);
      continue;
    }
    rows.push(...read.rows);
    for (const issue of read.issues) issues.push(multiple ? { ...issue, message: `${sheet.name}: ${issue.message}` } : issue);
    ignored.push(...read.ignored.filter((x) => !ignored.includes(x)));
    for (const [id, c] of read.columns) {
      const seen = columns.get(id);
      if (!seen) columns.set(id, { ...c });
      else {
        seen.used += c.used;
        for (const v of c.sample) if (seen.sample.length < 12 && !seen.sample.includes(v)) seen.sample.push(v);
      }
    }
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    issues.push({ line: 0, message: `Only the first ${MAX_IMPORT_ROWS} rows can be imported at once, so the rest were left out.` });
    rows.length = MAX_IMPORT_ROWS;
  }
  const list = [...columns.values()];
  for (const c of list) {
    if (c.existing) continue;
    c.kind = guessKind(c.label, c.sample);
    if (c.kind === "choice") c.options = optionsFrom(rows, c.id);
  }
  return { rows, columns: list, issues, ignored, skippedSheets };
}

/** The different values a column holds, in the order they first appear (at most 40). */
export function optionsFrom(rows: RawRow[], id: string): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const v = r.cells[id];
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()].slice(0, 40);
}

/**
 * The rows as the database takes them. `keyOf` gives a detected column's key (for a new column, the key it was given when
 * it was created) or null to leave the column out.
 */
export function toImportRows(raw: RawRow[], columns: DetectedColumn[], keyOf: (c: DetectedColumn) => string | null): ImportRow[] {
  const used = columns.map((c) => ({ c, key: keyOf(c) })).filter((x): x is { c: DetectedColumn; key: string } => !!x.key);
  return raw.map((r) => {
    const assign: Record<string, string[]> = {};
    const fields: Record<string, string> = {};
    for (const { c, key } of used) {
      const v = r.cells[c.id];
      if (!v) continue;
      if (c.kind === "people") {
        // One person to a column: the first name in the cell.
        const [first] = splitNames(v);
        if (first) assign[key] = [first];
      } else fields[key] = c.kind === "choice" ? (c.options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v) : v;
    }
    return { line: r.line, date: r.date, title: r.title, time: r.time, location: r.location, notes: r.notes, assign, fields };
  });
}

// ---- Checking names against the people list ----------------------------------------------------------------------------------

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
