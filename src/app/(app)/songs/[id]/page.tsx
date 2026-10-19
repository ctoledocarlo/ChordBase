import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddToSetlist } from "@/components/add-to-setlist";
import { DeleteButton } from "@/components/delete-button";
import { SongSkeleton } from "@/components/skeletons";
import { SongView } from "@/components/song-view";
import { listSetlistChoices } from "@/lib/setlists";
import { getSong } from "@/lib/songs";
import { deleteSong } from "../actions";

export default function SongPage({ params }: PageProps<"/songs/[id]">) {
  return (
    <Suspense fallback={<SongSkeleton />}>
      <Song params={params} />
    </Suspense>
  );
}

async function Song({ params }: { params: PageProps<"/songs/[id]">["params"] }) {
  const { id } = await params;
  const [song, setlists] = await Promise.all([getSong(id), listSetlistChoices()]);
  if (!song) notFound();

  // The song itself is shown by SongView, laid out the same as the editor's Preview tab.
  return (
    <SongView
      title={song.title}
      tempo={song.tempo}
      originalKey={song.original_key}
      defaultCapo={song.default_capo}
      body={song.body}
      editHref={`/songs/${song.id}/edit`}
      barAction={<AddToSetlist bar songId={song.id} songTitle={song.title} setlists={setlists} />}
      actions={
        <div className="space-y-3">
          <AddToSetlist
            tourId="song-add-setlist"
            songId={song.id}
            songTitle={song.title}
            setlists={setlists}
          />
          <DeleteButton
            action={deleteSong}
            id={song.id}
            title="Delete this song?"
            message={`“${song.title}” will be deleted from your library, and removed from any setlist it's in. This can't be undone.`}
          />
        </div>
      }
    />
  );
}
