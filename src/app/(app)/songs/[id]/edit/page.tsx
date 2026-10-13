import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SongEditor } from "@/components/song-editor";
import { getSong, listChordShortcuts } from "@/lib/songs";

export default function EditSongPage({ params }: PageProps<"/songs/[id]/edit">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/songs/[id]/edit">["params"] }) {
  const { id } = await params;
  const [song, shortcuts] = await Promise.all([getSong(id), listChordShortcuts()]);
  if (!song) notFound();
  return <SongEditor song={song} shortcuts={shortcuts} />;
}
