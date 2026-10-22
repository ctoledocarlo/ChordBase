import { describe, expect, it } from "vitest";
import { diffCounts, diffLines, withContext } from "./line-diff";

const text = (diff: ReturnType<typeof diffLines>) => (diff ?? []).map((l) => `${l.kind === "added" ? "+" : l.kind === "removed" ? "-" : " "}${l.text}`);

describe("comparing two texts line by line", () => {
  it("shows nothing changed for the same text", () => {
    const d = diffLines("a\nb\nc", "a\nb\nc")!;
    expect(d.every((l) => l.kind === "same")).toBe(true);
    expect(diffCounts(d)).toEqual({ added: 0, removed: 0 });
  });

  it("shows one changed line as one removed and one added", () => {
    expect(text(diffLines("[G]one\n[C]two\n[D]three", "[G]one\n[C]TWO\n[D]three"))).toEqual([" [G]one", "-[C]two", "+[C]TWO", " [D]three"]);
  });

  it("shows added and removed lines in place", () => {
    expect(text(diffLines("a\nb\nc", "a\nc\nd"))).toEqual([" a", "-b", " c", "+d"]);
    expect(text(diffLines("", "x\ny"))).toEqual(["+x", "+y"]);
    expect(text(diffLines("x\ny", ""))).toEqual(["-x", "-y"]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("keeps a moved block from looking like a rewrite of everything", () => {
    const before = ["v1", "v2", "chorus1", "chorus2", "bridge"].join("\n");
    const after = ["v1", "v2", "bridge", "chorus1", "chorus2"].join("\n");
    const counts = diffCounts(diffLines(before, after)!);
    expect(counts.added).toBeLessThanOrEqual(2);
    expect(counts.removed).toBeLessThanOrEqual(2);
  });

  it("treats Windows line endings like any other", () => {
    expect(diffCounts(diffLines("a\r\nb", "a\nb")!)).toEqual({ added: 0, removed: 0 });
  });

  it("rebuilds both texts from its answer", () => {
    const before = "a\nb\nc\nd\ne\nf";
    const after = "a\nx\nc\ne\nf\ng";
    const d = diffLines(before, after)!;
    expect(d.filter((l) => l.kind !== "added").map((l) => l.text).join("\n")).toBe(before);
    expect(d.filter((l) => l.kind !== "removed").map((l) => l.text).join("\n")).toBe(after);
  });

  it("handles a long song quickly, and gives up on an absurd one", () => {
    const song = Array.from({ length: 600 }, (_, i) => `line ${i}`);
    const edited = song.map((l, i) => (i % 50 === 0 ? `${l} edited` : l));
    const started = Date.now();
    const d = diffLines(song.join("\n"), edited.join("\n"))!;
    expect(Date.now() - started).toBeLessThan(1000);
    expect(diffCounts(d)).toEqual({ added: 12, removed: 12 });
    expect(diffLines("x\n".repeat(4000), "y")).toBeNull();
  });
});

describe("showing only what changed", () => {
  it("keeps a little around each change and folds the rest", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`);
    const after = before.map((l, i) => (i === 10 ? "changed" : l));
    const rows = withContext(diffLines(before.join("\n"), after.join("\n"))!, 2);
    expect(rows[0]).toEqual({ kind: "gap", hidden: 8 });
    expect(rows.map((r) => (r.kind === "gap" ? `…${r.hidden}` : `${r.kind}:${r.text}`))).toEqual([
      "…8",
      "same:l8",
      "same:l9",
      "removed:l10",
      "added:changed",
      "same:l11",
      "same:l12",
      "…7",
    ]);
  });

  it("shows everything when everything is near a change, and folds all of an unchanged text", () => {
    expect(withContext(diffLines("a\nb", "a\nc")!).some((r) => r.kind === "gap")).toBe(false);
    expect(withContext(diffLines("a\nb\nc", "a\nb\nc")!)).toEqual([{ kind: "gap", hidden: 3 }]);
    expect(withContext([])).toEqual([]);
  });
});
