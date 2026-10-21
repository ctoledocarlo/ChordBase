import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintSetlistSheet } from "@/components/print-sheet";
import { SongSkeleton } from "@/components/skeletons";
import { effectiveBody } from "@/lib/setlist-body";
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
  const [found, extras, singers] = await Promise.all([getSetlist(id), getTeamExtras(id), listSingers()]);
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

  return (
    <PrintSetlistSheet
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
