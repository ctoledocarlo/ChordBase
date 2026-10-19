import Link from "next/link";
import { Suspense } from "react";
import { SearchForm } from "@/components/search-form";
import { EmptyState } from "@/components/empty-state";
import { ListPageSkeleton } from "@/components/skeletons";
import { FiltersButton, SongFilterPanel } from "@/components/song-filters";
import { formatDay } from "@/lib/setlist-expiry";
import { getNextSetlist } from "@/lib/setlists";
import { PAGE_SIZE, activeFilterCount, filterChips, filtersToParams, pageList, parseSongFilters, type SongFilters } from "@/lib/song-filters";
import { getSongFacets, searchSongs } from "@/lib/songs";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <Library searchParams={searchParams} />
    </Suspense>
  );
}

const href = (f: SongFilters, page: number) => {
  const qs = filtersToParams(f, page).toString();
  return qs ? `/?${qs}` : "/";
};

async function Library({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const filters = parseSongFilters(await searchParams);
  const narrowed = filters.q !== "" || activeFilterCount(filters) > 0;
  // The next-setlist banner is for arriving at the library, not for paging through or searching it,
  // so it isn't even asked for then. Everything else is asked for at once.
  const welcome = !narrowed && filters.page === 1;
  const [result, facets, nextSetlist] = await Promise.all([
    searchSongs(filters),
    getSongFacets(),
    welcome ? getNextSetlist() : Promise.resolve(null),
  ]);
  const { songs, total, page, pages } = result;

  const first = (page - 1) * PAGE_SIZE + 1;
  const summary =
    total === 0
      ? "No songs"
      : `${first}–${first + songs.length - 1} of ${total} ${total === 1 ? "song" : "songs"}${narrowed ? " match" : ""}`;

  // Searching keeps the filters, and the other way round; changing either starts again at page 1.
  const keep = [...filtersToParams({ ...filters, q: "" }, 1)] as [string, string][];
  const chips = filterChips(filters);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <SongFilterPanel filters={filters} facets={facets} />

      {welcome && (
        <Link
          data-tour="songs-banner"
          href={nextSetlist ? `/setlists/${nextSetlist.id}` : "/setlists"}
          className="group mb-6 flex items-center gap-3 rounded-lg border border-line bg-gradient-to-r from-accent/10 to-transparent px-4 py-2.5 text-sm hover:border-accent"
        >
          {nextSetlist ? (
            <>
              <span className="flex-none text-xs font-medium uppercase tracking-wide text-muted">Next setlist</span>
              <span className="min-w-0 truncate font-semibold">{nextSetlist.name}</span>
              <span className="hidden flex-none text-muted sm:inline">
                {nextSetlist.service_date ? formatDay(nextSetlist.service_date) : "No date set"} · {nextSetlist.songCount}{" "}
                {nextSetlist.songCount === 1 ? "song" : "songs"}
              </span>
            </>
          ) : (
            <span className="text-muted">No setlist planned yet.</span>
          )}
          <span className="ml-auto flex-none font-medium group-hover:underline">
            {nextSetlist ? "Open" : "Create one"} <span aria-hidden>→</span>
          </span>
        </Link>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Songs</h1>
          <p className="mt-1 text-sm text-muted">{summary}</p>
        </div>
        <div data-tour="songs-buttons" className="flex flex-none gap-2">
          <Link href="/songs/import" className="btn">
            Import
          </Link>
          <Link href="/songs/new" className="btn btn-primary">
            Add song
          </Link>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchForm
            tourId="songs-search"
            action="/"
            q={filters.q}
            keep={keep}
            label="Search songs"
            placeholder="Search by title, artist or lyrics"
            className=""
          />
        </div>
        <FiltersButton count={activeFilterCount(filters)} />
      </div>

      {chips.length > 0 && (
        <ul data-tour="songs-chips" aria-label="Applied filters" className="mt-3 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <li key={c.id}>
              <Link
                href={href(c.without, 1)}
                aria-label={`Remove filter: ${c.label}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-hover px-2.5 py-1 text-xs hover:border-foreground"
              >
                {c.label}
                <span aria-hidden className="text-muted">
                  ×
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link href={filters.q ? `/?q=${encodeURIComponent(filters.q)}` : "/"} className="px-1 text-xs text-muted underline hover:text-foreground">
              Clear all
            </Link>
          </li>
        </ul>
      )}

      {songs.length === 0 ? (
        narrowed ? (
          <EmptyState
            art="search"
            title="Nothing matches that"
            actions={
              <Link href="/" className="btn">
                Clear the search and filters
              </Link>
            }
          >
            Try fewer words, or take a filter off.
          </EmptyState>
        ) : (
          <EmptyState
            art="songs"
            title="Your library is empty"
            actions={
              <>
                <Link href="/songs/new" className="btn btn-primary">
                  Add your first song
                </Link>
                <Link href="/songs/import" className="btn">
                  Import from PowerPoint
                </Link>
              </>
            }
          >
            Add songs one at a time, or bring in a whole PowerPoint of them at once.
          </EmptyState>
        )
      ) : (
        <ul data-tour="songs-list" className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {songs.map((s) => (
            <li key={s.id}>
              <Link data-row="" href={`/songs/${s.id}`} className="group flex items-center gap-4 px-4 py-3 hover:bg-hover focus-visible:bg-hover">
                <span className="flex h-10 w-12 flex-none items-center justify-center rounded-md border border-line bg-surface font-mono text-sm font-semibold text-chord">
                  {s.original_key || "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.title}</span>
                  {(s.artist || s.tempo) && (
                    <span className="block truncate text-sm text-muted">
                      {[s.artist, s.tempo ? `${s.tempo} BPM` : ""].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {s.snippet && <span className="block truncate text-sm italic text-muted">“{s.snippet}”</span>}
                </span>
                <span aria-hidden className="text-muted transition-transform group-hover:translate-x-0.5">
                  →
                </span>
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
    <nav aria-label="Pages" data-tour="songs-pages" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
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
