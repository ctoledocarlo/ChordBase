import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SongEditor } from "@/components/song-editor";
import { getSong } from "@/lib/songs";

export default function EditSongPage({ params }: PageProps<"/songs/[id]/edit">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/songs/[id]/edit">["params"] }) {
  const { id } = await params;
  const song = await getSong(id);
  if (!song) notFound();
  return (
    <>
      <Link href={`/songs/${song.id}`} className="text-sm underline">
        ← {song.title}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Edit song</h1>
      <SongEditor song={song} />
    </>
  );
}
