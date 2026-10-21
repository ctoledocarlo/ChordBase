/**
 * Spotting songs that are in the library twice. A big import will bring in "Amazing Grace", "Amazing Grace (Live)"
 * and "amazing  grace!" as three songs; this groups them so they can be merged. Titles are compared after
 * stripping case, punctuation, accents, "the", and anything in brackets; titles a letter or two apart count as the same.
 */

export type SongLite = { id: string; title: string; artist: string; original_key: string };

/** A title with everything that doesn't change what song it is taken out. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/^(the|a|an)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The same, for artist names ("Hillsong United" and "hillsong  united." match). */
export function normalizeArtist(artist: string): string {
  return artist
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many single-letter changes turn one text into the other, giving up (and returning max + 1) once it is more than `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let smallest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      smallest = Math.min(smallest, row[j]);
    }
    if (smallest > max) return max + 1;
    previous = row;
  }
  return previous[b.length];
}

export type DuplicateGroup = {
  /** The title the songs share once tidied up. */
  title: string;
  songs: SongLite[];
  /** "same" when the tidied titles are identical, "close" when some are a letter or two apart. */
  match: "same" | "close";
};

/** Groups of songs that look like the same song, biggest groups first. Songs with no duplicate are left out. */
export function findDuplicateGroups(songs: SongLite[]): DuplicateGroup[] {
  const byTitle = new Map<string, SongLite[]>();
  for (const song of songs) {
    const key = normalizeTitle(song.title);
    if (!key) continue;
    const list = byTitle.get(key);
    if (list) list.push(song);
    else byTitle.set(key, [song]);
  }

  // Join titles that are only a letter or two apart. Only titles starting alike are compared, which keeps it quick.
  const titles = [...byTitle.keys()];
  const parent = new Map(titles.map((t) => [t, t]));
  const find = (t: string): string => {
    let root = t;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(t, root);
    return root;
  };
  // What each title is made of, worked out once: its digits (so "Psalm 23" and "Psalm 24" stay apart), and how
  // many of each letter it has (two titles a couple of typos apart can't differ by much).
  const facts = new Map(
    titles.map((t) => {
      const counts = new Array<number>(37).fill(0);
      for (const ch of t) {
        const code = ch.charCodeAt(0);
        counts[code >= 97 && code <= 122 ? code - 97 : code >= 48 && code <= 57 ? 26 + (code - 48) : 36]++;
      }
      return [t, { digits: t.replace(/\D/g, ""), counts }];
    }),
  );
  const buckets = new Map<string, string[]>();
  for (const t of titles) {
    const head = t.slice(0, 2);
    const list = buckets.get(head);
    if (list) list.push(t);
    else buckets.set(head, [t]);
  }
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        // Short titles are too easy to confuse ("amen" and "amend"), so they must match exactly.
        if (Math.min(a.length, b.length) < 8) continue;
        const fa = facts.get(a)!;
        const fb = facts.get(b)!;
        if (fa.digits !== fb.digits) continue;
        const allowed = Math.max(a.length, b.length) >= 16 ? 2 : 1;
        if (Math.abs(a.length - b.length) > allowed) continue;
        let apart = 0;
        for (let k = 0; k < 37 && apart <= allowed * 2; k++) apart += Math.abs(fa.counts[k] - fb.counts[k]);
        if (apart > allowed * 2) continue;
        if (editDistance(a, b, allowed) <= allowed) parent.set(find(a), find(b));
      }
    }
  }

  const merged = new Map<string, { titles: string[]; songs: SongLite[] }>();
  for (const t of titles) {
    const root = find(t);
    const group = merged.get(root) ?? { titles: [], songs: [] };
    group.titles.push(t);
    group.songs.push(...byTitle.get(t)!);
    merged.set(root, group);
  }

  return [...merged.values()]
    .filter((g) => g.songs.length > 1)
    .map((g) => ({
      title: g.titles.sort((a, b) => (byTitle.get(b)?.length ?? 0) - (byTitle.get(a)?.length ?? 0))[0],
      songs: g.songs.sort((a, b) => a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist)),
      match: (g.titles.length > 1 ? "close" : "same") as "same" | "close",
    }))
    .sort((a, b) => b.songs.length - a.songs.length || a.title.localeCompare(b.title));
}

export type ArtistVariants = {
  /** The spelling most songs already use, suggested as the one to keep. */
  canonical: string;
  variants: { name: string; count: number }[];
};

/**
 * Artist names that are the same apart from capital letters, spacing or punctuation, with how many songs use
 * each spelling. Only names with more than one spelling are returned.
 */
export function findArtistVariants(artists: string[]): ArtistVariants[] {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of artists) {
    const name = raw.trim();
    const key = normalizeArtist(name);
    if (!key) continue;
    const counts = groups.get(key) ?? new Map<string, number>();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    groups.set(key, counts);
  }
  return [...groups.values()]
    .filter((counts) => counts.size > 1)
    .map((counts) => {
      // The commonest spelling wins; on a tie, one that starts with a capital letter does.
      const capital = (n: string) => (n[0] !== n[0].toLowerCase() ? 0 : 1);
      const variants = [...counts]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || capital(a.name) - capital(b.name) || a.name.localeCompare(b.name));
      return { canonical: variants[0].name, variants };
    })
    .sort((a, b) => a.canonical.localeCompare(b.canonical));
}
