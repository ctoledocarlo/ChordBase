import { describe, expect, it } from "vitest";
import { QUALITIES } from "@/lib/theory/chords";
import { parseNote } from "@/lib/theory/notes";
import { SCALES } from "@/lib/theory/scales";
import { COURSE, GROUPS, LESSONS, TOOLS, lessonBySlug, neighbour } from "./lessons";

describe("the Practice curriculum", () => {
  it("gives every lesson its own address and some content", () => {
    expect(new Set(LESSONS.map((l) => l.slug)).size).toBe(LESSONS.length);
    for (const lesson of LESSONS) {
      expect(lesson.blocks.length, lesson.slug).toBeGreaterThan(0);
      expect(lesson.title.length, lesson.slug).toBeGreaterThan(0);
      expect(lessonBySlug(lesson.slug)).toBe(lesson);
    }
  });

  it("keeps lessons in groups and tools apart", () => {
    expect(COURSE.every((l) => GROUPS.includes(l.group as (typeof GROUPS)[number]))).toBe(true);
    expect(TOOLS.every((t) => t.group === "Tools")).toBe(true);
    expect(COURSE.length + TOOLS.length).toBe(LESSONS.length);
    expect(COURSE.every((l) => l.minutes > 0)).toBe(true);
  });

  it("walks from one lesson to the next", () => {
    expect(neighbour(COURSE[0].slug, -1)).toBeNull();
    expect(neighbour(COURSE[0].slug, 1)).toBe(COURSE[1]);
    expect(neighbour(COURSE[COURSE.length - 1].slug, 1)).toBeNull();
    expect(neighbour("glossary", 1)).toBeNull();
  });

  it("only asks the interactive pieces for things that exist", () => {
    for (const lesson of LESSONS) {
      for (const block of lesson.blocks) {
        if (block.t !== "widget") continue;
        const w = block.widget;
        if (w.id === "scale-explorer") {
          for (const t of w.types ?? []) expect(SCALES[t], `${lesson.slug}: ${t}`).toBeDefined();
          if (w.type) expect(SCALES[w.type]).toBeDefined();
          if (w.root) expect(parseNote(w.root), `${lesson.slug}: ${w.root}`).not.toBeNull();
        }
        if (w.id === "chord-builder") {
          for (const q of w.kinds ?? []) expect(QUALITIES[q], `${lesson.slug}: ${q}`).toBeDefined();
          if (w.quality) expect(QUALITIES[w.quality]).toBeDefined();
          if (w.root) expect(parseNote(w.root)).not.toBeNull();
        }
        if (w.id === "key-chords" && w.root) expect(parseNote(w.root)).not.toBeNull();
        if (w.id === "inversions" && w.root) expect(parseNote(w.root)).not.toBeNull();
      }
    }
  });

  it("closes every bold marker it opens", () => {
    for (const lesson of LESSONS) {
      for (const block of lesson.blocks) {
        const text = block.t === "p" || block.t === "tip" || block.t === "try" ? block.text : block.t === "list" ? block.items.join(" ") : "";
        expect((text.match(/\*\*/g) ?? []).length % 2, `${lesson.slug}: ${text.slice(0, 40)}`).toBe(0);
      }
    }
  });
});
