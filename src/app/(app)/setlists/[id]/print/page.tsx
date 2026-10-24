import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintSetlistSheet } from "@/components/print-sheet";
import { SongSkeleton } from "@/components/skeletons";
import { effectiveBody } from "@/lib/setlist-body";
import { personName } from "@/lib/schedule";
import { getSetlistTeam, listColumns, listPeople } from "@/lib/schedule-data";
import { activeColumns } from "@/lib/schedule-columns";
import { getSetlist, getTeamExtras, listSingers } from "@/lib/setlists";

export default function PrintSetlistPage({ params }: PageProps<"/setlists/[id]/print">) {
  return (
    <Suspense fallback={<SongSkeleton />}>
      <PrintSetlist params={params} />
    </Suspense>
  );
}

async function PrintSetlist({ params }: { params: PageProps<"/setlists/[id]/print">["params"] }) {
  const { id } = await params;
  const [found, extras, singers, serviceTeam, people, columns] = await Promise.all([getSetlist(id), getTeamExtras(id), listSingers(), getSetlistTeam(id), listPeople(), listColumns()]);
  if (!found) notFound();

  // The shared view first, then the instruments, so the first choice is everyone's notes.
  const views = [...extras.views].sort((a, b) => (a.kind === "all" ? -1 : b.kind === "all" ? 1 : a.position - b.position));
  const positionOf = new Map(found.items.map((item, i) => [item.id, i]));
  const notesByView: Record<string, Record<number, string>> = {};
  for (const note of extras.notes) {
    const at = positionOf.get(note.item_id);
    if (at === undefined) continue;
    (notesByView[note.view_id] ??= {})[at] = note.body;
  }

  // Who is on for the service: the song leader first, then the band, then the rest, as on the schedule.
  const byId = new Map(people.map((p) => [p.id, p]));
  const team = activeColumns(columns).filter((c) => c.kind === "people").flatMap((role) => {
    const names = (serviceTeam?.assignments ?? [])
      .filter((a) => a.role === role.key)
      .map((a) => byId.get(a.person_id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map(personName)
      .sort((a, b) => a.localeCompare(b));
    return names.length > 0 ? [{ label: role.label, names }] : [];
  });

  return (
    <PrintSetlistSheet
      team={team}
      name={found.setlist.name}
      date={found.setlist.service_date}
      views={views.map((v) => ({ id: v.id, name: v.kind === "all" ? "Everyone" : v.name }))}
      notesByView={notesByView}
      songs={found.items.map((item) => ({
        id: item.id,
        title: item.song.title,
        artist: item.song.artist,
        originalKey: item.song.original_key,
        tempo: item.song.tempo,
        body: effectiveBody(item),
        settings: item.settings,
        notes: [],
        singer: singers.find((s) => s.id === item.singer_id)?.name,
      }))}
    />
  );
}
