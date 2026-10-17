export const PAGE_SIZE = 25;

export const SORTS = [
  // Only offered (and only used) while searching: the songs closest to what was typed come first.
  { value: "relevance", label: "Best match" },
  { value: "title", label: "Title (A–Z)" },
  { value: "artist", label: "Artist (A–Z)" },
  { value: "key", label: "Key" },
  { value: "tempo", label: "Tempo (slowest first)" },
  { value: "recent", label: "Recently changed" },
] as const;

export type SongSort = (typeof SORTS)[number]["value"];

/** Everything the song list can be narrowed or ordered by. Lives in the page's URL. */
export type SongFilters = {
  q: string;
  keys: string[];
  artist: string;
  mode: "" | "major" | "minor";
  tempoMin: number | null;
  tempoMax: number | null;
  timeSig: string;
  capo: number | null;
  sort: SongSort;
  page: number;
};

/** How the list is ordered when nothing has been chosen: best match while searching, otherwise by title. */
export const defaultSort = (q: string): SongSort => (q.trim() !== "" ? "relevance" : "title");

type Raw = Record<string, string | string[] | undefined>;

const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const first = (v: string | string[] | undefined) => all(v)[0]?.trim() ?? "";

function intIn(v: string, min: number, max: number): number | null {
  if (!/^\d{1,4}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

export function parseSongFilters(raw: Raw): SongFilters {
  let tempoMin = intIn(first(raw.tempo_min), 20, 300);
  let tempoMax = intIn(first(raw.tempo_max), 20, 300);
  if (tempoMin !== null && tempoMax !== null && tempoMin > tempoMax) [tempoMin, tempoMax] = [tempoMax, tempoMin];
  const sort = first(raw.sort);
  const mode = first(raw.mode);
  const q = first(raw.q).slice(0, 100);
  return {
    q,
    keys: [...new Set(all(raw.key).map((k) => k.trim()).filter((k) => k !== "" && k.length <= 12))].slice(0, 30),
    artist: first(raw.artist).slice(0, 200),
    mode: mode === "major" || mode === "minor" ? mode : "",
    tempoMin,
    tempoMax,
    timeSig: /^\d{1,2}\/\d{1,2}$/.test(first(raw.ts)) ? first(raw.ts) : "",
    capo: intIn(first(raw.capo), 0, 12),
    // "Best match" means nothing without a search, so it falls back to title.
    sort: SORTS.some((s) => s.value === sort) && !(sort === "relevance" && q === "") ? (sort as SongSort) : defaultSort(q),
    page: intIn(first(raw.page), 1, 100000) ?? 1,
  };
}

/** The URL query for these filters, leaving out anything that is at its default. */
export function filtersToParams(f: SongFilters, page = f.page): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  for (const k of f.keys) p.append("key", k);
  if (f.artist) p.set("artist", f.artist);
  if (f.mode) p.set("mode", f.mode);
  if (f.tempoMin !== null) p.set("tempo_min", String(f.tempoMin));
  if (f.tempoMax !== null) p.set("tempo_max", String(f.tempoMax));
  if (f.timeSig) p.set("ts", f.timeSig);
  if (f.capo !== null) p.set("capo", String(f.capo));
  if (f.sort !== defaultSort(f.q)) p.set("sort", f.sort);
  if (page > 1) p.set("page", String(page));
  return p;
}

/** How many filters are narrowing the list (the search box and sort order don't count). */
export function activeFilterCount(f: SongFilters): number {
  return (
    (f.keys.length > 0 ? 1 : 0) +
    (f.artist ? 1 : 0) +
    (f.mode ? 1 : 0) +
    (f.tempoMin !== null || f.tempoMax !== null ? 1 : 0) +
    (f.timeSig ? 1 : 0) +
    (f.capo !== null ? 1 : 0)
  );
}

/** Page numbers to show: the first, the last and the ones around the current page, with gaps. */
export function pageList(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const nums = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

export type SongFacets = {
  keys: string[];
  artists: string[];
  timeSignatures: string[];
  capos: number[];
};
