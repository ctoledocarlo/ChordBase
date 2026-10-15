import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SetlistPlayer } from "@/components/setlist-player";
import { getSetlist, listMessages } from "@/lib/setlists";
import { listChordShortcuts } from "@/lib/songs";

export default function SetlistPage({ params }: PageProps<"/setlists/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Setlist params={params} />
    </Suspense>
  );
}

async function Setlist({ params }: { params: PageProps<"/setlists/[id]">["params"] }) {
  const { id } = await params;
  const [found, shortcuts, messages] = await Promise.all([getSetlist(id), listChordShortcuts(), listMessages(id)]);
  if (!found) notFound();
  return <SetlistPlayer setlist={found.setlist} initialItems={found.items} initialMessages={messages} shortcuts={shortcuts} />;
}
