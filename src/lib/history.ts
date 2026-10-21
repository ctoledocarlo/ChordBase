/**
 * What the library has been used for. Each time a song goes on stage it is written to a permanent history
 * (setlists themselves are deleted when they expire). This turns that history into a list of services, and
 * says which songs are being used a lot and which haven't been used lately. Dates are plain "2026-10-18" text.
 */

export type SongRef = { id: string; title: string; artist: string };
export type Play = { song_id: string; played_on: string; setlist_name: string };

const DAY_MS = 86_400_000;
const utc = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS);

/** A date some days later (or earlier). */
export const addDays = (date: string, days: number) => new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);

export type SongStat = SongRef & {
  /** How many separate days it was played, ever. */
  count: number;
  /** The latest day it was played, or null if it never was. */
  last: string | null;
  /** How many of those days fall in the recent stretch. */
  recent: number;
  /** All the days, newest first. */
  dates: string[];
};

export type Service = { date: string; setlist_name: string; songs: SongRef[] };

export type HistorySummary = {
  /** One entry per day with plays, newest first. */
  services: Service[];
  /** Every song in the library, played or not. */
  stats: SongStat[];
  /** Songs used a lot lately. */
  overused: SongStat[];
  /** Songs not used for a while, longest quiet first, then the ones never used. */
  neglected: SongStat[];
};

export type SummaryOptions = {
  /** How far back "lately" reaches, in weeks. */
  recentWeeks?: number;
  /** Played on at least this many separate days lately counts as used a lot. */
  overusedAt?: number;
  /** Not played for this many weeks counts as neglected. */
  quietWeeks?: number;
};

export function summarize(plays: Play[], songs: SongRef[], today: string, options: SummaryOptions = {}): HistorySummary {
  const recentWeeks = options.recentWeeks ?? 8;
  const overusedAt = options.overusedAt ?? 4;
  const quietWeeks = options.quietWeeks ?? 12;
  const recentFrom = addDays(today, -recentWeeks * 7);

  const known = new Map(songs.map((s) => [s.id, s]));
  const datesBySong = new Map<string, string[]>();
  const byDay = new Map<string, { setlist_name: string; songs: SongRef[] }>();

  for (const play of plays) {
    const song = known.get(play.song_id);
    if (!song) continue;
    const dates = datesBySong.get(song.id) ?? [];
    if (!dates.includes(play.played_on)) dates.push(play.played_on);
    datesBySong.set(song.id, dates);

    const day = byDay.get(play.played_on) ?? { setlist_name: play.setlist_name, songs: [] };
    if (!day.setlist_name && play.setlist_name) day.setlist_name = play.setlist_name;
    if (!day.songs.some((s) => s.id === song.id)) day.songs.push(song);
    byDay.set(play.played_on, day);
  }

  const stats: SongStat[] = songs.map((song) => {
    const dates = (datesBySong.get(song.id) ?? []).sort().reverse();
    return {
      ...song,
      count: dates.length,
      last: dates[0] ?? null,
      recent: dates.filter((d) => d >= recentFrom && d <= today).length,
      dates,
    };
  });

  const byTitle = (a: SongStat, b: SongStat) => a.title.localeCompare(b.title);
  const overused = stats.filter((s) => s.recent >= overusedAt).sort((a, b) => b.recent - a.recent || byTitle(a, b));
  const quietFrom = addDays(today, -quietWeeks * 7);
  const neglected = stats
    .filter((s) => s.last === null || s.last < quietFrom)
    .sort((a, b) => {
      // Played long ago first (the longest quiet at the top), never played last.
      if (a.last === null && b.last === null) return byTitle(a, b);
      if (a.last === null) return 1;
      if (b.last === null) return -1;
      return a.last.localeCompare(b.last) || byTitle(a, b);
    });

  const services = [...byDay]
    .map(([date, day]) => ({ date, setlist_name: day.setlist_name, songs: day.songs }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return { services, stats, overused, neglected };
}

/** "3 weeks ago", "yesterday", "today": how long since a date. */
export function ago(date: string, today: string): string {
  const days = daysBetween(date, today);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 700) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
