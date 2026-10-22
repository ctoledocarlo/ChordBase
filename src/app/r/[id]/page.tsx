import { Suspense } from "react";
import { Remote, RemotePin } from "@/components/remote";
import { SongSkeleton } from "@/components/skeletons";
import { readRemoteState, remoteAccess } from "@/lib/remote-access";

export default function RemotePage({ params }: PageProps<"/r/[id]">) {
  return (
    <Suspense fallback={<SongSkeleton />}>
      <PhoneRemote params={params} />
    </Suspense>
  );
}

async function PhoneRemote({ params }: { params: PageProps<"/r/[id]">["params"] }) {
  const { id } = await params;
  const found = await remoteAccess(id);
  // No ticket yet (or a stale one): ask for the PIN. Nothing about the setlist is shown before that.
  if (!("access" in found)) return <RemotePin setlistId={id} unavailable={found.refusal === "unavailable"} />;
  return <Remote setlistId={id} initial={await readRemoteState(found.access)} />;
}
