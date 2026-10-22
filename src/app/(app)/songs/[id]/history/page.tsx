import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/skeletons";
import { SongHistory } from "@/components/song-history";
import { listSongVersions } from "@/lib/library";
import { getSong } from "@/lib/songs";

export default function SongHistoryPage({ params }: PageProps<"/songs/[id]/history">) {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <History params={params} />
    </Suspense>
  );
}

async function History({ params }: { params: PageProps<"/songs/[id]/history">["params"] }) {
  const { id } = await params;
  const [song, versions] = await Promise.all([getSong(id), listSongVersions(id)]);
  if (!song) notFound();
  return <SongHistory song={song} versions={versions} />;
}
