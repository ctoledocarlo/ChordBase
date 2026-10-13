import { describe, expect, it } from "vitest";
import {
  autoColumnCount,
  balanceColumns,
  columnsOf,
  chordsOf,
  moveInOrder,
  normalizeColumns,
  placeSection,
  type EditorSection,
  cleanLyric,
  isValidChord,
  diatonicChords,
  lineCells,
  parseSections,
  reflowLines,
  serializeSections,
  splitPastedLyrics,
} from "./index";

const BODY = `{start_of_verse: Verse 1}
[G]Amazing [G7]grace, how [C]sweet
That [Em]wretch

Last [D]line
{end_of_verse}

{start_of_chorus: Chorus}
[G]Sing
{end_of_chorus}
`;

describe("sections", () => {
  it("parses sections, lyrics and chord positions", () => {
    const s = parseSections(BODY);
    expect(s.map((x) => x.label)).toEqual(["Verse 1", "Chorus"]);
    expect(s[0].lines[0]).toEqual({
      text: "Amazing grace, how sweet",
      chords: [
        { pos: 0, chord: "G" },
        { pos: 8, chord: "G7" },
        { pos: 19, chord: "C" },
      ],
    });
    expect(s[0].lines[2].text).toBe("");
  });

  it("round-trips through serialize", () => {
    expect(serializeSections(parseSections(BODY))).toBe(BODY);
  });

  it("supports a chord on an empty line and at the end of a line", () => {
    const body = "{start_of_verse: Intro}\n[C]\nHello[D]\n{end_of_verse}\n";
    const s = parseSections(body);
    expect(s[0].lines[0].chords).toEqual([{ pos: 0, chord: "C" }]);
    expect(s[0].lines[1].chords).toEqual([{ pos: 5, chord: "D" }]);
  });

  it("handles songs with no sections", () => {
    const s = parseSections("[G]Hi there\n");
    expect(s).toHaveLength(1);
    expect(s[0].label).toBe("");
  });

  it("strips characters that would break the file format", () => {
    expect(cleanLyric("a [b] {c}")).toBe("a b c");
    expect(cleanLyric("# hi")).toBe(" hi");
  });
});

describe("reflowLines", () => {
  const old = [{ text: "Hello world", chords: [{ pos: 0, chord: "G" }, { pos: 6, chord: "C" }] }];

  it("keeps chords when text is added before them", () => {
    const r = reflowLines(old, ["Oh Hello world"]);
    expect(r[0].chords).toEqual([{ pos: 0, chord: "G" }, { pos: 9, chord: "C" }]);
  });
  it("keeps chords when text is added after them", () => {
    const r = reflowLines(old, ["Hello world again"]);
    expect(r[0].chords).toEqual([{ pos: 0, chord: "G" }, { pos: 6, chord: "C" }]);
  });
  it("keeps chords on untouched lines when a line is inserted", () => {
    const two = [...old, { text: "Next", chords: [{ pos: 0, chord: "D" }] }];
    const r = reflowLines(two, ["Hello world", "New line", "Next"]);
    expect(r[0]).toEqual(old[0]);
    expect(r[1].chords).toEqual([]);
    expect(r[2].chords).toEqual([{ pos: 0, chord: "D" }]);
  });
  it("clamps chords when text is deleted", () => {
    const r = reflowLines(old, ["Hello"]);
    expect(r[0].chords.every((c) => c.pos <= 5)).toBe(true);
  });
});

describe("lineCells", () => {
  it("splits into words, with the chord on the first word of its part", () => {
    const cells = lineCells({
      text: "Amazing grace now",
      chords: [{ pos: 0, chord: "G" }, { pos: 8, chord: "C" }],
    });
    expect(cells).toEqual([
      { start: 0, end: 8, text: "Amazing ", chord: "G" },
      { start: 8, end: 14, text: "grace ", chord: "C" },
      { start: 14, end: 17, text: "now", chord: undefined },
    ]);
  });
  it("keeps lyrics before the first chord", () => {
    const cells = lineCells({ text: "Oh how", chords: [{ pos: 3, chord: "G" }] });
    expect(cells[0]).toMatchObject({ start: 0, text: "Oh ", chord: undefined });
    expect(cells[1]).toMatchObject({ start: 3, text: "how", chord: "G" });
  });
});

describe("diatonicChords", () => {
  it("lists the chords of a major key", () => {
    expect(diatonicChords("G")).toEqual(["G", "Am", "Bm", "C", "D", "Em", "D7"]);
  });
  it("uses flats in flat keys and handles minor", () => {
    expect(diatonicChords("Bb")[3]).toBe("Eb");
    expect(diatonicChords("Am").slice(0, 3)).toEqual(["Am", "C", "Dm"]);
  });
  it("returns nothing for a missing key", () => {
    expect(diatonicChords("")).toEqual([]);
  });
});

describe("isValidChord", () => {
  it.each(["G", "Am7", "F#m7b5", "Bbmaj7", "Csus4", "Dadd9", "A7#9", "Em/G", "C6/9", "Gm7(b5)", "C13", "Cdim7", "N.C."])(
    "accepts %s",
    (c) => expect(isValidChord(c)).toBe(true),
  );
  it.each(["Hm7", "Bad", "am", "", "G##", "Xyz", "C7q"])("rejects %s", (c) =>
    expect(isValidChord(c)).toBe(false),
  );
});

describe("splitPastedLyrics", () => {
  it("splits at empty lines", () => {
    const parts = splitPastedLyrics("one\ntwo\n\nthree\nfour\n\n\nfive");
    expect(parts.map((p) => p.lines)).toEqual([["one", "two"], ["three", "four"], ["five"]]);
    expect(parts.every((p) => p.label === undefined)).toBe(true);
  });
  it("uses a heading line as the part name", () => {
    const parts = splitPastedLyrics("[Chorus]\nla la\nla\n\nVERSE 2:\nhey\nho");
    expect(parts.map((p) => p.label)).toEqual(["Chorus", "Verse 2"]);
    expect(parts[0].lines).toEqual(["la la", "la"]);
  });
  it("keeps a one-line part that looks like a heading", () => {
    expect(splitPastedLyrics("Chorus")[0]).toEqual({ label: undefined, lines: ["Chorus"] });
  });
  it("ignores blank input and handles Windows line endings", () => {
    expect(splitPastedLyrics("  \n ")).toEqual([]);
    expect(splitPastedLyrics("a\r\nb\r\n\r\nc").map((p) => p.lines)).toEqual([["a", "b"], ["c"]]);
  });
});

describe("chordsOf", () => {
  it("lists each chord once", () => {
    const sections = parseSections("[G]a [C]b\n[G]c\n");
    expect(chordsOf(sections)).toEqual(["G", "C"]);
  });
});

const sec = (id: string, column: number, lines = 2): EditorSection => ({
  id,
  label: id.toUpperCase(),
  column,
  lines: Array.from({ length: lines }, () => ({ text: "la", chords: [] })),
});
const ids = (sections: EditorSection[]) => sections.map((s) => s.id).join("");
const cols = (sections: EditorSection[]) => columnsOf(sections).map((c) => ids(c)).join("|");

describe("column layout", () => {
  const NL = String.fromCharCode(10);

  it("saves and restores the columns", () => {
    const layout = [sec("a", 0), sec("b", 0), sec("c", 1), sec("d", 2)];
    const body = serializeSections(layout);
    expect(body.split(NL).filter((l) => l === "{column_break}")).toHaveLength(2);
    const back = parseSections(body);
    expect(back.map((s) => s.label)).toEqual(["A", "B", "C", "D"]);
    expect(back.map((s) => s.column)).toEqual([0, 0, 1, 2]);
  });

  it("writes no break for a single column", () => {
    expect(serializeSections([sec("a", 0), sec("b", 0)])).not.toContain("column_break");
  });

  it("arranges a song with no saved layout automatically", () => {
    const body = Array.from({ length: 6 }, (_, i) => "{start_of_verse: V" + i + "}" + NL + "[G]la" + NL + "x" + NL + "y" + NL + "z" + NL + "{end_of_verse}").join(NL + NL);
    const parsed = parseSections(body);
    expect(new Set(parsed.map((s) => s.column)).size).toBeGreaterThan(1);
  });

  it("keeps sections in reading order and numbers columns without gaps", () => {
    const messy = [sec("a", 2), sec("b", 0), sec("c", 2), sec("d", 5)];
    const tidy = normalizeColumns(messy);
    expect(cols(tidy)).toBe("b|ac|d");
    expect(tidy.map((s) => s.column)).toEqual([0, 1, 1, 2]);
    expect(normalizeColumns(tidy)).toBe(tidy);
  });
});

describe("placeSection", () => {
  const base = [sec("a", 0), sec("b", 0), sec("c", 1), sec("d", 1)];

  it("reorders within a column", () => {
    expect(cols(placeSection(base, "a", { column: 0, index: 1 }))).toBe("ba|cd");
    expect(cols(placeSection(base, "b", { column: 0, index: 0 }))).toBe("ba|cd");
  });
  it("moves to another column at a chosen slot", () => {
    expect(cols(placeSection(base, "a", { column: 1, index: 1 }))).toBe("b|cad");
    expect(cols(placeSection(base, "d", { column: 0, index: 0 }))).toBe("dab|c");
  });
  it("starts a new column when dropped past the last one", () => {
    expect(cols(placeSection(base, "b", { column: 2, index: 0 }))).toBe("a|cd|b");
  });
  it("removes a column that is left empty", () => {
    const result = placeSection([sec("a", 0), sec("b", 1), sec("c", 2)], "b", { column: 0, index: 1 });
    expect(cols(result)).toBe("ab|c");
    expect(result.map((s) => s.column)).toEqual([0, 0, 1]);
  });
  it("leaves the layout alone for an unknown section", () => {
    expect(placeSection(base, "zzz", { column: 0, index: 0 })).toBe(base);
  });
});

describe("moveInOrder", () => {
  it("joins the column of the section it lands on", () => {
    const base = [sec("a", 0), sec("b", 0), sec("c", 1), sec("d", 1)];
    expect(cols(moveInOrder(base, "a", 2))).toBe("b|cad");
    expect(moveInOrder(base, "a", 0)).toBe(base);
  });
  it("moves a section to the start of reading order", () => {
    const base = [sec("a", 0), sec("b", 0), sec("c", 1)];
    expect(ids(moveInOrder(base, "c", 0))).toBe("cab");
    expect(cols(moveInOrder(base, "c", 0))).toBe("cab");
  });
});

describe("balanceColumns", () => {
  const many = Array.from({ length: 6 }, (_, i) => sec("s" + i, 0, 4));

  it("spreads sections over the wanted number of columns, in order", () => {
    const two = balanceColumns(many, 2);
    expect(columnsOf(two)).toHaveLength(2);
    expect(columnsOf(two).map((c) => c.length)).toEqual([3, 3]);
    expect(ids(two)).toBe(ids(many));
  });
  it("can put everything in one column", () => {
    expect(columnsOf(balanceColumns(many, 1))).toHaveLength(1);
  });
  it("never makes more columns than sections", () => {
    expect(columnsOf(balanceColumns([sec("a", 0)], 4))).toHaveLength(1);
  });
  it("picks more columns for longer songs", () => {
    expect(autoColumnCount([sec("a", 0, 3)])).toBe(1);
    expect(autoColumnCount(many)).toBeGreaterThan(1);
  });
});
