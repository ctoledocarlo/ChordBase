import { describe, expect, it } from "vitest";
import { serializeSections } from "@/lib/chords";
import { parseChart } from "./chart";
import { detectKey } from "./key";

const labels = (lines: string[], opts = {}) => parseChart(lines, opts).sections.map((s) => s.label);
const words = (lines: string[], opts = {}) => parseChart(lines, opts).sections.map((s) => s.lines.map((l) => l.text));
const chordPos = (lines: string[], opts = {}) =>
  parseChart(lines, opts).sections.map((s) => s.lines.map((l) => l.chords.map((c) => `${c.chord}@${c.pos}`)));

describe("sections from chords above words", () => {
  const chart = [
    "VERSE 1:",
    "G        C",
    "la la la la la",
    "D       G",
    "na na na na",
    "",
    "CHORUS:",
    "C     G",
    "oh oh oh",
  ];

  it("names sections from their headings", () => {
    expect(labels(chart)).toEqual(["Verse 1", "Chorus"]);
  });

  it("puts each chord line over the words that follow it", () => {
    expect(words(chart)).toEqual([["la la la la la", "na na na na"], ["oh oh oh"]]);
    expect(chordPos(chart)).toEqual([[["G@0", "C@9"], ["D@0", "G@9"]], [["C@0", "G@6"]]]);
  });

  it("counts chord lines and lyric lines", () => {
    const result = parseChart(chart);
    expect(result.chordLineCount).toBe(3);
    expect(result.lyricLineCount).toBe(3);
  });

  it("turns into song text with the chords in the right places", () => {
    const sections = parseChart(chart).sections.map((s, i) => ({ id: `s${i}`, label: s.label, column: 0, lines: s.lines }));
    const text = serializeSections(sections);
    expect(text).toContain("[G]la la la [C]la la");
    expect(text).toContain("{start_of_chorus: Chorus}");
  });
});

describe("a blank line ends a section", () => {
  it("makes the lines after a blank line a new, unnamed section", () => {
    const chart = ["VERSE 1:", "G", "la la", "", "C", "na na"];
    expect(labels(chart)).toEqual(["Verse 1", "Unnamed Section"]);
  });

  it("splits blocks that have no headings into unnamed sections", () => {
    const chart = ["G   C", "la la la", "D   G", "na na na", "", "C   F", "oh oh oh", "G   C", "ah ah ah"];
    expect(labels(chart)).toEqual(["Unnamed Section", "Unnamed Section"]);
    expect(words(chart)).toEqual([["la la la", "na na na"], ["oh oh oh", "ah ah ah"]]);
  });

  it("lets a heading own the lines after a blank line that follows it", () => {
    expect(words(["CHORUS:", "", "la la la", "na na na"])).toEqual([["la la la", "na na na"]]);
  });

  it("joins single lines that were double-spaced into one section", () => {
    const chart = ["la la la", "", "na na na", "", "oh oh oh", "", "ah ah ah"];
    expect(words(chart)).toEqual([["la la la", "na na na", "oh oh oh", "ah ah ah"]]);
  });
});

describe("chord rows without words", () => {
  it("keeps an instrumental row as its own line", () => {
    const result = parseChart(["Intro (2x)", "C#m E/G# / A | / / / /", "", "VERSE 1:", "C#m", "la la"]);
    expect(result.sections.map((s) => s.label)).toEqual(["Intro (2x)", "Verse 1"]);
    expect(result.sections[0].lines[0].chords.map((c) => c.chord)).toEqual(["C#m", "E/G#", "A"]);
  });

  it("reads a header with chords on the same line", () => {
    const result = parseChart(["Intro: G  C  D", "", "VERSE 1:", "G", "la la"]);
    expect(result.sections[0].label).toBe("Intro");
    expect(result.sections[0].lines[0].chords.map((c) => c.chord)).toEqual(["G", "C", "D"]);
  });

  it("keeps a chord row that comes before another chord row", () => {
    const result = parseChart(["VERSE 1:", "G  C", "D  G", "la la la"]);
    expect(result.sections[0].lines).toHaveLength(2);
    expect(result.sections[0].lines[0].chords.map((c) => c.chord)).toEqual(["G", "C"]);
    expect(result.sections[0].lines[1].text).toBe("la la la");
  });
});

describe("the title", () => {
  it("is the first line when the file name matches it", () => {
    const chart = ["Some Song", "", "G", "la la"];
    expect(parseChart(chart, { fileStem: "Some Song" }).title).toBe("Some Song");
    expect(parseChart(chart, { fileStem: "some song" }).title).toBe("Some Song");
  });

  it("splits 'Title Artist' using the file name", () => {
    const result = parseChart(["Alive Hillsongs", "", "G", "la la"], { fileStem: "Alive" });
    expect(result.title).toBe("Alive");
    expect(result.artist).toBe("Hillsongs");
  });

  it("splits 'Title - Artist' and 'Title by Artist'", () => {
    expect(parseChart(["My Song - Some Band", "", "G", "la"]).title).toBe("My Song");
    expect(parseChart(["My Song - Some Band", "", "G", "la"]).artist).toBe("Some Band");
    expect(parseChart(["My Song by Some Band", "", "G", "la"]).artist).toBe("Some Band");
  });

  it("takes a second line as the artist when a blank line follows it", () => {
    const result = parseChart(["My Song", "Some Band", "", "G", "la la"]);
    expect(result.title).toBe("My Song");
    expect(result.artist).toBe("Some Band");
  });

  it("is not taken from a lyric line that has chords above it", () => {
    const result = parseChart(["la la la la", "G   C", "na na", "D   G", "oh oh"], { fileStem: "Different" });
    expect(result.title).toBeUndefined();
    expect(result.sections[0].lines[0].text).toBe("la la la la");
  });

  it("is not taken from the first line of plain lyrics", () => {
    const result = parseChart(["la la la la", "na na na na", "oh oh oh oh"], { fileStem: "Different" });
    expect(result.title).toBeUndefined();
    expect(words(["la la la la", "na na na na"])).toEqual([["la la la la", "na na na na"]]);
  });

  it("changes ALL CAPS to normal capitals", () => {
    expect(parseChart(["MY SONG", "", "G", "la"]).title).toBe("My Song");
  });

  it("is removed from the song when a later slide repeats it", () => {
    const result = parseChart(["My Song", "", "G", "la la"], { knownTitle: "My Song" });
    expect(result.sections.flatMap((s) => s.lines.map((l) => l.text))).toEqual(["la la"]);
  });

  it("does not become a section heading", () => {
    expect(labels(["Verse 1", "G", "la la"])).toEqual(["Verse 1"]);
  });
});

describe("information, notes and credits", () => {
  it("reads key, capo, tempo and time signature", () => {
    const result = parseChart(["Key: Bb", "Capo 3", "BPM: 76", "Time: 6/8", "", "G", "la la"]);
    expect(result).toMatchObject({ key: "Bb", capo: 3, tempo: 76, timeSignature: "6/8" });
    expect(result.sections.flatMap((s) => s.lines.map((l) => l.text))).toEqual(["la la"]);
  });

  it("leaves credits and copyright lines out", () => {
    const result = parseChart(["VERSE 1:", "G", "la la", "", "CCLI Song # 12345", "(c) 2010 Somebody", "Words and Music by Someone"]);
    expect(words(["VERSE 1:", "G", "la la", "", "CCLI Song # 12345"])).toEqual([["la la"]]);
    expect(result.sections).toHaveLength(1);
  });

  it("keeps a bracketed note before the song out of the lyrics", () => {
    const result = parseChart(["My Song", "(Drums come in at the chorus)", "", "G", "la la"], { fileStem: "My Song" });
    expect(result.notes).toEqual(["(Drums come in at the chorus)"]);
    expect(result.sections.flatMap((s) => s.lines.map((l) => l.text))).toEqual(["la la"]);
  });

  it("keeps a song-order line out of the lyrics", () => {
    const result = parseChart(["VERSE 1:", "G", "la la", "", "Verse 1 > Chorus > Verse 2"]);
    expect(result.notes).toEqual(["Verse 1 > Chorus > Verse 2"]);
    expect(result.sections).toHaveLength(1);
  });
});

describe("other ways charts are written", () => {
  it("reads chords already written in the song's own format", () => {
    const result = parseChart(["VERSE 1:", "[G]la la [C]la", "[D]na na"]);
    expect(result.sections[0].lines[0]).toEqual({ text: "la la la", chords: [{ pos: 0, chord: "G" }, { pos: 6, chord: "C" }] });
  });

  it("imports plain lyrics with no chords", () => {
    const result = parseChart(["VERSE 1:", "la la la", "na na na", "", "CHORUS:", "oh oh oh"]);
    expect(result.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"]);
    expect(result.chordLineCount).toBe(0);
  });

  it("reads Windows-style spacing in the chord line", () => {
    expect(chordPos(["G    C", "la la la la"])).toEqual([[["G@0", "C@6"]]]);
  });

  it("handles an empty slide", () => {
    expect(parseChart([]).sections).toEqual([]);
    expect(parseChart(["", "  ", ""]).sections).toEqual([]);
  });

  it("handles a title-only slide", () => {
    const result = parseChart(["My Song"], { fileStem: "My Song" });
    expect(result.title).toBe("My Song");
    expect(result.sections).toEqual([]);
  });
});

describe("detectKey", () => {
  it("finds the key from the chords", () => {
    expect(detectKey(["G", "C", "D", "G", "Em", "C", "D", "G"])?.key).toBe("G");
    expect(detectKey(["D", "A", "Bm", "G", "D", "A", "G", "D"])?.key).toBe("D");
    expect(detectKey(["Bb", "Eb", "F", "Gm", "Bb"])?.key).toBe("Bb");
  });

  it("chooses the minor key when the song starts and ends there", () => {
    expect(detectKey(["Am", "F", "C", "G", "Am", "F", "G", "Am"])?.key).toBe("Am");
    expect(detectKey(["C#m", "E", "A", "B", "C#m"])?.key).toBe("C#m");
  });

  it("uses flat or sharp names to suit the key", () => {
    expect(detectKey(["Eb", "Ab", "Bb", "Eb"])?.key).toBe("Eb");
    expect(detectKey(["F#", "B", "C#", "F#"])?.key).toBe("F#");
  });

  it("copes with slash chords, sevenths and added notes", () => {
    expect(detectKey(["G", "D/F#", "Em7", "Cadd9", "G/B", "Am7", "D7", "G"])?.key).toBe("G");
  });

  it("gives nothing when there are no chords", () => {
    expect(detectKey([])).toBeNull();
    expect(detectKey(["N.C."])).toBeNull();
  });

  it("says when it is unsure", () => {
    expect(detectKey(["C", "G", "Am", "F"])?.confidence).toBeDefined();
  });
});
