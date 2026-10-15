import { describe, expect, it } from "vitest";
import { restyleChord, restyleSections } from "./styles";
import { parseSections } from "./sections";

describe("chord styles", () => {
  it("leaves the original alone", () => {
    expect(restyleChord("Gmaj7", "original", "G")).toBe("Gmaj7");
  });

  it("classic simplifies to triads and dominant sevenths", () => {
    for (const [from, to] of [["Gmaj7", "G"], ["Am7", "Am"], ["Cadd9", "C"], ["G6", "G"], ["D9", "D7"], ["Em9", "Em"], ["Bm7b5", "Bdim"], ["D7sus4", "Dsus4"], ["D7", "D7"], ["G", "G"], ["Em", "Em"], ["G/B", "G/B"], ["Gmaj7/B", "G/B"]]) {
      expect(restyleChord(from, "classic", "G"), from).toBe(to);
    }
  });

  it("jazzy adds sevenths and ninths by the chord's job in the key", () => {
    expect(restyleChord("G", "jazzy", "G")).toBe("Gmaj7"); // I
    expect(restyleChord("C", "jazzy", "G")).toBe("Cmaj7"); // IV
    expect(restyleChord("D", "jazzy", "G")).toBe("D7"); // V
    expect(restyleChord("Em", "jazzy", "G")).toBe("Em7");
    expect(restyleChord("D7", "jazzy", "G")).toBe("D9");
    expect(restyleChord("Dsus4", "jazzy", "G")).toBe("D7sus4");
    expect(restyleChord("F#dim", "jazzy", "G")).toBe("F#m7b5");
    expect(restyleChord("Cmaj7", "jazzy", "G")).toBe("Cmaj7"); // already dressed
    expect(restyleChord("G/B", "jazzy", "G")).toBe("Gmaj7/B"); // the bass note stays
  });

  it("gospel adds ninths and minor sevenths", () => {
    expect(restyleChord("G", "gospel", "G")).toBe("Gadd9");
    expect(restyleChord("C", "gospel", "G")).toBe("Cadd9");
    expect(restyleChord("D", "gospel", "G")).toBe("D9");
    expect(restyleChord("Am", "gospel", "G")).toBe("Am9"); // ii
    expect(restyleChord("Em", "gospel", "G")).toBe("Em7");
    expect(restyleChord("D7", "gospel", "G")).toBe("D9");
  });

  it("works in minor keys", () => {
    expect(restyleChord("C", "jazzy", "Am")).toBe("Cmaj7"); // III
    expect(restyleChord("F", "jazzy", "Am")).toBe("Fmaj7"); // VI
    expect(restyleChord("Am", "jazzy", "Am")).toBe("Am7");
  });

  it("handles two chords over one spot, and things that aren't chords", () => {
    expect(restyleChord("G D", "jazzy", "G")).toBe("Gmaj7 D7");
    expect(restyleChord("N.C.", "gospel", "G")).toBe("N.C.");
  });

  it("restyles whole sections", () => {
    const sections = parseSections("{start_of_verse: Verse 1}\nHello [G]there [Em]friend\n{end_of_verse}");
    const styled = restyleSections(sections, "jazzy", "G");
    expect(styled[0].lines[0].chords.map((c) => c.chord)).toEqual(["Gmaj7", "Em7"]);
    // the original sections are untouched
    expect(sections[0].lines[0].chords.map((c) => c.chord)).toEqual(["G", "Em"]);
    expect(restyleSections(sections, "original", "G")).toBe(sections);
  });
});
