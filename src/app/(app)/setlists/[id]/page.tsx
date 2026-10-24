import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SongSkeleton } from "@/components/skeletons";
import { SetlistPlayer } from "@/components/setlist-player";
import { getSetlist, getTeamExtras, listMessages, listSingers } from "@/lib/setlists";
import { addDays } from "@/lib/schedule";
import { getSetlistTeam, getMyPersonId, listColumns, listEventChoices, listPeople } from "@/lib/schedule-data";
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
  // The services a setlist can be linked to are the ones around today, so "today" is read per request.
  await connection();
  const today = new Date().toISOString().slice(0, 10);
  const [found, shortcuts, messages, extras, singers, team, people, columns, eventChoices, myPersonId] = await Promise.all([
    getSetlist(id),
    listChordShortcuts(),
    listMessages(id),
    getTeamExtras(id),
    listSingers(),
    getSetlistTeam(id),
    listPeople(),
    listColumns(),
    listEventChoices(addDays(today, -14), addDays(today, 150)),
    getMyPersonId(),
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
      team={team}
      people={people}
      columns={columns}
      eventChoices={eventChoices}
      myPersonId={myPersonId}
    />
  );
}
