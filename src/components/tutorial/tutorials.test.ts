import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TUTORIALS, functionTutorialsFor, pageKeyFor, pageTutorialFor } from "./tutorials";

/** Every source file under src, as text. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) ? [readFileSync(path, "utf8")] : [];
  });
}

describe("tutorials", () => {
  it("each has its own id and at least one step, and steps in one tutorial have different titles", () => {
    expect(new Set(TUTORIALS.map((t) => t.id)).size).toBe(TUTORIALS.length);
    for (const t of TUTORIALS) {
      expect(t.steps.length, t.id).toBeGreaterThan(0);
      expect(new Set(t.steps.map((s) => s.title)).size, t.id).toBe(t.steps.length);
    }
  });

  it("point only at things that exist in the app", () => {
    // Each step names an element by data-tour="..." (or tourId="..." / tour="..." on a shared component).
    const code = sources(join(__dirname, "../..")).join("\n");
    for (const t of TUTORIALS) {
      for (const s of t.steps) {
        if (!s.target) continue;
        const found = [`data-tour="${s.target}"`, `tourId="${s.target}"`, `tour="${s.target}"`].some((marker) => code.includes(marker));
        expect(found, `${t.id}: nothing is marked "${s.target}"`).toBe(true);
      }
    }
  });

  it("covers the three kinds, with a tour, a page tutorial for every page, and guides", () => {
    expect(TUTORIALS.filter((t) => t.kind === "site")).toHaveLength(1);
    for (const page of ["songs", "song", "setlists", "setlist", "editor", "import", "practice"] as const) {
      expect(pageTutorialFor(page), page).toBeDefined();
    }
    expect(functionTutorialsFor("setlist").length).toBeGreaterThan(1);
  });

  it("knows which page an address is", () => {
    expect(pageKeyFor("/")).toBe("songs");
    expect(pageKeyFor("/songs/abc")).toBe("song");
    expect(pageKeyFor("/songs/abc/edit")).toBe("editor");
    expect(pageKeyFor("/songs/new")).toBe("editor");
    expect(pageKeyFor("/songs/import")).toBe("import");
    expect(pageKeyFor("/setlists")).toBe("setlists");
    expect(pageKeyFor("/setlists/abc")).toBe("setlist");
    expect(pageKeyFor("/practice")).toBe("practice");
    expect(pageKeyFor("/practice/triads")).toBe("practice");
    expect(pageKeyFor("/login")).toBeNull();
  });
});
