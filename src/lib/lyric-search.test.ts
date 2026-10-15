import { describe, expect, it } from "vitest";
import { lyricLines, lyricSnippet, normalizeText, searchTokens } from "./lyric-search";

const body = [
  "{start_of_verse: Verse 1}",
  "[G]Hello there my [D/F#]good friend,",
  "[Em7]walking down the [C]road",
  "{end_of_verse}",
  "",
  "{start_of_chorus}",
  "Sing it [G]loud, sing it [D]proud",
  "{end_of_chorus}",
].join("\n");

describe("lyric search", () => {
  it("flattens text like the database does", () => {
    expect(normalizeText("  Hello,  World!  I'm here ")).toBe("hello world im here");
  });

  it("turns a search into words, dropping tiny ones and repeats", () => {
    expect(searchTokens("Sing it LOUD, sing a loud!")).toEqual(["sing", "it", "loud"]);
    expect(searchTokens("a I")).toEqual([]);
  });

  it("takes the chords and directives out of a song", () => {
    expect(lyricLines(body)).toEqual(["Hello there my good friend,", "walking down the road", "Sing it loud, sing it proud"]);
  });

  it("shows the line a search matched", () => {
    expect(lyricSnippet(body, ["good", "friend"])).toBe("Hello there my good friend,");
    expect(lyricSnippet(body, ["down", "road"])).toBe("walking down the road");
  });

  it("finds a phrase that runs over two lines, and falls back to any word", () => {
    expect(lyricSnippet(body, ["friend", "walking"])).toBe("Hello there my good friend,");
    expect(lyricSnippet(body, ["road", "nothing"])).toBe("walking down the road");
    expect(lyricSnippet(body, ["absent"])).toBeNull();
    expect(lyricSnippet(body, [])).toBeNull();
  });

  it("keeps long lines short", () => {
    const long = `${"word ".repeat(40)}end`;
    expect(lyricSnippet(long, ["end"])!.length).toBeLessThanOrEqual(90);
  });
});
