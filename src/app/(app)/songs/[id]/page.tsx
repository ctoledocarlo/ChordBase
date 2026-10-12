import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SongView } from "@/components/song-view";
import { getSong } from "@/lib/songs";
import { deleteSong } from "../actions";

export default function SongPage({ params }: PageProps<"/songs/[id]">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
      <Song params={params} />
    </Suspense>
  );
}

async function Song({ params }: { params: PageProps<"/songs/[id]">["params"] }) {
  const { id } = await params;
  const song = await getSong(id);
  if (!song) notFound();

  const meta = [
    song.artist,
    song.original_key && `Key ${song.original_key}`,
    song.default_capo > 0 && `Capo ${song.default_capo}`,
    song.tempo && `${song.tempo} BPM`,
    song.time_signature,
  ].filter(Boolean);

  return (
    <>
      <Link href="/" className="text-sm underline">
        ← Songs
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{song.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{meta.join(" · ")}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/songs/${song.id}/edit`} className="underline">
            Edit
          </Link>
          <form action={deleteSong}>
            <input type="hidden" name="id" value={song.id} />
            <button type="submit" className="text-red-600 underline dark:text-red-400">
              Delete
            </button>
          </form>
        </div>
      </div>
      <div className="mt-6">
        <SongView originalKey={song.original_key} body={song.body} />
      </div>
    </>
  );
}
