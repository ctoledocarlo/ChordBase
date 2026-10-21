import { describe, expect, it } from "vitest";
import { editDistance, findArtistVariants, findDuplicateGroups, normalizeArtist, normalizeTitle, type SongLite } from "./duplicates";

const song = (id: string, title: string, artist = "", key = "G"): SongLite => ({ id, title, artist, original_key: key });

describe("tidying titles", () => {
  it("ignores case, punctuation, accents, brackets and a leading the", () => {
    expect(normalizeTitle("Amazing Grace")).toBe("amazing grace");
    expect(normalizeTitle("  amazing   GRACE! ")).toBe("amazing grace");
    expect(normalizeTitle("Amazing Grace (Live)")).toBe("amazing grace");
    expect(normalizeTitle("Amazing Grace [My Chains Are Gone]")).toBe("amazing grace");
    expect(normalizeTitle("The Blessing")).toBe("blessing");
    expect(normalizeTitle("Café Sanctuary")).toBe("cafe sanctuary");
    expect(normalizeTitle("Praise & Worship")).toBe("praise and worship");
    expect(normalizeTitle("")).toBe("");
  });

  it("tidies artists the same way", () => {
    expect(normalizeArtist("The Hillsong  Band.")).toBe("hillsong band");
    expect(normalizeArtist("Hillsong Band")).toBe("hillsong band");
  });
});

describe("edit distance", () => {
  it("counts single-letter changes, and gives up early", () => {
    expect(editDistance("grace", "grace")).toBe(0);
    expect(editDistance("grace", "graces")).toBe(1);
    expect(editDistance("grace", "grase")).toBe(1);
    expect(editDistance("kitten", "sitting", 3)).toBe(3);
    expect(editDistance("grace", "mercy", 2)).toBe(3);
    expect(editDistance("a", "abcdef", 2)).toBe(3);
  });
});

describe("duplicate songs", () => {
  it("groups songs that share a title once tidied", () => {
    const groups = findDuplicateGroups([
      song("1", "Amazing Grace", "John Newton"),
      song("2", "amazing grace!", ""),
      song("3", "Amazing Grace (Live)", "Band"),
      song("4", "Great Is Thy Faithfulness"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].songs.map((s) => s.id).sort()).toEqual(["1", "2", "3"]);
    expect(groups[0].match).toBe("same");
    expect(groups[0].title).toBe("amazing grace");
  });

  it("also catches a typo, but only in titles long enough to be sure", () => {
    const groups = findDuplicateGroups([
      song("1", "Great Is Thy Faithfulness"),
      song("2", "Great Is Thy Faithfullness"),
      song("3", "Amen"),
      song("4", "Amend"),
      song("5", "Holy Spirit"),
      song("6", "Holy Spirits"),
    ]);
    const ids = groups.map((g) => g.songs.map((s) => s.id).sort().join(","));
    expect(ids).toContain("1,2");
    expect(ids).toContain("5,6");
    // Short titles must match exactly: "Amen" and "Amend" are different songs.
    expect(ids.some((g) => g.includes("3") && g.includes("4"))).toBe(false);
    expect(groups.find((g) => g.songs.some((s) => s.id === "1"))?.match).toBe("close");
  });

  it("leaves songs with no twin alone, and puts the biggest groups first", () => {
    const groups = findDuplicateGroups([
      song("1", "Alpha Song"),
      song("2", "Beta Song"),
      song("3", "Gamma Song"),
      song("4", "gamma song"),
      song("5", "Gamma Song"),
      song("6", "Beta song"),
    ]);
    expect(groups.map((g) => g.songs.length)).toEqual([3, 2]);
    expect(groups.some((g) => g.songs.some((s) => s.id === "1"))).toBe(false);
  });

  it("keeps songs apart that only differ by a number", () => {
    const groups = findDuplicateGroups([song("1", "Psalm 23 (Shepherd Song)"), song("2", "Psalm 24 (Shepherd Song)")]);
    expect(groups).toEqual([]);
  });

  it("copes with a big library quickly", () => {
    const many = Array.from({ length: 3000 }, (_, i) => song(String(i), `Song number ${i} about grace`));
    const started = Date.now();
    findDuplicateGroups(many);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("artist names", () => {
  it("finds spellings of one artist and suggests the commonest", () => {
    const out = findArtistVariants(["Hillsong", "hillsong", "Hillsong", "Hillsong.", "Elevation", "Bethel", "bethel "]);
    expect(out.map((o) => o.canonical)).toEqual(["Bethel", "Hillsong"]);
    const hillsong = out.find((o) => o.canonical === "Hillsong")!;
    expect(hillsong.variants).toEqual([
      { name: "Hillsong", count: 2 },
      { name: "Hillsong.", count: 1 },
      { name: "hillsong", count: 1 },
    ]);
  });

  it("ignores empty artists and names with a single spelling", () => {
    expect(findArtistVariants(["", "  ", "Same", "Same"])).toEqual([]);
  });
});
