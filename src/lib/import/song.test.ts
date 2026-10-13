import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSections } from "@/lib/chords";
import { buildPpt, buildPptx, slideOf, type SlideSpec } from "./builders";
import { importDeck, stemOf } from "./song";

const chart = [
  "Test Song",
  "",
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

const labelsOf = (v: { sections: { label: string }[] }) => v.sections.map((s) => s.label);

describe("one chord chart on one slide", () => {
  const slides = [slideOf(...chart)];

  for (const [format, build] of [
    ["pptx", buildPptx],
    ["ppt", buildPpt],
  ] as const) {
    it(`gives one song with its sections (${format})`, () => {
      const songs = importDeck(`Test Song.${format}`, build(slides));
      expect(songs).toHaveLength(1);
      const song = songs[0];
      expect(song.title).toBe("Test Song");
      expect(song.versions).toHaveLength(1);
      expect(labelsOf(song.versions[0])).toEqual(["Verse 1", "Chorus"]);
      expect(song.timeSignature).toBe("4/4");
    });
  }

  it("makes song text that opens in the editor with the chords where they were", () => {
    const [song] = importDeck("Test Song.pptx", buildPptx(slides));
    const parsed = parseSections(song.versions[0].body);
    expect(parsed.map((s) => s.label)).toEqual(["Verse 1", "Chorus"]);
    expect(parsed[0].lines[0].text).toBe("la la la la la");
    expect(parsed[0].lines[0].chords).toEqual([
      { pos: 0, chord: "G" },
      { pos: 9, chord: "C" },
    ]);
  });

  it("works out the key from the chords", () => {
    const [song] = importDeck("Test Song.pptx", buildPptx(slides));
    expect(song.versions[0]).toMatchObject({ key: "G", keySource: "guessed" });
    expect(song.warnings.join(" ")).toMatch(/key/i);
  });

  it("uses a key written on the slide", () => {
    const [song] = importDeck("Test Song.pptx", buildPptx([slideOf("Test Song", "Key: A", "Capo 2", "", "G", "la la")]));
    expect(song.versions[0]).toMatchObject({ key: "A", keySource: "written", capo: 2 });
  });
});

describe("a chart split over two text boxes", () => {
  it("reads the left box and then the right box", () => {
    const slide: SlideSpec = {
      boxes: [
        { x: 5.4, y: 0.2, width: 5, height: 7, lines: ["CHORUS:", "C     G", "oh oh oh"] },
        { x: 0.3, y: 0.2, width: 5, height: 7, lines: ["Test Song", "", "VERSE 1:", "G        C", "la la la la la"] },
      ],
    };
    const [song] = importDeck("Test Song.pptx", buildPptx([slide]));
    expect(labelsOf(song.versions[0])).toEqual(["Verse 1", "Chorus"]);
  });
});

describe("several slides", () => {
  it("joins slides that carry different parts of the same song", () => {
    const [song] = importDeck(
      "Test Song.pptx",
      buildPptx([
        slideOf("Test Song", "", "VERSE 1:", "G", "la la la", "na na na"),
        slideOf("Test Song", "", "CHORUS:", "C", "oh oh oh", "ah ah ah"),
      ]),
    );
    expect(song.versions).toHaveLength(1);
    expect(labelsOf(song.versions[0])).toEqual(["Verse 1", "Chorus"]);
  });

  it("turns slides with the same words into versions of the song", () => {
    const words = ["la la la la", "na na na na", "oh oh oh oh", "ah ah ah ah", "ee ee ee ee", "oo oo oo oo"];
    const lines = (chord: string) => ["Test Song", "", "VERSE 1:", ...words.flatMap((w) => [chord, w])];
    const [song] = importDeck("Test Song.pptx", buildPptx([slideOf(...lines("G")), slideOf(...lines("A"))]));
    expect(song.versions).toHaveLength(2);
    expect(song.versions.map((v) => v.label)).toEqual(["Slide 1", "Slide 2"]);
    expect(song.versions.map((v) => v.key)).toEqual(["G", "A"]);
    expect(song.warnings.join(" ")).toMatch(/2 versions/);
  });

  it("makes a song from a title slide and lyric slides, one section for each slide", () => {
    const [song] = importDeck(
      "Test Song.pptx",
      buildPptx([
        slideOf("Test Song", "Some Band"),
        slideOf("la la la la", "na na na na"),
        slideOf("oh oh oh oh", "ah ah ah ah"),
      ]),
    );
    expect(song.title).toBe("Test Song");
    expect(song.versions).toHaveLength(1);
    expect(song.versions[0].sections.map((s) => s.lines.map((l) => l.text))).toEqual([
      ["la la la la", "na na na na"],
      ["oh oh oh oh", "ah ah ah ah"],
    ]);
    expect(song.warnings.join(" ")).toMatch(/no chords/i);
  });

  it("drops a slide that repeats a section already shown", () => {
    const [song] = importDeck(
      "Test Song.pptx",
      buildPptx([
        slideOf("Test Song", ""),
        slideOf("la la la la", "na na na na"),
        slideOf("oh oh oh oh", "ah ah ah ah"),
        slideOf("la la la la", "na na na na"),
      ]),
    );
    expect(song.versions[0].sections).toHaveLength(2);
  });

  it("makes several songs when the titles differ", () => {
    const songs = importDeck(
      "Songbook.pptx",
      buildPptx([
        slideOf("First Song", "", "G", "la la la"),
        slideOf("First Song", "", "C", "na na na"),
        slideOf("Second Song", "", "D", "oh oh oh"),
      ]),
    );
    expect(songs.map((s) => s.title)).toEqual(["First Song", "Second Song"]);
  });
});

describe("things to check", () => {
  it("falls back to the file name when there is no title, and says so", () => {
    const [song] = importDeck("My Great Song.pptx", buildPptx([slideOf("G   C", "la la la la", "D   G", "na na na")]));
    expect(song.title).toBe("My Great Song");
    expect(song.warnings.join(" ")).toMatch(/title/i);
  });

  it("reports notes it did not import, once", () => {
    const withNote = slideOf("Test Song", "(Slow and quiet)", "", "G", "la la");
    const [song] = importDeck("Test Song.pptx", buildPptx([withNote, withNote]));
    const notes = song.warnings.filter((w) => w.includes("Slow and quiet"));
    expect(notes).toHaveLength(1);
  });

  it("reports sections that have no name", () => {
    const [song] = importDeck("Test Song.pptx", buildPptx([slideOf("Test Song", "", "G", "la la", "", "C", "na na")]));
    expect(song.warnings.join(" ")).toMatch(/no name/);
  });

  it("gives nothing for a presentation with no text", () => {
    expect(importDeck("Empty.pptx", buildPptx([{ boxes: [] }]))).toEqual([]);
  });
});

describe("stemOf", () => {
  it("makes a readable name from a file name", () => {
    expect(stemOf("The Blood.ppt")).toBe("The Blood");
    expect(stemOf("C:\\songs\\Great_Song.pptx")).toBe("Great Song");
    expect(stemOf("Alive (1).pptx")).toBe("Alive");
    expect(stemOf("a.b.c.ppt")).toBe("a.b.c");
  });
});

// The church's own sample files, when they are present. Only the shape of the result is checked.
const samples = "SamplePPTs";
describe.skipIf(!existsSync(samples))("the sample files", () => {
  const load = (name: string) => importDeck(name, new Uint8Array(readFileSync(`${samples}/${name}`)));
  const files = existsSync(samples) ? readdirSync(samples) : [];

  it("every file gives at least one song with sections", () => {
    for (const name of files) {
      const songs = load(name);
      expect(songs.length, name).toBeGreaterThan(0);
      for (const song of songs) {
        expect(song.title, name).not.toBe("");
        expect(song.versions[0].sections.length, name).toBeGreaterThan(0);
      }
    }
  });

  it("every chord lands inside its line and no two chords share a spot", () => {
    for (const name of files) {
      for (const song of load(name)) {
        for (const version of song.versions) {
          for (const section of version.sections) {
            for (const line of section.lines) {
              const positions = line.chords.map((c) => c.pos);
              expect(new Set(positions).size, name).toBe(positions.length);
              for (const p of positions) expect(p, name).toBeLessThanOrEqual(line.text.length);
            }
          }
        }
      }
    }
  });

  it("every song's text opens in the editor with the same sections", () => {
    for (const name of files) {
      for (const song of load(name)) {
        for (const version of song.versions) {
          expect(parseSections(version.body).map((s) => s.label), name).toEqual(version.sections.map((s) => s.label));
        }
      }
    }
  });
});
