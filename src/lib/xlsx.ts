import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * A small Excel (.xlsx) reader and writer, enough for a schedule: one table per sheet, text, dates and times, a
 * styled header row, column widths and a frozen top row. It uses the zip library the PowerPoint import already has,
 * so there is nothing more to install. A .xlsx file is a zip of small XML files; only the parts needed are read.
 */

export type Cell = string | number | null | { date: string } | { time: string };

export type Sheet = {
  name: string;
  rows: Cell[][];
  /** Column widths in characters. */
  widths?: number[];
  /** Columns (0-based) whose long text should wrap onto several lines. */
  wrap?: number[];
};

// ---- Writing ---------------------------------------------------------------------------------------------------------

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// XML 1.0 can't hold most control characters.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

export function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** "2026-10-25" as an Excel day number (days since 1899-12-30). */
export function isoToSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** An Excel day number as "2026-10-25". */
export function serialToIso(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const timeToFraction = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? (Number(m[1]) * 60 + Number(m[2])) / 1440 : null;
};

const fractionToTime = (fraction: number): string => {
  const minutes = Math.round((fraction % 1) * 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

// Style numbers in the styles part below: 0 plain, 1 header, 2 date, 3 time, 4 wrapped text, 5 plain text with a top alignment.
const STYLE = { plain: 0, header: 1, date: 2, time: 3, wrap: 4 } as const;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="ddd\\ d\\ mmm\\ yyyy"/><numFmt numFmtId="165" formatCode="h:mm\\ AM/PM"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sheet: Sheet): string {
  const wrap = new Set(sheet.wrap ?? []);
  const cols = (sheet.widths ?? []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell === null || cell === "") return "";
          const ref = `${columnName(c)}${r + 1}`;
          const header = r === 0;
          if (typeof cell === "number") return `<c r="${ref}" s="${STYLE.plain}"><v>${cell}</v></c>`;
          if (typeof cell === "object" && "date" in cell) {
            const serial = isoToSerial(cell.date);
            return serial === null ? "" : `<c r="${ref}" s="${STYLE.date}"><v>${serial}</v></c>`;
          }
          if (typeof cell === "object" && "time" in cell) {
            const fraction = timeToFraction(cell.time);
            return fraction === null ? "" : `<c r="${ref}" s="${STYLE.time}"><v>${fraction}</v></c>`;
          }
          const style = header ? STYLE.header : wrap.has(c) ? STYLE.wrap : STYLE.plain;
          return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(clean(cell))}</t></is></c>`;
        })
        .join("");
      const height = r === 0 ? ' ht="24" customHeight="1"' : "";
      return `<row r="${r + 1}"${height}>${cells}</row>`;
    })
    .join("");
  const frozen = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${frozen}<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData></worksheet>`;
}

/** Builds an .xlsx file. */
export function writeXlsx(sheets: Sheet[]): Uint8Array {
  const used = new Set<string>();
  const names = sheets.map((s, i) => {
    let name = clean(s.name).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || `Sheet${i + 1}`;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${i + 1}`;
    used.add(name.toLowerCase());
    return name;
  });
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES_XML),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}

// ---- Reading ---------------------------------------------------------------------------------------------------------

/** Files bigger than this are refused before anything is unpacked. */
export const MAX_XLSX_BYTES = 3 * 1024 * 1024;
const MAX_UNPACKED = 25 * 1024 * 1024;

const unescapeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** The text inside the <t> parts of a string item (rich text has several), leaving out phonetic hints. */
function textOf(xml: string): string {
  const without = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of without.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += unescapeXml(m[1] ?? "");
  return out;
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Which style numbers show dates or times, read from the styles part. */
function dateStyles(stylesXml: string | undefined): { date: Set<number>; time: Set<number> } {
  const date = new Set<number>();
  const time = new Set<number>();
  if (!stylesXml) return { date, time };
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode");
    if (!Number.isNaN(id) && code !== undefined) custom.set(id, unescapeXml(code));
  }
  const kind = (id: number): "date" | "time" | "both" | null => {
    if ((id >= 14 && id <= 17) || id === 22) return id === 22 ? "both" : "date";
    if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47)) return "time";
    const code = custom.get(id);
    if (!code) return null;
    // Leave out quoted text, [colours] and escaped characters; what is left says whether it shows a date or a time.
    const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "").toLowerCase();
    const d = /[dy]/.test(bare) || /m{3,}/.test(bare);
    const t = /[hs]/.test(bare) || /am\/pm/.test(bare);
    return d && t ? "both" : d ? "date" : t ? "time" : null;
  };
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? "";
  let index = 0;
  for (const m of xfs.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)) {
    const k = kind(Number(attr(m[0], "numFmtId") ?? 0));
    if (k === "date" || k === "both") date.add(index);
    if (k === "time" || k === "both") time.add(index);
    index++;
  }
  return { date, time };
}

/** Reads the first sheet (or the one called `prefer`) of an .xlsx file as rows of text. Dates and times come back as "2026-10-25" and "09:30". */
export function readXlsx(bytes: Uint8Array, prefer = "Schedule"): { name: string; rows: string[][] } {
  if (bytes.length > MAX_XLSX_BYTES) throw new Error("That file is too big (up to 3 MB).");
  let unpacked: Record<string, Uint8Array>;
  try {
    let total = 0;
    unpacked = unzipSync(bytes, {
      filter: (file) => {
        total += file.originalSize;
        if (total > MAX_UNPACKED) throw new Error("too big");
        return /^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/styles\.xml|xl\/worksheets\/[^/]+\.xml)$/.test(file.name);
      },
    });
  } catch {
    throw new Error("That doesn't look like an Excel (.xlsx) file.");
  }
  const text = (name: string) => (unpacked[name] ? strFromU8(unpacked[name]) : undefined);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new Error("That doesn't look like an Excel (.xlsx) file.");

  // Which part holds the sheet: the one called `prefer`, else the first.
  const rels = new Map<string, string>();
  for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, "xl/"));
  }
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: unescapeXml(attr(m[0], "name") ?? ""), rid: attr(m[0], "r:id") ?? "" }));
  const picked = sheets.find((s) => s.name.toLowerCase() === prefer.toLowerCase()) ?? sheets[0];
  const path = (picked && rels.get(picked.rid)) || "xl/worksheets/sheet1.xml";
  const sheet = text(path);
  if (!sheet) throw new Error("That file has no sheet to read.");

  const shared: string[] = [];
  for (const m of (text("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) shared.push(textOf(m[1] ?? ""));
  const styles = dateStyles(text("xl/styles.xml"));

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowIndex = Number(attr(rowMatch[1], "r") ?? rows.length + 1) - 1;
    const cells: string[] = [];
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r") ?? "";
      const type = attr(c[1], "t");
      const style = Number(attr(c[1], "s") ?? 0);
      const inner = c[2] ?? "";
      let value = "";
      if (type === "inlineStr") value = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "");
      else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) {
          const raw = unescapeXml(v);
          if (type === "s") value = shared[Number(raw)] ?? "";
          else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
          else if (type === "str" || type === "e") value = raw;
          else {
            const n = Number(raw);
            if (!Number.isNaN(n) && styles.date.has(style) && n >= 1) value = serialToIso(n) + (styles.time.has(style) && n % 1 > 0 ? ` ${fractionToTime(n)}` : "");
            else if (!Number.isNaN(n) && styles.time.has(style)) value = fractionToTime(n);
            else value = raw;
          }
        }
      }
      const col = ref ? columnIndex(ref) : cells.length;
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }
  return { name: picked?.name ?? "Sheet1", rows };
}
