import { describe, expect, it } from "vitest";
import {
  chordsOnlyLine,
  isArrangementLine,
  isChordLine,
  pairChordsWithLyric,
  parseHeader,
  parseMeta,
  tokenize,
} from "./lines";

const chordsOf = (line: string) => tokenize(line).filter((t) => t.kind === "chord").map((t) => t.chord);

describe("tokenize and isChordLine", () => {
  it("recognises lines made only of chords", () => {
    for (const line of ["G   C   D", "      Am7       F#m7b5", "C/E  G/B  Am", "Dsus4 D  Dsus2", "A7#9 Bb Cmaj7"]) {
      expect(isChordLine(tokenize(line))).toBe(true);
    }
  });

  it("allows bar lines, slashes and repeat marks between chords", () => {
    for (const line of ["C | F | G / / / |", "C F G x2", "Am - G - F", "G  C  D  (2x)", "|C   G|   Am   F|"]) {
      expect(isChordLine(tokenize(line))).toBe(true);
    }
    expect(chordsOf("|C   G|   Am   F|")).toEqual(["C", "G", "Am", "F"]);
  });

  it("reads a chord with a slash stuck to it as the chord plus a repeat mark", () => {
    const tokens = tokenize("G / F#/ | E");
    expect(tokens.map((t) => t.kind)).toEqual(["chord", "separator", "chord", "separator", "separator", "chord"]);
    expect(chordsOf("G / F#/ | E")).toEqual(["G", "F#", "E"]);
  });

  it("does not mistake lyrics for chords, even when a word is also a chord name", () => {
    for (const line of ["A king is born", "Am I here", "Be still and know", "Bad news", "Add to the sound", "And so we sing"]) {
      expect(isChordLine(tokenize(line))).toBe(false);
    }
  });

  it("does not treat blank or symbol-only lines as chords", () => {
    expect(isChordLine(tokenize(""))).toBe(false);
    expect(isChordLine(tokenize("| | |"))).toBe(false);
  });

  it("understands flat and sharp signs and brackets", () => {
    expect(chordsOf("B♭  E♭m  F♯")).toEqual(["Bb", "Ebm", "F#"]);
    expect(chordsOf("(G)  [C]  D")).toEqual(["G", "C", "D"]);
  });

  it("records where each token starts", () => {
    expect(tokenize("  G    Am").map((t) => t.index)).toEqual([2, 7]);
  });
});

describe("parseHeader", () => {
  it.each([
    ["VERSE 1:", "Verse 1"],
    ["Verse 2", "Verse 2"],
    ["verse", "Verse"],
    ["CHORUS:", "Chorus"],
    ["Chorus 2", "Chorus 2"],
    ["[Bridge]", "Bridge"],
    ["(Pre-Chorus)", "Pre-Chorus"],
    ["PRE CHORUS", "Pre-Chorus"],
    ["Prechorus 1", "Pre-Chorus 1"],
    ["Intro (2x)", "Intro (2x)"],
    ["Intro 2x", "Intro (2x)"],
    ["Chorus x2", "Chorus (2x)"],
    ["Outro", "Outro"],
    ["Tag:", "Tag"],
    ["Interlude", "Interlude"],
    ["Instrumental", "Instrumental"],
    ["V1", "Verse 1"],
    ["V2:", "Verse 2"],
    ["C:", "Chorus"],
    ["C1:", "Chorus 1"],
    ["Verse 1 (soft)", "Verse 1 (soft)"],
  ])("reads %s as %s", (line, label) => {
    expect(parseHeader(line)?.label).toBe(label);
  });

  it("does not treat lyrics that start with a section word as a header", () => {
    for (const line of ["Chorus of angels sing", "Verse and chorus alike", "Bridge over the water", "Tag along with me", "Intro to the day"]) {
      expect(parseHeader(line)).toBeNull();
    }
  });

  it("does not mistake the chords B7 or C2 for headers", () => {
    expect(parseHeader("B7")).toBeNull();
    expect(parseHeader("C2")).toBeNull();
    expect(parseHeader("B7  Em  G")).toBeNull();
  });

  it("reads chords written on the same line as a header", () => {
    const header = parseHeader("Intro: G  C  D");
    expect(header?.label).toBe("Intro");
    expect(header?.chordTokens.map((t) => t.chord)).toEqual(["G", "C", "D"]);
  });

  it("ignores blank text", () => {
    expect(parseHeader("")).toBeNull();
    expect(parseHeader("   ")).toBeNull();
  });
});

describe("isArrangementLine", () => {
  it("spots lines that give the order of the sections", () => {
    expect(isArrangementLine("Verse 1 > Chorus > Verse 2 > Chorus")).toBe(true);
    expect(isArrangementLine("Pre-Chorus 1 > Chorus > Intro (3x)")).toBe(true);
    expect(isArrangementLine("Intro, Verse, Chorus, Bridge, Chorus")).toBe(true);
  });
  it("leaves headers and lyrics alone", () => {
    expect(isArrangementLine("Verse 1")).toBe(false);
    expect(isArrangementLine("Sing a song, and a verse")).toBe(false);
    expect(isArrangementLine("The chorus rings out > loud")).toBe(false);
  });
});

describe("parseMeta", () => {
  it("reads key, capo, tempo and time signature", () => {
    expect(parseMeta("Key: G")).toEqual({ kind: "key", value: "G" });
    expect(parseMeta("Key of Bb")).toEqual({ kind: "key", value: "Bb" });
    expect(parseMeta("key - F#m")).toEqual({ kind: "key", value: "F#m" });
    expect(parseMeta("Key: E minor")).toEqual({ kind: "key", value: "Em" });
    expect(parseMeta("Capo 2")).toEqual({ kind: "capo", value: 2 });
    expect(parseMeta("Capo: 4")).toEqual({ kind: "capo", value: 4 });
    expect(parseMeta("BPM: 72")).toEqual({ kind: "tempo", value: 72 });
    expect(parseMeta("Tempo 120")).toEqual({ kind: "tempo", value: 120 });
    expect(parseMeta("68 BPM")).toEqual({ kind: "tempo", value: 68 });
    expect(parseMeta("Time: 6/8")).toEqual({ kind: "time", value: "6/8" });
  });
  it("recognises credit and copyright lines", () => {
    for (const line of ["CCLI Song # 1234567", "Words and Music by Someone", "(c) 2010 Some Publisher", "Copyright 2005", "Used by permission."]) {
      expect(parseMeta(line)?.kind).toBe("credit");
    }
  });
  it("ignores everything else", () => {
    expect(parseMeta("Keep me in your sight")).toBeNull();
    expect(parseMeta("I will sing")).toBeNull();
  });
});

describe("pairChordsWithLyric", () => {
  const pair = (chords: string, lyric: string) => {
    const e = pairChordsWithLyric(tokenize(chords), chords, lyric);
    return { text: e.text, chords: e.chords.map((c) => `${c.chord}@${c.pos}`) };
  };

  it("puts each chord over the character below it", () => {
    expect(pair("G        C", "la la la la la")).toEqual({ text: "la la la la la", chords: ["G@0", "C@9"] });
  });

  it("keeps a chord that sits in the middle of a word", () => {
    expect(pair("    G", "singing")).toEqual({ text: "singing", chords: ["G@4"] });
  });

  it("moves a chord that sits on the space before a word onto that word", () => {
    expect(pair("   G", "la la la")).toEqual({ text: "la la la", chords: ["G@3"] });
    expect(pair("  G", "la la la")).toEqual({ text: "la la la", chords: ["G@3"] });
  });

  it("keeps chords in order when they are close together", () => {
    const out = pair("G C D", "la");
    const positions = out.chords.map((c) => Number(c.split("@")[1]));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("pads the words so chords past the end of the line are kept", () => {
    const out = pair("G      C", "la");
    expect(out.chords).toEqual(["G@0", "C@7"]);
    expect(out.text.length).toBeGreaterThanOrEqual(7);
  });

  it("removes spaces that both lines start with", () => {
    expect(pair("    G        C", "    la la la la")).toEqual({ text: "la la la la", chords: ["G@0", "C@9"] });
    expect(pair("      G", "  la la la")).toEqual({ text: "la la la", chords: ["G@4"] });
  });

  it("ignores bar lines and repeat marks in the chord line", () => {
    expect(pair("G  |  C", "la la la")).toEqual({ text: "la la la", chords: ["G@0", "C@6"] });
  });

  it("copes with a chord line that starts further right than the words", () => {
    expect(pair("   G", "la")).toEqual({ text: "la ", chords: ["G@3"] });
  });
});

describe("chordsOnlyLine", () => {
  it("spaces chords out evenly and keeps bar lines and slashes as text", () => {
    const line = chordsOnlyLine(tokenize("C#m E/G# / A | / / / /"));
    expect(line.chords.map((c) => c.chord)).toEqual(["C#m", "E/G#", "A"]);
    const positions = line.chords.map((c) => c.pos);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(line.text).toContain("/");
    expect(line.text).toContain("|");
  });
  it("gives a plain row of chords", () => {
    const line = chordsOnlyLine(tokenize("G      C         D"));
    expect(line.chords.map((c) => c.chord)).toEqual(["G", "C", "D"]);
    expect(line.text.trim()).toBe("");
    expect(line.text.length).toBeGreaterThanOrEqual(line.chords[2].pos);
  });
});
