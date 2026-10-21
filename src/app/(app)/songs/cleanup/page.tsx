import { Suspense } from "react";
import { CleanupView } from "@/components/cleanup-view";
import { ListPageSkeleton } from "@/components/skeletons";
import { findArtistVariants, findDuplicateGroups } from "@/lib/duplicates";
import { listAllSongs } from "@/lib/library";

export default function CleanupPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <Cleanup />
    </Suspense>
  );
}

async function Cleanup() {
  const songs = await listAllSongs();
  const groups = findDuplicateGroups(songs).slice(0, 200);
  const artists = findArtistVariants(songs.map((s) => s.artist));
  return <CleanupView songCount={songs.length} groups={groups} artists={artists} />;
}
