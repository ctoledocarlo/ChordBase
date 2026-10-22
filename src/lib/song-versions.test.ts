import { describe, expect, it } from "vitest";
import { changedFields, restoreFields, type Snapshot } from "./song-versions";

const song: Snapshot = {
  title: "Made-up Song",
  artist: "Nobody",
  original_key: "G",
  default_capo: 0,
  tempo: 90,
  time_signature: "4/4",
  ccli_number: "",
  tags: ["fast", "opener"],
  melody_low: "",
  melody_high: "",
  links: [],
  body: "[G]la la\n[C]di da",
};

describe("what changed between two versions", () => {
  it("is nothing for identical songs, whatever order the tags are in", () => {
    expect(changedFields(song, { ...song, tags: ["opener", "fast"] })).toEqual([]);
    expect(changedFields(song, { ...song, body: song.body.replace("\n", "\r\n") })).toEqual([]);
  });

  it("names each part that differs", () => {
    expect(changedFields(song, { ...song, body: "[A]la" })).toEqual(["Chords and lyrics"]);
    expect(changedFields(song, { ...song, original_key: "A", default_capo: 2, tempo: null })).toEqual(["Key", "Capo", "Tempo"]);
    expect(changedFields(song, { ...song, title: "Other", artist: "Someone", time_signature: "3/4", ccli_number: "123" })).toEqual([
      "Title",
      "Artist",
      "Time signature",
      "CCLI number",
    ]);
    expect(changedFields(song, { ...song, tags: ["slow"], melody_low: "A3", links: [{ label: "Clip", url: "https://example.com/x", kind: "video" }] })).toEqual([
      "Tags",
      "Melody range",
      "Links",
    ]);
  });
});

describe("restoring", () => {
  it("writes back only the song's own fields", () => {
    const fields = restoreFields({ ...song, body: "old" });
    expect(Object.keys(fields).sort()).toEqual(
      ["artist", "body", "ccli_number", "default_capo", "links", "melody_high", "melody_low", "original_key", "tags", "tempo", "time_signature", "title"].sort(),
    );
    expect(fields.body).toBe("old");
  });
});
