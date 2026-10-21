import { describe, expect, it } from "vitest";
import { addDays, ago, daysBetween, summarize, type Play, type SongRef } from "./history";

const songs: SongRef[] = [
  { id: "a", title: "Alpha", artist: "" },
  { id: "b", title: "Beta", artist: "" },
  { id: "c", title: "Gamma", artist: "" },
  { id: "d", title: "Delta", artist: "" },
];
const play = (song_id: string, played_on: string, setlist_name = "Sunday"): Play => ({ song_id, played_on, setlist_name });

describe("dates", () => {
  it("counts days between dates and moves them", () => {
    expect(daysBetween("2026-10-01", "2026-10-18")).toBe(17);
    expect(daysBetween("2026-10-18", "2026-10-01")).toBe(-17);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(addDays("2026-10-18", -7)).toBe("2026-10-11");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("says how long ago", () => {
    expect(ago("2026-10-18", "2026-10-18")).toBe("today");
    expect(ago("2026-10-17", "2026-10-18")).toBe("yesterday");
    expect(ago("2026-10-10", "2026-10-18")).toBe("8 days ago");
    expect(ago("2026-09-20", "2026-10-18")).toBe("4 weeks ago");
    expect(ago("2026-04-18", "2026-10-18")).toBe("6 months ago");
    expect(ago("2023-10-18", "2026-10-18")).toBe("3 years ago");
  });
});

describe("summarising what was played", () => {
  const today = "2026-10-18";

  it("lists services newest first, with their songs", () => {
    const s = summarize([play("a", "2026-10-04", "Sunday"), play("b", "2026-10-04"), play("c", "2026-10-11", "Easter")], songs, today);
    expect(s.services.map((x) => x.date)).toEqual(["2026-10-11", "2026-10-04"]);
    expect(s.services[1].songs.map((x) => x.title)).toEqual(["Alpha", "Beta"]);
    expect(s.services[0].setlist_name).toBe("Easter");
  });

  it("counts each song once per day, with its latest date", () => {
    const s = summarize([play("a", "2026-10-04"), play("a", "2026-10-04"), play("a", "2026-09-27")], songs, today);
    const a = s.stats.find((x) => x.id === "a")!;
    expect(a.count).toBe(2);
    expect(a.last).toBe("2026-10-04");
    expect(a.dates).toEqual(["2026-10-04", "2026-09-27"]);
    expect(s.stats.find((x) => x.id === "d")).toMatchObject({ count: 0, last: null });
  });

  it("flags songs used a lot lately", () => {
    const weekly = ["2026-10-11", "2026-10-04", "2026-09-27", "2026-09-20"].map((d) => play("a", d));
    const s = summarize([...weekly, play("b", "2026-10-11"), play("b", "2026-06-01")], songs, today);
    expect(s.overused.map((x) => x.id)).toEqual(["a"]);
    expect(s.overused[0].recent).toBe(4);
    // Plays older than the recent stretch don't count toward "lately".
    expect(s.stats.find((x) => x.id === "b")!.recent).toBe(1);
  });

  it("flags songs that have gone quiet, the longest quiet first, never-played last", () => {
    const s = summarize([play("a", "2026-10-11"), play("b", "2026-03-01"), play("c", "2026-06-01")], songs, today);
    expect(s.neglected.map((x) => x.id)).toEqual(["b", "c", "d"]);
  });

  it("ignores plays of songs no longer in the library", () => {
    const s = summarize([play("zzz", "2026-10-11")], songs, today);
    expect(s.services).toEqual([]);
    expect(s.stats).toHaveLength(4);
  });

  it("lets the thresholds be changed", () => {
    const s = summarize([play("a", "2026-10-11"), play("a", "2026-10-04")], songs, today, { overusedAt: 2, recentWeeks: 4 });
    expect(s.overused.map((x) => x.id)).toEqual(["a"]);
  });
});
