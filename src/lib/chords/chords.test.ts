import { describe, expect, it } from "vitest";
import {
  bassNote,
  chordsInSong,
  formatChord,
  isValidChord,
  parseChord,
  parseChordPro,
  parseLyricLine,
  semitonesBetween,
  spellingForKey,
  transposeChordPro,
  transposeChordText,
} from "./index";

describe("parseChord", () => {
  it.each(["G", "F#m7", "Bbmaj7", "Csus4", "Dadd9", "Em7b5", "A7#9", "G/B", "C6/9", "Ebm/Gb"])(
    "round-trips %s",
    (c) => expect(formatChord(parseChord(c)!)).toBe(c),
  );

  it("rejects non-chords", () => {
    expect(parseChord("N.C.")).toBeNull();
    expect(parseChord("Intro")).toBeNull();
    expect(parseChord("")).toBeNull();
  });

  it("treats a numeric slash as part of the quality, not a bass", () => {
    const c = parseChord("C6/9")!;
    expect(c.quality).toBe("6/9");
    expect(c.bass).toBeUndefined();
  });
});

describe("transposeChordText", () => {
  it("transposes with sharps and flats", () => {
    expect(transposeChordText("G", 2, "sharp")).toBe("A");
    expect(transposeChordText("G", 3, "sharp")).toBe("A#");
    expect(transposeChordText("G", 3, "flat")).toBe("Bb");
  });
  it("keeps extensions and moves slash basses", () => {
    expect(transposeChordText("Dm7/C", 2, "sharp")).toBe("Em7/D");
    expect(transposeChordText("Csus4", 5, "sharp")).toBe("Fsus4");
    expect(transposeChordText("Gadd9", -2, "flat")).toBe("Fadd9");
  });
  it("wraps around and respects negatives", () => {
    expect(transposeChordText("B", 1, "sharp")).toBe("C");
    expect(transposeChordText("C", -1, "sharp")).toBe("B");
    expect(transposeChordText("C", 24, "sharp")).toBe("C");
  });
  it("passes non-chords through", () => {
    expect(transposeChordText("N.C.", 3, "sharp")).toBe("N.C.");
  });
});

describe("keys", () => {
  it("computes the interval between keys", () => {
    expect(semitonesBetween("G", "A")).toBe(2);
    expect(semitonesBetween("A", "G")).toBe(10);
    expect(semitonesBetween("Am", "Cm")).toBe(3);
    expect(semitonesBetween("G", "nope")).toBeNull();
  });
  it("picks spelling from the key", () => {
    expect(spellingForKey("F")).toBe("flat");
    expect(spellingForKey("Bb")).toBe("flat");
    expect(spellingForKey("Gm")).toBe("flat"); // relative major Bb
    expect(spellingForKey("G")).toBe("sharp");
    expect(spellingForKey("D")).toBe("sharp");
    expect(spellingForKey("F#m")).toBe("sharp");
    expect(spellingForKey("Am")).toBe("sharp");
  });
});

describe("bassNote", () => {
  it("uses the root when there is no slash", () => {
    expect(bassNote(parseChord("Am7")!)).toBe("A");
  });
  it("uses the slash bass", () => {
    expect(bassNote(parseChord("C/E")!)).toBe("E");
    expect(bassNote(parseChord("D/F#")!)).toBe("F#");
    expect(bassNote(parseChord("Eb/Bb")!, "flat")).toBe("Bb");
  });
});

describe("parseLyricLine", () => {
  it("pairs chords with the lyric that follows", () => {
    expect(parseLyricLine("[G]Amazing [C]grace")).toEqual([
      { chord: "G", lyric: "Amazing " },
      { chord: "C", lyric: "grace" },
    ]);
  });
  it("keeps leading lyrics before the first chord", () => {
    expect(parseLyricLine("Oh [G]how")).toEqual([
      { chord: undefined, lyric: "Oh " },
      { chord: "G", lyric: "how" },
    ]);
  });
  it("handles consecutive chords and a trailing chord", () => {
    expect(parseLyricLine("[G][C]hi [D]")).toEqual([
      { chord: "G", lyric: "" },
      { chord: "C", lyric: "hi " },
      { chord: "D", lyric: "" },
    ]);
  });
  it("handles plain lyrics", () => {
    expect(parseLyricLine("no chords")).toEqual([{ chord: undefined, lyric: "no chords" }]);
  });
});

const SONG = `{title: Amazing Grace}
{artist: John Newton}
{key: G}
{capo: 2}
{tempo: 72}
# a comment
{start_of_verse}
[G]Amazing [C]grace how [G]sweet the [D]sound
{end_of_verse}

{c: Slowly}
[N.C.]That saved a [Em]wretch like [D/F#]me
`;

describe("parseChordPro", () => {
  const song = parseChordPro(SONG);
  it("reads metadata", () => {
    expect(song.meta).toMatchObject({
      title: "Amazing Grace",
      artist: "John Newton",
      key: "G",
      capo: 2,
      tempo: 72,
    });
  });
  it("builds lines", () => {
    expect(song.lines.map((l) => l.type)).toEqual([
      "section",
      "lyrics",
      "blank",
      "comment",
      "lyrics",
      "blank",
    ]);
  });
  it("lists unique chords, skipping non-chords", () => {
    expect(chordsInSong(song)).toEqual(["G", "C", "D", "Em", "D/F#"]);
  });
});

describe("transposeChordPro", () => {
  it("transposes chords and the key directive, not lyrics", () => {
    const out = transposeChordPro(SONG, 2, "sharp");
    expect(out).toContain("{key: A}");
    expect(out).toContain("[A]Amazing [D]grace how [A]sweet the [E]sound");
    expect(out).toContain("[N.C.]That saved a [F#m]wretch like [E/G#]me");
  });
  it("round-trips through a full octave", () => {
    expect(transposeChordPro(SONG, 12, "sharp")).toBe(SONG);
  });
});

describe("several chords over one spot", () => {
  it("counts them as valid when each one is", () => {
    expect(isValidChord("G D")).toBe(true);
    expect(isValidChord("A7 D")).toBe(true);
    expect(isValidChord("Em A7 D")).toBe(true);
    expect(isValidChord("G Xyz")).toBe(false);
  });

  it("transposes each of them", () => {
    expect(transposeChordText("G D", 2, "sharp")).toBe("A E");
    expect(transposeChordText("Em A7 D", 2, "sharp")).toBe("F#m B7 E");
    expect(transposeChordPro("[G D]hello", 2, "sharp")).toBe("[A E]hello");
  });
});
