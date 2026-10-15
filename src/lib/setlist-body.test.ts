import { describe, expect, it } from "vitest";
import { transposeChordPro } from "./chords";
import { toStoredBody } from "./setlist-body";

const song = "{start_of_verse: Verse 1}\nHello [G]there [D/F#]friend [Em7]today\n{end_of_verse}";

describe("keeping chords typed in a transposed setlist", () => {
  it("leaves the song alone when the setlist isn't transposed", () => {
    expect(toStoredBody(song, 0, "G")).toBe(song);
  });

  it("returns to the song's own key", () => {
    const shown = transposeChordPro(song, 2, "sharp");
    expect(toStoredBody(shown, 2, "G")).toBe(song);
  });

  it("keeps an edit made in the shown key", () => {
    const shown = transposeChordPro(song, 2, "sharp").replace("[A]", "[Asus4]");
    expect(shown).toContain("[Asus4]");
    expect(toStoredBody(shown, 2, "G")).toBe(song.replace("[G]", "[Gsus4]"));
  });
});
