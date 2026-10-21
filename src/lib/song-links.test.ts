import { describe, expect, it } from "vitest";
import { MAX_LINKS, cleanUrl, guessKind, normalizeLinks, readLinks } from "./song-links";

describe("web addresses", () => {
  it("adds https when it is missing, and refuses anything that isn't the web", () => {
    expect(cleanUrl("example.com/song")).toBe("https://example.com/song");
    expect(cleanUrl("  https://example.com/a b ")).toBe("https://example.com/a%20b");
    expect(cleanUrl("http://example.com")).toBe("http://example.com/");
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("data:text/html,hi")).toBeNull();
    expect(cleanUrl("ftp://example.com/file")).toBeNull();
    expect(cleanUrl("not a link")).toBeNull();
    expect(cleanUrl("")).toBeNull();
    expect(cleanUrl(`https://example.com/${"a".repeat(600)}`)).toBeNull();
  });

  it("guesses what a link is from where it points", () => {
    expect(guessKind("https://www.youtube.com/watch?v=abc")).toBe("video");
    expect(guessKind("https://youtu.be/abc")).toBe("video");
    expect(guessKind("https://open.spotify.com/track/1")).toBe("recording");
    expect(guessKind("https://example.com/chart.pdf")).toBe("sheet");
    expect(guessKind("https://example.com/chart.pdf?dl=1")).toBe("sheet");
    expect(guessKind("https://example.com/page")).toBe("other");
  });
});

describe("saving links", () => {
  it("tidies them up, dropping blank rows and filling in labels", () => {
    const { links, error } = normalizeLinks([
      { label: "", url: "youtube.com/watch?v=1", kind: "video" },
      { label: "  ", url: "" },
      { label: "Chart", url: "https://example.com/chart.pdf" },
    ]);
    expect(error).toBeUndefined();
    expect(links).toEqual([
      { label: "Video", url: "https://youtube.com/watch?v=1", kind: "video" },
      { label: "Chart", url: "https://example.com/chart.pdf", kind: "sheet" },
    ]);
  });

  it("stops at an address that isn't one, naming it", () => {
    const { error } = normalizeLinks([{ label: "x", url: "javascript:alert(1)" }]);
    expect(error).toContain("javascript:alert(1)");
  });

  it("limits how many a song can have", () => {
    const many = Array.from({ length: MAX_LINKS + 3 }, (_, i) => ({ label: `L${i}`, url: `https://example.com/${i}` }));
    const { links, error } = normalizeLinks(many);
    expect(links).toHaveLength(MAX_LINKS);
    expect(error).toBeTruthy();
  });

  it("accepts nothing, and refuses the wrong shape", () => {
    expect(normalizeLinks(undefined)).toEqual({ links: [] });
    expect(normalizeLinks("")).toEqual({ links: [] });
    expect(normalizeLinks({}).error).toBeTruthy();
  });

  it("reads what the database holds, skipping anything odd", () => {
    expect(readLinks(null)).toEqual([]);
    expect(readLinks([{ url: "https://example.com", label: "A", kind: "other" }, { url: "javascript:1" }, 5])).toEqual([
      { url: "https://example.com", label: "A", kind: "other" },
    ]);
  });
});
