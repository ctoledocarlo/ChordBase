import Link from "next/link";
import { Suspense } from "react";
import { SearchForm } from "@/components/search-form";
import { SongFilterPanel } from "@/components/song-filters";
import { getCurrentChurch } from "@/lib/church";
import { formatDay } from "@/lib/setlist-expiry";
import { listSetlists } from "@/lib/setlists";
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
  const [result, facets, setlists] = await Promise.all([searchSongs(filters), getSongFacets(), listSetlists()]);
  const { songs, total, page, pages } = result;
  const narrowed = filters.q !== "" || activeFilterCount(filters) > 0;
  // The welcome section is for arriving at the library, not for paging through or searching it.
  const welcome = !narrowed && page === 1;
  const nextSetlist = setlists.upcoming[0];

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

      {welcome && (
        <Link
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
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {songs.map((s) => (
            <li key={s.id}>
              <Link href={`/songs/${s.id}`} className="group flex items-center gap-4 px-4 py-3 hover:bg-hover">
                <span className="flex h-10 w-12 flex-none items-center justify-center rounded-md border border-line bg-surface font-mono text-sm font-semibold text-chord">
                  {s.original_key || "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.title}</span>
                  {s.artist && <span className="block truncate text-sm text-muted">{s.artist}</span>}
                </span>
                {s.tempo && <span className="hidden text-sm tabular-nums text-muted sm:inline">{s.tempo} BPM</span>}
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
