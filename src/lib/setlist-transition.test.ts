import { describe, expect, it } from "vitest";
import { suggestTransition } from "./chords";
import { defaultSettings } from "./setlist-settings";
import { autoTransition, transitionDisplay } from "./setlist-transition";
import type { SetlistItem } from "./setlists";

const song = (key: string, body: string, over: Partial<SetlistItem> = {}): SetlistItem => ({
  id: key,
  song_id: key,
  settings: defaultSettings(0),
  body_override: null,
  transition: { mode: "auto", chords: "" },
  song: { title: key, artist: "", original_key: key, default_capo: 0, tempo: null, body },
  ...over,
});

describe("suggesting a bridge between songs", () => {
  it("needs nothing between the same key and chord", () => {
    expect(suggestTransition("G", "G", "G", "G")).toEqual([]);
    expect(suggestTransition("G", "G", "Em", "G")).toEqual(["Em", "G"]);
  });

  it("moves straight on when the next key is a fifth up", () => {
    expect(suggestTransition("G", "D", "G", "D")).toEqual(["G", "D"]);
  });

  it("makes the old home chord a dominant seventh when the next key is a fourth up", () => {
    expect(suggestTransition("G", "C", "G", "C")).toEqual(["G7", "C"]);
  });

  it("goes through the new key's dominant seventh otherwise", () => {
    expect(suggestTransition("G", "A", "G", "A")).toEqual(["G", "E7", "A"]);
    expect(suggestTransition("E", "Eb", "E", "Eb")).toEqual(["E", "Bb7", "Eb"]);
    expect(suggestTransition("G", "Am", "G", "Am")).toEqual(["G", "E7", "Am"]);
  });

  it("uses the keys when a song has no chords, and gives nothing for a non-key", () => {
    expect(suggestTransition("G", "A", null, null)).toEqual(["G", "E7", "A"]);
    expect(suggestTransition("", "A")).toEqual([]);
  });
});

describe("the bridge between two setlist songs", () => {
  const a = song("G", "Hello [G]there my [D]friend [G]end");
  const b = song("A", "[A]Start here [E]now");

  it("suggests the chords, from where the first song ends to where the next begins", () => {
    expect(autoTransition(a, b)).toEqual(["G", "E7", "A"]);
    expect(transitionDisplay(a, b)).toBe("G → E7 → A");
  });

  it("follows the key chosen for each song in the setlist", () => {
    const higher = song("G", a.song.body, { settings: { ...defaultSettings(0), semitones: 2 } }); // sounds in A
    expect(autoTransition(higher, b)).toEqual([]); // A into A: nothing to bridge
  });

  it("writes the bridge as the first song is played, with its capo", () => {
    const capo = song("G", a.song.body, { settings: { ...defaultSettings(2), semitones: 0 } }); // G with capo 2: shapes in F
    expect(autoTransition(capo, b)).toEqual(["F", "D7", "G"]); // sounding G, E7, A, shown two steps lower
  });

  it("uses typed chords in manual mode, and nothing when off", () => {
    expect(transitionDisplay(song("G", a.song.body, { transition: { mode: "manual", chords: "G – C/G – D" } }), b)).toBe("G – C/G – D");
    expect(transitionDisplay(song("G", a.song.body, { transition: { mode: "manual", chords: "  " } }), b)).toBeNull();
    expect(transitionDisplay(song("G", a.song.body, { transition: { mode: "none", chords: "x" } }), b)).toBeNull();
  });
});
