import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SongView } from "@/components/song-view";
import { getSong, listPresets } from "@/lib/songs";
import { deleteSong } from "../actions";

export default function SongPage({ params }: PageProps<"/songs/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Song params={params} />
    </Suspense>
  );
}

async function Song({ params }: { params: PageProps<"/songs/[id]">["params"] }) {
  const { id } = await params;
  const [song, presets] = await Promise.all([getSong(id), listPresets(id)]);
  if (!song) notFound();

  // The song itself is shown by SongView, laid out the same as the editor's Preview tab.
  return (
    <SongView
      songId={song.id}
      title={song.title}
      tempo={song.tempo}
      originalKey={song.original_key}
      defaultCapo={song.default_capo}
      body={song.body}
      presets={presets}
      actions={
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
          <Link href={`/songs/${song.id}/edit`} className="btn btn-primary">
            Edit song
          </Link>
          <form action={deleteSong}>
            <input type="hidden" name="id" value={song.id} />
            <button type="submit" className="text-sm text-danger hover:underline">
              Delete
            </button>
          </form>
        </div>
      }
    />
  );
}
