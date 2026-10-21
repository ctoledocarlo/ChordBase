import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SongSkeleton } from "@/components/skeletons";
import { SetlistPlayer } from "@/components/setlist-player";
import { getSetlist, getTeamExtras, listMessages, listSingers } from "@/lib/setlists";
import { listChordShortcuts } from "@/lib/songs";

export default function SetlistPage({ params }: PageProps<"/setlists/[id]">) {
  return (
    <Suspense fallback={<SongSkeleton />}>
      <Setlist params={params} />
    </Suspense>
  );
}

async function Setlist({ params }: { params: PageProps<"/setlists/[id]">["params"] }) {
  const { id } = await params;
  const [found, shortcuts, messages, extras, singers] = await Promise.all([
    getSetlist(id),
    listChordShortcuts(),
    listMessages(id),
    getTeamExtras(id),
    listSingers(),
  ]);
  if (!found) notFound();
  return (
    <SetlistPlayer
      setlist={found.setlist}
      initialItems={found.items}
      initialMessages={messages}
      initialExtras={extras}
      initialSingers={singers}
      shortcuts={shortcuts}
    />
  );
}
