import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddToSetlist } from "@/components/add-to-setlist";
import { DeleteButton } from "@/components/delete-button";
import { SongSkeleton } from "@/components/skeletons";
import { SongView } from "@/components/song-view";
import { ago } from "@/lib/history";
import { getSongPlays } from "@/lib/library";
import { listSetlistChoices, listSingers } from "@/lib/setlists";
import { getSong, songLinks } from "@/lib/songs";
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
  // "Today" is read below, so the page has to be known to depend on the request first.
  await connection();
  const [song, setlists, singers, plays] = await Promise.all([getSong(id), listSetlistChoices(), listSingers(), getSongPlays(id)]);
  if (!song) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const played =
    plays.count === 0 || !plays.last
      ? "Not played yet."
      : `Played ${plays.count} ${plays.count === 1 ? "time" : "times"}, last ${ago(plays.last, today)}.`;

  // The song itself is shown by SongView, laid out the same as the editor's Preview tab.
  return (
    <SongView
      team={{
        songId: song.id,
        tags: song.tags ?? [],
        links: songLinks(song),
        melodyLow: song.melody_low ?? "",
        melodyHigh: song.melody_high ?? "",
        singers,
        played,
      }}
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
