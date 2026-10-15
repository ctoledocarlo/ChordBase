import { describe, expect, it } from "vitest";
import { defaultSettings } from "./setlist-settings";
import { mergeRemote } from "./setlist-sync";
import type { SetlistItem } from "./setlists";

const item = (id: string, over: Partial<SetlistItem> = {}): SetlistItem => ({
  id,
  song_id: `song-${id}`,
  settings: defaultSettings(0),
  body_override: null,
  song: { title: `Song ${id}`, artist: "", original_key: "G", default_capo: 0, tempo: null, body: "[G]hello" },
  ...over,
});

const none = { pendingIds: new Set<string>(), editingId: null };

describe("catching up with a setlist changed elsewhere", () => {
  it("changes nothing when nothing changed, keeping the same objects", () => {
    const local = [item("a"), item("b")];
    const r = mergeRemote(local, [item("a"), item("b")], none);
    expect(r.items).toEqual(local);
    expect(r.items[0]).toBe(local[0]);
    expect([r.added, r.removed, r.updated]).toEqual([[], [], []]);
  });

  it("follows the server's order and reports additions and removals", () => {
    const r = mergeRemote([item("a"), item("b")], [item("c"), item("b")], none);
    expect(r.items.map((i) => i.id)).toEqual(["c", "b"]);
    expect(r.added.map((i) => i.id)).toEqual(["c"]);
    expect(r.removed.map((i) => i.id)).toEqual(["a"]);
  });

  it("takes changed settings and chords", () => {
    const r = mergeRemote([item("a")], [item("a", { settings: { ...defaultSettings(0), semitones: 2 }, body_override: "[A]hi" })], none);
    expect(r.updated.map((i) => i.id)).toEqual(["a"]);
    expect(r.items[0].settings.semitones).toBe(2);
    expect(r.items[0].body_override).toBe("[A]hi");
  });

  it("keeps a song that has local changes waiting to be saved", () => {
    const mine = item("a", { settings: { ...defaultSettings(0), capo: 3 } });
    const r = mergeRemote([mine], [item("a")], { pendingIds: new Set(["a"]), editingId: null });
    expect(r.items[0]).toBe(mine);
    expect(r.updated).toEqual([]);
  });

  it("keeps the chords being edited here and reports a conflict", () => {
    const mine = item("a", { body_override: "[G]mine" });
    const theirs = item("a", { body_override: "[G]theirs" });
    const r = mergeRemote([mine], [theirs], { pendingIds: new Set(), editingId: "a" });
    expect(r.items[0]).toBe(mine);
    expect(r.conflict).toBe(theirs);
  });

  it("still takes other changes to the song being edited (like its key)", () => {
    const mine = item("a", { body_override: "[G]mine" });
    const theirs = item("a", { body_override: "[G]mine", settings: { ...defaultSettings(0), semitones: 5 } });
    const r = mergeRemote([mine], [theirs], { pendingIds: new Set(), editingId: "a" });
    expect(r.items[0].settings.semitones).toBe(5);
    expect(r.conflict).toBeNull();
  });
});
