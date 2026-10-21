import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintSongSheet } from "@/components/print-sheet";
import { SongSkeleton } from "@/components/skeletons";
import { defaultSettings } from "@/lib/setlist-settings";
import { getSong } from "@/lib/songs";

export default function PrintSongPage({ params }: PageProps<"/songs/[id]/print">) {
  return (
    <Suspense fallback={<SongSkeleton />}>
      <PrintSong params={params} />
    </Suspense>
  );
}

async function PrintSong({ params }: { params: PageProps<"/songs/[id]/print">["params"] }) {
  const { id } = await params;
  const song = await getSong(id);
  if (!song) notFound();
  return (
    <PrintSongSheet
      song={{
        id: song.id,
        title: song.title,
        artist: song.artist,
        originalKey: song.original_key,
        tempo: song.tempo,
        body: song.body,
        settings: defaultSettings(song.default_capo),
        notes: [],
      }}
    />
  );
}
