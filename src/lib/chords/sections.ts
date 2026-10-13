import { parseChordPro } from "./chordpro";

/** A chord sitting before the character at `pos` in a line's text. */
export interface PlacedChord {
  pos: number;
  chord: string;
}

export interface EditorLine {
  text: string;
  chords: PlacedChord[];
}

export interface EditorSection {
  id: string;
  label: string;
  /** Which column of the screen the section sits in (0 is the leftmost). */
  column: number;
  lines: EditorLine[];
}

/** A piece of a line that wraps as one unit: an optional chord over a word. */
export interface Cell {
  start: number;
  end: number;
  text: string;
  chord?: string;
}

const isBlank = (l: EditorLine) => l.text === "" && l.chords.length === 0;

/** Characters that would be read as ChordPro syntax are removed from lyrics. */
export function cleanLyric(text: string): string {
  return text.replace(/[[\]{}]/g, "").replace(/^\s*#+/, "");
}

export function newSectionId(sections: EditorSection[]): string {
  const max = sections.reduce((m, s) => Math.max(m, Number(s.id.slice(1)) || 0), 0);
  return `s${max + 1}`;
}

export function parseSections(body: string): EditorSection[] {
  const sections: EditorSection[] = [];
  let current: EditorSection | null = null;
  let column = 0;
  let sawBreak = false;
  const start = (label: string): EditorSection => {
    const s = { id: `s${sections.length + 1}`, label, column, lines: [] as EditorLine[] };
    sections.push(s);
    current = s;
    return s;
  };

  for (const line of parseChordPro(body).lines) {
    if (line.type === "section") {
      start(line.label);
    } else if (line.type === "column_break") {
      column++;
      sawBreak = true;
      current = null;
    } else if (line.type === "blank") {
      const cur = current as EditorSection | null;
      if (cur && cur.lines.length > 0) cur.lines.push({ text: "", chords: [] });
    } else {
      const target = (current as EditorSection | null) ?? start("");
      if (line.type === "comment") {
        target.lines.push({ text: line.text, chords: [] });
      } else if (line.type === "lyrics") {
        let text = "";
        const chords: PlacedChord[] = [];
        for (const seg of line.segments) {
          if (seg.chord) chords.push({ pos: text.length, chord: seg.chord });
          text += seg.lyric;
        }
        target.lines.push({ text, chords });
      }
    }
  }

  for (const s of sections) {
    while (s.lines.length > 0 && isBlank(s.lines[s.lines.length - 1])) s.lines.pop();
  }
  const kept = sections.filter((s) => s.lines.length > 0 || s.label !== "");
  // Songs saved without a layout get an automatic one; saved layouts are kept as written.
  return sawBreak ? normalizeColumns(kept) : balanceColumns(kept, autoColumnCount(kept));
}

function sectionKind(label: string): string {
  const l = label.toLowerCase();
  if (l.startsWith("chorus")) return "chorus";
  if (l.startsWith("bridge")) return "bridge";
  return "verse";
}

export function lineToChordPro(line: EditorLine): string {
  const chords = [...line.chords].sort((a, b) => a.pos - b.pos);
  let out = "";
  let last = 0;
  for (const c of chords) {
    out += line.text.slice(last, c.pos) + `[${c.chord}]`;
    last = c.pos;
  }
  return out + line.text.slice(last);
}

export function serializeSections(sections: EditorSection[]): string {
  const out: string[] = [];
  const gap = () => {
    if (out.length > 0) out.push("");
  };
  columnsOf(sections).forEach((column, ci) => {
    if (ci > 0) {
      gap();
      out.push("{column_break}");
    }
    for (const s of column) {
      gap();
      const label = s.label.replace(/[{}[\]]/g, "").trim() || "Unnamed Section";
      const kind = sectionKind(label);
      out.push(`{start_of_${kind}: ${label}}`);
      for (const line of s.lines) out.push(lineToChordPro(line));
      out.push(`{end_of_${kind}}`);
    }
  });
  return out.join("\n") + "\n";
}

// ---- layout: which column each section sits in --------------------------------

/** Where a dragged section lands: a column (one past the last makes a new column) and a slot in it. */
export interface DropTarget {
  column: number;
  /** Position among the column's other sections, i.e. not counting the one being moved. */
  index: number;
}

const weight = (s: EditorSection) => s.lines.length + 2;

/** Sections grouped by column, left to right, each column in top-to-bottom order. */
export function columnsOf(sections: EditorSection[]): EditorSection[][] {
  const keys = [...new Set(sections.map((s) => s.column))].sort((a, b) => a - b);
  return keys.map((k) => sections.filter((s) => s.column === k));
}

/**
 * Keeps the sections in reading order (column by column) with columns numbered
 * 0, 1, 2… and no gaps. Returns the same array when it is already in that shape.
 */
export function normalizeColumns(sections: EditorSection[]): EditorSection[] {
  let previous = -1;
  let tidy = true;
  for (const s of sections) {
    if (s.column === previous) continue;
    if (s.column !== previous + 1) {
      tidy = false;
      break;
    }
    previous = s.column;
  }
  if (tidy) return sections;
  return columnsOf(sections).flatMap((column, i) => column.map((s) => ({ ...s, column: i })));
}

/** Moves one section to a new spot in the layout, dropping any column that ends up empty. */
export function placeSection(sections: EditorSection[], id: string, target: DropTarget): EditorSection[] {
  const moving = sections.find((s) => s.id === id);
  if (!moving) return sections;
  const columns = columnsOf(sections).map((column) => column.filter((s) => s.id !== id));
  const at = Math.min(Math.max(target.column, 0), columns.length);
  if (at === columns.length) columns.push([]);
  const slot = Math.min(Math.max(target.index, 0), columns[at].length);
  columns[at].splice(slot, 0, moving);
  return columns.filter((c) => c.length > 0).flatMap((column, i) => column.map((s) => ({ ...s, column: i })));
}

/** Moves a section to `toIndex` in reading order, joining the column of the section it lands on. */
export function moveInOrder(sections: EditorSection[], id: string, toIndex: number): EditorSection[] {
  const from = sections.findIndex((s) => s.id === id);
  if (from < 0 || from === toIndex || sections.length === 0) return sections;
  const landing = sections[Math.min(Math.max(toIndex, 0), sections.length - 1)];
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(toIndex, 0, { ...moved, column: landing.column });
  return normalizeColumns(next);
}

/** How many columns suit a song of this length when nobody has arranged it yet. */
export function autoColumnCount(sections: EditorSection[]): number {
  const total = sections.reduce((sum, s) => sum + weight(s), 0);
  const wanted = total <= 16 ? 1 : total <= 32 ? 2 : total <= 50 ? 3 : 4;
  return Math.max(1, Math.min(wanted, sections.length));
}

/** Spreads the sections, in their current order, over `count` columns of similar height. */
export function balanceColumns(sections: EditorSection[], count: number): EditorSection[] {
  const n = Math.max(1, Math.round(count));
  const total = sections.reduce((sum, s) => sum + weight(s), 0);
  const per = total / n || 1;
  let used = 0;
  const spread = sections.map((s) => {
    const column = Math.min(n - 1, Math.floor((used + weight(s) / 2) / per));
    used += weight(s);
    return { ...s, column };
  });
  return normalizeColumns(spread);
}

function shiftChords(oldText: string, newText: string, chords: PlacedChord[]): PlacedChord[] {
  let p = 0;
  const maxP = Math.min(oldText.length, newText.length);
  while (p < maxP && oldText[p] === newText[p]) p++;
  let sfx = 0;
  while (
    sfx < maxP - p &&
    oldText[oldText.length - 1 - sfx] === newText[newText.length - 1 - sfx]
  ) {
    sfx++;
  }
  const delta = newText.length - oldText.length;
  const seen = new Set<number>();
  const out: PlacedChord[] = [];
  for (const c of chords) {
    let pos = c.pos;
    if (pos > p) pos = pos >= oldText.length - sfx ? pos + delta : p;
    pos = Math.max(0, Math.min(pos, newText.length));
    if (seen.has(pos)) continue;
    seen.add(pos);
    out.push({ pos, chord: c.chord });
  }
  return out;
}

/** New lyric text for a section, keeping each chord on the syllable it was on. */
export function reflowLines(old: EditorLine[], newTexts: string[]): EditorLine[] {
  let p = 0;
  while (p < old.length && p < newTexts.length && old[p].text === newTexts[p]) p++;
  let s = 0;
  while (
    s < old.length - p &&
    s < newTexts.length - p &&
    old[old.length - 1 - s].text === newTexts[newTexts.length - 1 - s]
  ) {
    s++;
  }
  const oldMid = old.slice(p, old.length - s);
  const newMid = newTexts.slice(p, newTexts.length - s);
  return [
    ...old.slice(0, p),
    ...newMid.map((text, j) => ({
      text,
      chords: oldMid[j] ? shiftChords(oldMid[j].text, text, oldMid[j].chords) : [],
    })),
    ...old.slice(old.length - s),
  ];
}

/** Splits lyrics into word-sized pieces so long lines can wrap. */
export function wrapPieces(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

export function lineCells(line: EditorLine): Cell[] {
  const chords = [...line.chords].sort((a, b) => a.pos - b.pos);
  const bounds: { start: number; end: number; chord?: string }[] = [];
  if (chords.length === 0 || chords[0].pos > 0) {
    bounds.push({ start: 0, end: chords[0]?.pos ?? line.text.length });
  }
  chords.forEach((c, i) => {
    bounds.push({ start: c.pos, end: chords[i + 1]?.pos ?? line.text.length, chord: c.chord });
  });

  const cells: Cell[] = [];
  for (const b of bounds) {
    const text = line.text.slice(b.start, b.end);
    if (text === "") {
      if (b.chord) cells.push({ start: b.start, end: b.end, text: "", chord: b.chord });
      continue;
    }
    let at = b.start;
    wrapPieces(text).forEach((piece, i) => {
      cells.push({ start: at, end: at + piece.length, text: piece, chord: i === 0 ? b.chord : undefined });
      at += piece.length;
    });
  }
  return cells;
}

const LABEL_RE =
  /^(intro|verse|pre[- ]?chorus|chorus|bridge|tag|interlude|instrumental|outro|refrain|ending)(?:\s*\d+)?\s*:?$/i;

const titleCase = (text: string) =>
  text
    .trim()
    .replace(/:$/, "")
    .toLowerCase()
    .replace(/(^|[\s-])(\w)/g, (_, a: string, b: string) => a + b.toUpperCase());

export interface PastedPart {
  /** Taken from a heading line such as "Chorus" or "[Verse 2]", when there is one. */
  label?: string;
  lines: string[];
}

/** Splits pasted lyrics into parts at every empty line. */
export function splitPastedLyrics(text: string): PastedPart[] {
  const parts: PastedPart[] = [];
  for (const block of text.replace(/\r\n?/g, "\n").trim().split(/\n[ \t]*\n+/)) {
    const lines = block.split("\n").map((l) => cleanLyric(l).replace(/\s+$/, ""));
    let label: string | undefined;
    if (lines.length > 1 && LABEL_RE.test(lines[0].trim())) label = titleCase(lines.shift()!);
    if (lines.some((l) => l.trim() !== "")) parts.push({ label, lines });
  }
  return parts;
}

/** Every chord written in the song, once each, in order of first appearance. */
export function chordsOf(sections: EditorSection[]): string[] {
  const seen = new Set<string>();
  for (const s of sections) for (const l of s.lines) for (const c of l.chords) seen.add(c.chord);
  return [...seen];
}
