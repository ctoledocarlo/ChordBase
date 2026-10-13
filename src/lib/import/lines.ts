import { isValidChord, type PlacedChord } from "@/lib/chords";
import type { EditorLine } from "@/lib/chords";

// Special characters are built from their codes so the source stays plain ASCII.
const ch = (code: number) => String.fromCharCode(code);
const FLAT = ch(0x266d);
const SHARP = ch(0x266f);
const DASHES = ch(0x2013) + ch(0x2014);

// ---- tokens ------------------------------------------------------------------

export type TokenKind = "chord" | "separator" | "word";

export interface Token {
  /** The token as written. */
  text: string;
  /** Where it starts in the line. */
  index: number;
  kind: TokenKind;
  /** For chords: the chord, cleaned up (flat and sharp signs, brackets). */
  chord?: string;
}

/** Bar lines, slashes, repeat marks and the like, which appear between chords. */
const SEPARATOR = new RegExp(
  "^(?:[|:/\\\\%~*\\-" + DASHES + "]+|\\.{2,}|x\\d+|\\d+x|\\(x?\\d+x?\\)|\\(?repeat\\)?|\\|?:\\|?)$",
  "i",
);

/** A chord as it might be written on a slide, made into the form the app understands. */
export function cleanChord(raw: string): string {
  return raw
    .split(FLAT)
    .join("b")
    .split(SHARP)
    .join("#")
    .replace(/^[([{]+|[)\]}]+$/g, "")
    .replace(/[,;:]+$/, "");
}

export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  for (const m of line.matchAll(/\|+|[^\s|]+/g)) {
    const text = m[0];
    const index = m.index;

    // A chord with a slash stuck to its end ("F#/") is the chord plus a repeat mark.
    if (text.length > 1 && text.endsWith("/")) {
      const head = cleanChord(text.slice(0, -1));
      if (head && isValidChord(head)) {
        tokens.push({ text: text.slice(0, -1), index, kind: "chord", chord: head });
        tokens.push({ text: "/", index: index + text.length - 1, kind: "separator" });
        continue;
      }
    }

    const chord = cleanChord(text);
    let kind: TokenKind = "word";
    if (SEPARATOR.test(text)) kind = "separator";
    else if (chord && isValidChord(chord)) kind = "chord";
    tokens.push({ text, index, kind, chord: kind === "chord" ? chord : undefined });
  }
  return tokens;
}

/** A line that holds only chords (and bar lines, repeat marks and so on). */
export function isChordLine(tokens: Token[]): boolean {
  return tokens.some((t) => t.kind === "chord") && tokens.every((t) => t.kind !== "word");
}

// ---- section headers -----------------------------------------------------------

const KINDS: Record<string, string> = {
  intro: "Intro",
  verse: "Verse",
  chorus: "Chorus",
  "pre-chorus": "Pre-Chorus",
  prechorus: "Pre-Chorus",
  "pre chorus": "Pre-Chorus",
  bridge: "Bridge",
  tag: "Tag",
  interlude: "Interlude",
  instrumental: "Instrumental",
  inst: "Instrumental",
  outro: "Outro",
  ending: "Ending",
  refrain: "Refrain",
  turnaround: "Turnaround",
  vamp: "Vamp",
  coda: "Coda",
  hook: "Hook",
  break: "Break",
  solo: "Solo",
  channel: "Bridge",
  "post-chorus": "Post-Chorus",
  postchorus: "Post-Chorus",
  "post chorus": "Post-Chorus",
  "final chorus": "Final Chorus",
  "last chorus": "Last Chorus",
};

const SHORT: Record<string, string> = { v: "Verse", c: "Chorus", ch: "Chorus", b: "Bridge", pc: "Pre-Chorus" };

const NAME_PATTERN = Object.keys(KINDS)
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/[- ]/g, "[- ]?"))
  .join("|");

// The number must not be the start of a repeat mark: "Intro 2x" is "Intro (2x)", not "Intro 2".
const HEADER = new RegExp("^[\\[(]?\\s*(" + NAME_PATTERN + ")\\s*(?:(\\d+)(?!\\s*x))?\\s*[\\])]?\\s*[-:]?\\s*(.*)$", "i");
const SHORT_HEADER = /^[[(]?\s*(v|c|ch|b|pc)\s*(\d+)\s*[\])]?\s*:?\s*(.*)$/i;
const SHORT_COLON = /^(v|c|ch|b)\s*:\s*(.*)$/i;
const REPEAT = /^\(?\s*(?:x\s*(\d+)|(\d+)\s*x)\s*\)?$/i;

export interface Header {
  label: string;
  /** Chords written on the same line as the header ("Intro: G C D"). */
  chordTokens: Token[];
}

function kindOf(word: string): string {
  const key = word.toLowerCase().replace(/\s+/g, " ").replace(/ /g, "-");
  return KINDS[key] ?? KINDS[word.toLowerCase().replace(/[- ]/g, "")] ?? KINDS[word.toLowerCase()] ?? word;
}

/** What follows a header word: nothing, a repeat count, a note in brackets, or chords. Anything else means it is a lyric. */
function readRest(rest: string): { suffix: string; chordTokens: Token[] } | null {
  const text = rest.trim();
  if (text === "") return { suffix: "", chordTokens: [] };
  const repeat = REPEAT.exec(text);
  if (repeat) return { suffix: `(${repeat[1] ?? repeat[2]}x)`, chordTokens: [] };
  if (/^\([^)]*\)$/.test(text)) return { suffix: text, chordTokens: [] };
  const tokens = tokenize(rest).filter((t) => t.kind !== "separator" || /^x\d+$|^\d+x$/i.test(t.text) === false);
  if (isChordLine(tokens)) return { suffix: "", chordTokens: tokens.map((t) => ({ ...t, index: t.index })) };
  return null;
}

/** Recognises a line such as "VERSE 1:", "Chorus", "[Bridge]" or "Intro (2x)". */
export function parseHeader(line: string): Header | null {
  const text = line.trim();
  if (text === "") return null;

  let base: string | undefined;
  let number: string | undefined;
  let rest = "";

  const named = HEADER.exec(text);
  if (named) {
    base = kindOf(named[1]);
    number = named[2];
    rest = named[3];
  } else {
    const short = SHORT_HEADER.exec(text);
    const colon = SHORT_COLON.exec(text);
    // "B7" and "C2" are valid chords too, so those letters only count as a header with a colon or brackets.
    const ambiguous = short && /^[cb]$/i.test(short[1]) && !/[:\])]/.test(text);
    if (short && !ambiguous) {
      base = SHORT[short[1].toLowerCase()];
      number = short[2];
      rest = short[3];
    } else if (colon) {
      base = SHORT[colon[1].toLowerCase()];
      rest = colon[2];
    }
  }
  if (!base) return null;

  const parsed = readRest(rest);
  if (!parsed) return null;
  const label = [base + (number ? ` ${number}` : ""), parsed.suffix].filter(Boolean).join(" ");
  return { label, chordTokens: parsed.chordTokens };
}

/**
 * A line that spells out the order to play the sections ("Verse > Chorus > Intro (3x)"):
 * an instruction to the band rather than part of the song.
 */
export function isArrangementLine(line: string): boolean {
  const text = line.trim();
  const arrow = ch(0x2192);
  const hasFlow = />|,|\+|->/.test(text) || text.includes(arrow);
  if (!hasFlow) return false;

  const sectionWord = new RegExp("\\b(?:" + NAME_PATTERN + ")\\b", "gi");
  if (!sectionWord.test(text)) return false;
  // Once the section names, numbers, repeat marks and joining symbols are gone, nothing should be left.
  const leftover = text
    .replace(sectionWord, "")
    .replace(/\b(?:x\s*\d+|\d+\s*x|\d+|then|and)\b/gi, "")
    .split(arrow)
    .join("")
    .replace(/[\s>,+()/&:.-]+/g, "");
  return leftover === "";
}

// ---- information lines ---------------------------------------------------------

export type Meta =
  | { kind: "key"; value: string }
  | { kind: "capo"; value: number }
  | { kind: "tempo"; value: number }
  | { kind: "time"; value: string }
  | { kind: "credit" };

const CREDIT = new RegExp(
  "^(?:\\(c\\)|" + ch(0xa9) + "|copyright|ccli|words\\s*(?:and|&)\\s*music|music\\s*(?:and|&)\\s*words|words\\s+by|music\\s+by|lyrics\\s+by|written\\s+by|arr(?:\\.|anged)|used\\s+by\\s+permission|all\\s+rights\\s+reserved|administered\\s+by|public\\s+domain)",
  "i",
);

/** Lines that describe the song rather than being part of it. */
export function parseMeta(line: string): Meta | null {
  const text = line.trim();
  const key = /^key\s*(?:of|:|-)?\s*([A-G][#b]?)\s*(m|min|minor|maj|major)?\s*$/i.exec(text);
  if (key) {
    const minor = /^m(in(or)?)?$/i.test(key[2] ?? "");
    return { kind: "key", value: key[1][0].toUpperCase() + key[1].slice(1) + (minor ? "m" : "") };
  }
  const capo = /^capo\s*(?:on|:|-|at)?\s*(?:fret\s*)?(\d{1,2})\b/i.exec(text);
  if (capo) return { kind: "capo", value: Number(capo[1]) };
  const tempo = /^(?:bpm|tempo)\s*[:=-]?\s*(\d{2,3})\b|^(\d{2,3})\s*bpm\b/i.exec(text);
  if (tempo) return { kind: "tempo", value: Number(tempo[1] ?? tempo[2]) };
  const time = /^time\s*(?:signature)?\s*[:=-]?\s*(\d{1,2}\/\d{1,2})\s*$/i.exec(text);
  if (time) return { kind: "time", value: time[1] };
  if (CREDIT.test(text)) return { kind: "credit" };
  return null;
}

// ---- turning a chord line and a lyric line into one line of the song ------------

/** Removes the spaces that both lines start with, so chords stay lined up over the words. */
function dedent(chordLine: string, lyric: string): [string, string] {
  const lead = (s: string) => /^\s*/.exec(s)![0].length;
  const cut = Math.min(lead(chordLine), lead(lyric));
  return [chordLine.slice(cut), lyric.slice(cut)];
}

/** Puts a chord line over a lyric line. Both are expected to line up column for column (a monospaced font). */
export function pairChordsWithLyric(chordTokens: Token[], chordLine: string, lyricLine: string): EditorLine {
  const [chords, lyric] = dedent(chordLine, lyricLine);
  const shift = chordLine.length - chords.length;
  const tokens = chordTokens.filter((t) => t.kind === "chord");

  let text = lyric.replace(/\s+$/, "");
  const placed: PlacedChord[] = [];
  let previous = -1;
  tokens.forEach((token, i) => {
    let pos = token.index - shift;
    if (pos < 0) pos = 0;
    if (pos > text.length) text = text.padEnd(pos, " ");

    // A chord that lands on the space before a word belongs to that word.
    if (text[pos] === " ") {
      let next = pos;
      while (next < text.length && text[next] === " ") next++;
      const following = tokens[i + 1] ? tokens[i + 1].index - shift : Infinity;
      if (next < text.length && next - pos <= 2 && next < following) pos = next;
    }
    // Two chords can't share a spot; push the later one along.
    if (pos <= previous) pos = previous + 1;
    if (pos > text.length) text = text.padEnd(pos, " ");
    placed.push({ pos, chord: token.chord as string });
    previous = pos;
  });
  // Drop trailing spaces, but keep enough text for the last chord to sit where it was written.
  const lastPos = placed.length ? placed[placed.length - 1].pos : 0;
  return { text: text.slice(0, Math.max(text.trimEnd().length, lastPos)), chords: placed };
}

/** A line of chords with no words under it (an intro, a turnaround): the chords are spaced out evenly. */
export function chordsOnlyLine(tokens: Token[]): EditorLine {
  let text = "";
  const chords: PlacedChord[] = [];
  for (const t of tokens) {
    if (t.kind === "chord") {
      chords.push({ pos: text.length, chord: t.chord as string });
      text += " ".repeat(t.text.length + 1);
    } else {
      text += t.text + " ";
    }
  }
  const lastPos = chords.length ? chords[chords.length - 1].pos : 0;
  return { text: text.trimEnd().padEnd(lastPos, " "), chords };
}
