import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Remote } from "@/components/remote";
import { SongSkeleton } from "@/components/skeletons";
import { getSetlist, getTeamExtras, listMessages } from "@/lib/setlists";

export default function RemotePage({ params }: PageProps<"/setlists/[id]/remote">) {
  return (
    <Suspense fallback={<SongSkeleton />}>
      <PhoneRemote params={params} />
    </Suspense>
  );
}

async function PhoneRemote({ params }: { params: PageProps<"/setlists/[id]/remote">["params"] }) {
  const { id } = await params;
  const [found, messages, extras] = await Promise.all([getSetlist(id), listMessages(id), getTeamExtras(id)]);
  if (!found) notFound();
  return <Remote setlist={found.setlist} initialItems={found.items} initialMessages={messages} initialExtras={extras} />;
}
