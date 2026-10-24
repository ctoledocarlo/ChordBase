"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { linkSetlist, linkSetlistEvent, unlinkSetlist } from "@/app/(app)/schedule/actions";
import { addDays, dayText, isoOf, personName, timeText, type Person, type ScheduleEvent, shortTime, sundaysFrom } from "@/lib/schedule";
import type { ScheduleColumn } from "@/lib/schedule-columns";
import type { EventChoice } from "@/lib/schedule-data";
import { RoleGrid } from "./schedule-bits";
import { ScheduleStore, useScheduleApi } from "./schedule-store";
import { useToast } from "./toast";

/** A short summary of who is on, for the heading: "Maria Reyes +6". */
export function rosterHint(team: ScheduleEvent | null, people: Person[]): string | undefined {
  if (!team || team.assignments.length === 0) return undefined;
  const byId = new Map(people.map((p) => [p.id, p]));
  const lead = team.assignments.find((a) => a.role === "song-leader");
  const name = lead && byId.get(lead.person_id);
  const total = new Set(team.assignments.map((a) => a.person_id)).size;
  return name ? `${personName(name)}${total > 1 ? ` +${total - 1}` : ""}` : `${total} on`;
}

/** The services and events a setlist can be linked to: the ones on the schedule, and the coming Sundays that aren't on it yet. */
function linkOptions(choices: EventChoice[], current: string | null): { value: string; label: string }[] {
  const today = isoOf(new Date());
  const from = addDays(today, -14);
  const have = new Set(choices.filter((c) => c.kind === "sunday").map((c) => c.starts_on));
  const items = [
    ...choices.filter((c) => c.starts_on >= from && c.id !== current).map((c) => ({ date: c.starts_on, order: c.kind === "sunday" ? 0 : 1, value: `e:${c.id}`, label: `${dayText(c.starts_on, today)}${c.kind === "event" ? ` · ${c.title}` : " · Sunday service"}` })),
    ...sundaysFrom(today, 10).filter((d) => !have.has(d)).map((d) => ({ date: d, order: 0, value: `s:${d}`, label: `${dayText(d, today)} · Sunday service` })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order).map(({ value, label }) => ({ value, label }));
}

/**
 * The team for a setlist's service: the song leader, the musicians by instrument and the sound booth.
 * It is the schedule's own list for that service, so changing it here changes the schedule (and the change log),
 * and the other way round. A setlist can be linked to any service or event on the schedule, changed, or unlinked.
 */
export function SetlistRoster(props: {
  setlist: { id: string; name: string; service_date: string | null };
  team: ScheduleEvent | null;
  people: Person[];
  columns: ScheduleColumn[];
  choices: EventChoice[];
  myPersonId: string | null;
}) {
  const { team, people, columns } = props;
  // Who is on and what is picked show at once, and are saved in the background, like on the schedule.
  const initial = useMemo(() => ({ people, columns, events: team ? [team] : [], links: [] }), [people, columns, team]);
  return (
    <ScheduleStore initial={initial}>
      <SetlistRosterBody {...props} />
    </ScheduleStore>
  );
}

function SetlistRosterBody({
  setlist,
  team,
  choices,
  myPersonId,
}: {
  setlist: { id: string; name: string; service_date: string | null };
  team: ScheduleEvent | null;
  people: Person[];
  columns: ScheduleColumn[];
  choices: EventChoice[];
  myPersonId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const api = useScheduleApi();
  const live = (team && api.data.events.find((e) => e.id === team.id)) ?? team;
  const byId = useMemo(() => new Map(api.data.people.map((p) => [p.id, p])), [api.data.people]);
  const reload = () => router.refresh();
  // Worked out when the list is opened, so the server and the browser never disagree about what "today" is.
  const options = useMemo(() => (choosing ? linkOptions(choices, team?.id ?? null) : []), [choosing, choices, team?.id]);

  async function link(create: boolean) {
    setBusy(true);
    const res = await linkSetlistEvent(setlist.id, null, create);
    setBusy(false);
    if ("error" in res) return toast(res.error, { tone: "error" });
    if (!res.event_id) return toast(setlist.service_date ? "Nothing is on the schedule for that date yet." : "Give the setlist a service date first, or start a team.", { tone: "info" });
    reload();
  }

  async function linkTo(value: string) {
    if (!value) return;
    setBusy(true);
    const res = await linkSetlist(setlist.id, value.startsWith("e:") ? { eventId: value.slice(2) } : { sunday: value.slice(2) });
    setBusy(false);
    if ("error" in res) return toast(res.error, { tone: "error" });
    setChoosing(false);
    toast("Linked to the schedule.", { tone: "success" });
    reload();
  }

  async function unlink() {
    setBusy(true);
    const res = await unlinkSetlist(setlist.id);
    setBusy(false);
    if ("error" in res) return toast(res.error, { tone: "error" });
    toast("Unlinked. The schedule keeps who was on.", { tone: "info" });
    reload();
  }

  const chooser = choosing && (
    <label className="block">
      <span className="sr-only">Service to link to</span>
      <select value="" disabled={busy} onChange={(e) => void linkTo(e.target.value)} className="field field-sm" aria-label="Link to a service or event">
        <option value="">Choose a service or event…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  if (!team) {
    return (
      <div className="space-y-2.5">
        <p className="text-sm text-muted">
          Link this setlist to its service on the schedule. Then the song leader, the musicians and the sound booth show up here, and the schedule shows this setlist.
        </p>
        {setlist.service_date && (
          <button type="button" className="btn w-full" disabled={busy} onClick={() => void link(false)}>
            Link to the schedule for {dayText(setlist.service_date)}
          </button>
        )}
        {chooser || (
          <button type="button" className="btn w-full" disabled={busy} onClick={() => setChoosing(true)}>
            Link to another service or event…
          </button>
        )}
        <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void link(true)}>
          Start the team for this service
        </button>
      </div>
    );
  }

  const time = shortTime(team.starts_at);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{team.title}</span>
          <span className="text-muted">
            {" "}
            · {dayText(team.starts_on)}
            {time && ` · ${timeText(time)}`}
          </span>
        </p>
        <span className="flex flex-none gap-1.5">
          <button type="button" className="btn btn-quiet px-2 text-xs" disabled={busy} onClick={() => setChoosing((v) => !v)}>
            Change
          </button>
          <button type="button" className="btn btn-quiet px-2 text-xs" disabled={busy} onClick={() => void unlink()}>
            Unlink
          </button>
        </span>
      </div>
      {chooser}
      <RoleGrid target={{ eventId: team.id }} columns={api.data.columns} fields={live?.fields ?? team.fields} assignments={live?.assignments ?? team.assignments} people={byId} myPersonId={myPersonId} layout={1} />
      <p className="text-xs text-muted">
        Linked to the schedule: people put on here show there too.{" "}
        <Link href="/schedule" className="underline hover:text-foreground">
          Open the schedule
        </Link>
      </p>
    </div>
  );
}
