import { parseLyricLine, type EditorLine, type PlacedChord } from "@/lib/chords";
import {
  chordsOnlyLine,
  isArrangementLine,
  isChordLine,
  pairChordsWithLyric,
  parseHeader,
  parseMeta,
  tokenize,
  type Token,
} from "./lines";

export interface ChartSection {
  label: string;
  /** True when the slide named this section; false for a block of lines with no heading. */
  headed: boolean;
  lines: EditorLine[];
}

/** What one slide (or run of lines) says about a song. */
export interface ParsedChart {
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  timeSignature?: string;
  sections: ChartSection[];
  /** Lines in brackets before the song starts, such as "(Steel drums)": performance notes, not lyrics. */
  notes: string[];
  chordLineCount: number;
  lyricLineCount: number;
}

export const UNNAMED = "Unnamed Section";

/** Letters and digits only, lower case: for comparing names that differ in spacing or punctuation. */
export const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const blank = (s: string | undefined) => s === undefined || s.trim() === "";

function titleCase(text: string): string {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4 || letters !== letters.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

/** Splits "Title Artist" using the file name as a guide, or "Title - Artist" / "Title by Artist". */
function splitTitle(line: string, stem?: string): { title: string; artist?: string } {
  const text = line.trim();
  if (stem) {
    const wanted = normalize(stem);
    const words = text.split(/\s+/);
    for (let k = 1; k <= words.length; k++) {
      const head = words.slice(0, k).join(" ");
      if (normalize(head) === wanted) {
        const rest = words.slice(k).join(" ").replace(/^[-–—:,]\s*|^by\s+/i, "").trim();
        return { title: head, artist: rest || undefined };
      }
    }
  }
  const dash = /^(.+?)\s+(?:-|–|—|by)\s+(.+)$/i.exec(text);
  if (dash) return { title: dash[1].trim(), artist: dash[2].trim() };
  return { title: text };
}

function chordLineFrom(line: string): EditorLine {
  let text = "";
  const chords: PlacedChord[] = [];
  for (const seg of parseLyricLine(line)) {
    if (seg.chord) chords.push({ pos: text.length, chord: seg.chord });
    text += seg.lyric;
  }
  return { text, chords };
}

/** How many lines in a row, from `from`, each stand alone with a blank line after them. */
function singleLineRun(lines: string[], from: number): number {
  let count = 0;
  let at = from;
  while (at < lines.length && !blank(lines[at]) && blank(lines[at + 1])) {
    count++;
    at++;
    while (at < lines.length && blank(lines[at])) at++;
  }
  return count;
}

const hasInlineChords = (line: string) => /\[[A-G][^\]]*\]/.test(line);

interface Options {
  /** The file name without its extension: a strong hint for the title. */
  fileStem?: string;
  /** A title already found on an earlier slide of the same song. */
  knownTitle?: string;
}

/**
 * Reads the lines of a chord chart (or plain lyrics) into sections.
 * Chord lines are recognised by holding nothing but chords; each one is put
 * over the lyric line that follows it.
 */
export function parseChart(rawLines: string[], options: Options = {}): ParsedChart {
  const lines = rawLines;
  const chart: ParsedChart = { sections: [], notes: [], chordLineCount: 0, lyricLineCount: 0 };
  let i = 0;
  while (i < lines.length && blank(lines[i])) i++;

  // ---- title block --------------------------------------------------------
  const structural = (l: string) => !!parseHeader(l) || !!parseMeta(l) || isChordLine(tokenize(l));
  if (i < lines.length && !structural(lines[i])) {
    const first = lines[i];
    const matchesName = (l: string) => {
      const n = normalize(l);
      return (
        n.length > 0 &&
        [options.fileStem, options.knownTitle].some((t) => {
          const want = t ? normalize(t) : "";
          return want.length > 0 && n.startsWith(want);
        })
      );
    };
    const next = lines[i + 1];
    const afterNext = lines[i + 2];
    const nextIsChords = next !== undefined && isChordLine(tokenize(next));

    // The line under the first one stands apart from what comes after it: either it ends the slide,
    // or a blank line follows it and more text comes after that.
    const nextStandsAlone =
      next !== undefined &&
      !blank(next) &&
      !nextIsChords &&
      !structural(next) &&
      !/^\(.*\)$/.test(next.trim()) &&
      (afterNext === undefined || (blank(afterNext) && lines.slice(i + 3).some((l) => !blank(l))));

    let isTitle = false;
    let artistLine: string | undefined;
    if (matchesName(first)) isTitle = true;
    // A first line followed by a blank one is a title, unless every line of the slide is
    // set apart like that (double-spaced lyrics).
    else if (blank(next)) isTitle = singleLineRun(lines, i) < 3;
    // Two lines and then a gap, with more to come: a title and an artist.
    else if (nextStandsAlone && afterNext !== undefined) isTitle = true;

    // A short line directly under the title, set apart from the rest, is the artist.
    if (isTitle && nextStandsAlone && (next as string).trim().length <= 60) artistLine = next;

    if (isTitle) {
      const { title, artist } = splitTitle(first, options.fileStem ?? options.knownTitle);
      chart.title = titleCase(title);
      chart.artist = artist ? titleCase(artist) : undefined;
      i += 1;
      if (artistLine !== undefined) {
        if (!parseMeta(artistLine)) chart.artist ??= titleCase(artistLine.trim().replace(/^by\s+/i, ""));
        i += 1;
      }
    }
  }

  // ---- body ---------------------------------------------------------------
  let current: ChartSection | null = null;
  let pending: { tokens: Token[]; line: string } | null = null;
  let sawBlank = false;

  const startSection = (label: string, headed: boolean) => {
    current = { label, headed, lines: [] };
    chart.sections.push(current);
    return current;
  };
  const addLine = (line: EditorLine) => {
    (current ?? startSection(UNNAMED, false)).lines.push(line);
  };
  /** A chord line with no words under it becomes a line of its own. */
  const flushChords = () => {
    if (!pending) return;
    addLine(chordsOnlyLine(pending.tokens));
    chart.chordLineCount++;
    pending = null;
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (blank(line)) {
      flushChords();
      sawBlank = true;
      continue;
    }

    // A line wholly in brackets before the song begins is a note to the band, not a lyric.
    if (chart.sections.length === 0 && !pending && /^\(.*\)$/.test(line.trim())) {
      chart.notes.push(line.trim());
      continue;
    }

    const meta = parseMeta(line);
    if (meta) {
      if (meta.kind === "key") chart.key = meta.value;
      else if (meta.kind === "capo") chart.capo = meta.value;
      else if (meta.kind === "tempo") chart.tempo = meta.value;
      else if (meta.kind === "time") chart.timeSignature = meta.value;
      continue;
    }

    const header = parseHeader(line);
    if (!header && isArrangementLine(line)) {
      flushChords();
      chart.notes.push(line.trim());
      continue;
    }
    if (header) {
      flushChords();
      startSection(header.label, true);
      sawBlank = false;
      if (header.chordTokens.length > 0) pending = { tokens: header.chordTokens, line };
      continue;
    }

    // A blank line ends a section: whatever follows without a heading of its own is a new, unnamed one.
    // (A heading followed straight away by a blank line still owns the lines after it.)
    const startOfContent = () => {
      if (!sawBlank) return;
      sawBlank = false;
      const section: ChartSection | null = current;
      if (section && section.lines.length > 0) startSection(UNNAMED, false);
    };

    const tokens = tokenize(line);
    if (isChordLine(tokens)) {
      flushChords();
      startOfContent();
      pending = { tokens, line };
      continue;
    }

    startOfContent();
    chart.lyricLineCount++;
    if (hasInlineChords(line)) {
      flushChords();
      addLine(chordLineFrom(line.trimEnd()));
    } else if (pending) {
      addLine(pairChordsWithLyric(pending.tokens, pending.line, line));
      chart.chordLineCount++;
      pending = null;
    } else {
      addLine({ text: line.trim(), chords: [] });
    }
  }
  flushChords();

  // Tidy: no empty sections, no blank lines at the end of a section.
  for (const s of chart.sections) {
    while (s.lines.length > 0 && s.lines[s.lines.length - 1].text === "" && s.lines[s.lines.length - 1].chords.length === 0) {
      s.lines.pop();
    }
  }
  chart.sections = chart.sections.filter((s) => s.lines.length > 0);

  // Single lines separated by blank lines are one block of text that was double-spaced, not many sections.
  const merged: ChartSection[] = [];
  let canJoin = false;
  for (const s of chart.sections) {
    const lonely = !s.headed && s.lines.length === 1 && s.lines[0].chords.length === 0;
    if (lonely && canJoin) merged[merged.length - 1].lines.push(...s.lines);
    else merged.push(s);
    canJoin = lonely;
  }
  chart.sections = merged;
  return chart;
}
