import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddToSetlist } from "@/components/add-to-setlist";
import { DeleteButton } from "@/components/delete-button";
import { SongView } from "@/components/song-view";
import { listSetlists } from "@/lib/setlists";
import { getSong } from "@/lib/songs";
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
  const [song, { upcoming, past }] = await Promise.all([getSong(id), listSetlists()]);
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
      actions={
        <div className="space-y-3">
          <AddToSetlist
            songId={song.id}
            songTitle={song.title}
            setlists={[...upcoming, ...past].map((s) => ({ id: s.id, name: s.name, service_date: s.service_date }))}
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
