import { connection } from "next/server";
import { Suspense } from "react";
import { HistoryView } from "@/components/history-view";
import { ListPageSkeleton } from "@/components/skeletons";
import { addDays, summarize } from "@/lib/history";
import { listPlays, listSongRefs } from "@/lib/library";

export default function HistoryPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <History />
    </Suspense>
  );
}

async function History() {
  // The date is read per request, never baked into a prebuilt page.
  await connection();
  const today = new Date().toISOString().slice(0, 10);
  // A year of services is plenty to see what is used a lot and what has been forgotten.
  const [plays, songs] = await Promise.all([listPlays(addDays(today, -365)), listSongRefs()]);
  const summary = summarize(plays, songs, today);

  // Only what the page shows is sent to the browser: the songs that were played, and the first of those that were not.
  const played = summary.stats.filter((s) => s.count > 0).map(({ id, title, artist, count, last, recent }) => ({ id, title, artist, count, last, recent }));
  const neglected = summary.neglected.slice(0, 300).map(({ id, title, artist, count, last }) => ({ id, title, artist, count, last }));
  const overused = summary.overused.map(({ id, title, artist, count, last, recent }) => ({ id, title, artist, count, last, recent }));

  return (
    <HistoryView
      today={today}
      services={summary.services.slice(0, 60)}
      played={played}
      overused={overused}
      neglected={neglected}
      neglectedTotal={summary.neglected.length}
      neverPlayed={summary.stats.filter((s) => s.count === 0).length}
      songCount={songs.length}
    />
  );
}
