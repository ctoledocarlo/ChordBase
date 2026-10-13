import Link from "next/link";
import { Suspense } from "react";
import { SidebarPortal } from "@/components/sidebar-portal";
import { getCurrentChurch } from "@/lib/church";
import { listSongs } from "@/lib/songs";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense>
      <Library searchParams={searchParams} />
    </Suspense>
  );
}

async function Library({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const church = await getCurrentChurch();
  if (!church) return null;

  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const songs = await listSongs(q);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Songs</h1>
      <p className="mt-1 text-sm text-muted">
        {q ? `${songs.length} matching “${q}”` : `${songs.length} ${songs.length === 1 ? "song" : "songs"}`}
      </p>

      <SidebarPortal>
        <SearchForm q={q} />
        <Link href="/songs/new" className="btn btn-primary w-full">
          Add song
        </Link>
      </SidebarPortal>
      <div className="mt-5 lg:hidden">
        <SearchForm q={q} />
      </div>

      {songs.length === 0 ? (
        <p className="mt-10 text-muted">{q ? "Nothing matches that search." : "No songs yet. Add your first one."}</p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {songs.map((s) => (
            <li key={s.id}>
              <Link href={`/songs/${s.id}`} className="flex items-baseline gap-4 px-1 py-3.5 hover:bg-hover">
                <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                {s.artist && <span className="hidden truncate text-sm text-muted sm:inline">{s.artist}</span>}
                <span className="w-10 text-right font-mono text-sm text-muted">{s.original_key}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchForm({ q }: { q: string }) {
  return (
    <form action="/">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Search by title or artist"
        aria-label="Search songs"
        className="field"
      />
    </form>
  );
}
