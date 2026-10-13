import Link from "next/link";
import { Suspense } from "react";
import { SearchForm } from "@/components/search-form";
import { SongFilterPanel } from "@/components/song-filters";
import { getCurrentChurch } from "@/lib/church";
import { PAGE_SIZE, activeFilterCount, filtersToParams, pageList, parseSongFilters, type SongFilters } from "@/lib/song-filters";
import { getSongFacets, searchSongs } from "@/lib/songs";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense>
      <Library searchParams={searchParams} />
    </Suspense>
  );
}

const href = (f: SongFilters, page: number) => {
  const qs = filtersToParams(f, page).toString();
  return qs ? `/?${qs}` : "/";
};

async function Library({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const church = await getCurrentChurch();
  if (!church) return null;

  const filters = parseSongFilters(await searchParams);
  const [result, facets] = await Promise.all([searchSongs(filters), getSongFacets()]);
  const { songs, total, page, pages } = result;
  const narrowed = filters.q !== "" || activeFilterCount(filters) > 0;

  const first = (page - 1) * PAGE_SIZE + 1;
  const summary =
    total === 0
      ? "No songs"
      : `${first}–${first + songs.length - 1} of ${total} ${total === 1 ? "song" : "songs"}${narrowed ? " match" : ""}`;

  // Searching keeps the filters, and the other way round; changing either starts again at page 1.
  const keep = [...filtersToParams({ ...filters, q: "" }, 1)] as [string, string][];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <SongFilterPanel filters={filters} facets={facets} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Songs</h1>
          <p className="mt-1 text-sm text-muted">{summary}</p>
        </div>
        <div className="flex flex-none gap-2">
          <Link href="/songs/import" className="btn">
            Import
          </Link>
          <Link href="/songs/new" className="btn btn-primary">
            Add song
          </Link>
        </div>
      </div>

      <SearchForm action="/" q={filters.q} keep={keep} label="Search songs" placeholder="Search by title or artist" />

      {songs.length === 0 ? (
        <p className="mt-10 text-muted">
          {narrowed ? "Nothing matches that. Try clearing a filter." : "No songs yet. Add your first one."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {songs.map((s) => (
            <li key={s.id}>
              <Link href={`/songs/${s.id}`} className="flex items-baseline gap-4 px-1 py-3.5 hover:bg-hover">
                <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                {s.artist && <span className="hidden truncate text-sm text-muted sm:inline">{s.artist}</span>}
                {s.tempo && <span className="hidden w-16 text-right text-sm text-muted md:inline">{s.tempo} BPM</span>}
                <span className="w-10 text-right font-mono text-sm text-muted">{s.original_key}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && <Pagination filters={filters} page={page} pages={pages} />}
    </div>
  );
}

function Pagination({ filters, page, pages }: { filters: SongFilters; page: number; pages: number }) {
  const cell = "btn min-w-9 px-2";
  return (
    <nav aria-label="Pages" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={href(filters, page - 1)} className={cell} rel="prev">
          Previous
        </Link>
      ) : (
        <span className={`${cell} pointer-events-none opacity-40`}>Previous</span>
      )}
      {pageList(page, pages).map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-muted">
            …
          </span>
        ) : (
          <Link
            key={n}
            href={href(filters, n)}
            aria-current={n === page ? "page" : undefined}
            className={`${cell} ${n === page ? "btn-primary" : ""}`}
          >
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={href(filters, page + 1)} className={cell} rel="next">
          Next
        </Link>
      ) : (
        <span className={`${cell} pointer-events-none opacity-40`}>Next</span>
      )}
    </nav>
  );
}
