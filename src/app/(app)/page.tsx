import Link from "next/link";
import { Suspense } from "react";
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
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Songs</h1>
        <Link href="/songs/new" className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background">
          Add song
        </Link>
      </div>

      <form action="/" className="mt-6">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by title or artist"
          aria-label="Search songs"
          className="block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
      </form>

      {songs.length === 0 ? (
        <p className="mt-8 text-zinc-600 dark:text-zinc-400">
          {q ? `No songs match “${q}”.` : "No songs yet. Add your first one."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
          {songs.map((s) => (
            <li key={s.id}>
              <Link href={`/songs/${s.id}`} className="flex items-baseline justify-between gap-4 py-3 hover:underline">
                <span>
                  <span className="font-medium">{s.title}</span>
                  {s.artist && <span className="ml-2 text-sm text-zinc-500">{s.artist}</span>}
                </span>
                {s.original_key && <span className="font-mono text-sm text-zinc-500">{s.original_key}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
