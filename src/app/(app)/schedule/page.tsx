import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScheduleView } from "@/components/schedule-view";
import { ListPageSkeleton } from "@/components/skeletons";
import { getCurrentChurch, getUserId } from "@/lib/church";
import { can } from "@/lib/roles";
import { listSetlistChoices } from "@/lib/setlists";
import { getMyPersonId, listColumns, listEvents, listLog, listPeople, listSetlistLinks, scheduleWindow } from "@/lib/schedule-data";

export const metadata: Metadata = { title: "Schedule · ChordBase" };

export default function SchedulePage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <Schedule />
    </Suspense>
  );
}

async function Schedule() {
  // "Today" is read per request, never baked into a prebuilt page. (The page itself uses the browser's own date.)
  await connection();
  const { from, to } = scheduleWindow(new Date().toISOString().slice(0, 10));
  const [church, people, events, columns, log, links, setlists, myPersonId, myUserId] = await Promise.all([
    getCurrentChurch(),
    listPeople(),
    listEvents(from, to),
    listColumns(),
    listLog(),
    listSetlistLinks(),
    listSetlistChoices(),
    getMyPersonId(),
    getUserId(),
  ]);
  // Someone with no church sees the join screen over everything, so there is nothing to show here.
  if (!church) return null;
  return <ScheduleView people={people} events={events} columns={columns} log={log} links={links} setlists={setlists} myPersonId={myPersonId} myUserId={myUserId} canManage={can(church.role, "manage-schedule")} />;
}
