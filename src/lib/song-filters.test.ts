import { describe, expect, it } from "vitest";
import { activeFilterCount, filtersToParams, pageList, parseSongFilters } from "./song-filters";

describe("song filters in the URL", () => {
  it("starts with no filters", () => {
    const f = parseSongFilters({});
    expect(f).toMatchObject({ q: "", keys: [], artist: "", mode: "", tempoMin: null, tempoMax: null, timeSig: "", capo: null, sort: "title", page: 1 });
    expect(activeFilterCount(f)).toBe(0);
    expect(filtersToParams(f).toString()).toBe("");
  });

  it("reads and writes every filter", () => {
    const f = parseSongFilters({ q: "grace", key: ["G", "Em"], artist: "Hillsong", mode: "minor", tempo_min: "60", tempo_max: "90", ts: "6/8", capo: "2", sort: "tempo", page: "3" });
    expect(f.keys).toEqual(["G", "Em"]);
    expect(activeFilterCount(f)).toBe(6);
    const again = parseSongFilters(Object.fromEntries([...filtersToParams(f)].map(([k, v]) => [k, v])));
    expect(again.page).toBe(3);
    expect(filtersToParams(f, 1).has("page")).toBe(false);
  });

  it("ignores nonsense and puts a swapped tempo range right", () => {
    const f = parseSongFilters({ tempo_min: "200", tempo_max: "80", capo: "99", sort: "bogus", mode: "x", page: "-4", ts: "abc" });
    expect([f.tempoMin, f.tempoMax]).toEqual([80, 200]);
    expect([f.capo, f.sort, f.mode, f.page, f.timeSig]).toEqual([null, "title", "", 1, ""]);
  });

  it("lists page numbers with gaps", () => {
    expect(pageList(1, 3)).toEqual([1, 2, 3]);
    expect(pageList(8, 20)).toEqual([1, "gap", 7, 8, 9, "gap", 20]);
    expect(pageList(2, 20)).toEqual([1, 2, 3, "gap", 20]);
  });

  it("orders a search by best match unless another order was chosen", () => {
    expect(parseSongFilters({ q: "grace" }).sort).toBe("relevance");
    expect(parseSongFilters({}).sort).toBe("title");
    expect(parseSongFilters({ q: "grace", sort: "title" }).sort).toBe("title");
    expect(parseSongFilters({ q: "grace", sort: "tempo" }).sort).toBe("tempo");
    // Best match means nothing without a search.
    expect(parseSongFilters({ sort: "relevance" }).sort).toBe("title");
  });

  it("only writes the order into the address when it isn't the usual one", () => {
    expect(filtersToParams(parseSongFilters({ q: "grace" })).toString()).toBe("q=grace");
    expect(filtersToParams(parseSongFilters({ q: "grace", sort: "title" })).toString()).toBe("q=grace&sort=title");
    expect(filtersToParams(parseSongFilters({ sort: "tempo" })).toString()).toBe("sort=tempo");
  });
});
