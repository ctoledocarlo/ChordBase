import Link from "next/link";
import { Suspense } from "react";
import { DeleteButton } from "@/components/delete-button";
import { NewSetlist } from "@/components/new-setlist";
import { SetlistDateRange } from "@/components/setlist-date-range";
import { SearchForm } from "@/components/search-form";
import { deleteSetlist } from "./actions";
import { formatDay } from "@/lib/setlist-expiry";
import { listSetlists, type SetlistSummary } from "@/lib/setlists";

export default function SetlistsPage({ searchParams }: PageProps<"/setlists">) {
  return (
    <Suspense>
      <Setlists searchParams={searchParams} />
    </Suspense>
  );
}

async function Setlists({ searchParams }: { searchParams: PageProps<"/setlists">["searchParams"] }) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const q = one(params.q).slice(0, 100);
  const from = day(one(params.from));
  const to = day(one(params.to));
  const { upcoming, past } = await listSetlists(q, { from, to });
  const narrowed = q !== "" || from !== "" || to !== "";
  const total = upcoming.length + past.length;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Setlists</h1>
          <p className="mt-1 text-sm text-muted">
            {narrowed ? `${total} matching` : `${total} ${total === 1 ? "setlist" : "setlists"}`}
          </p>
        </div>
        <NewSetlist />
      </div>

      <SearchForm
        action="/setlists"
        q={q}
        keep={[...(from ? [["from", from]] : []), ...(to ? [["to", to]] : [])] as [string, string][]}
        label="Search setlists by name or date"
        placeholder="Search by name or date, like “Oct 17” or “2026-10-17”"
      />
      <SetlistDateRange q={q} from={from} to={to} />

      {total === 0 ? (
        <p className="mt-10 text-muted">{narrowed ? "Nothing matches that. Try a different name or date." : "No setlists yet. Create your first one."}</p>
      ) : (
        <>
          <Group title="Upcoming" rows={upcoming} />
          <Group title="Past" rows={past} />
        </>
      )}
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: SetlistSummary[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-medium text-muted">{title}</h2>
      <ul className="divide-y divide-line border-y border-line">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-1 hover:bg-hover">
            <Link href={`/setlists/${s.id}`} className="flex min-w-0 flex-1 items-baseline gap-4 px-1 py-3.5">
              <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
              <span className="hidden text-sm text-muted sm:inline">{s.service_date ? formatDay(s.service_date) : "No date"}</span>
              <span className="hidden text-xs text-muted md:inline">Expires {formatDay(s.expires_at)}</span>
              <span className="w-20 text-right text-sm text-muted">
                {s.songCount} {s.songCount === 1 ? "song" : "songs"}
              </span>
            </Link>
            <DeleteButton
              compact
              action={deleteSetlist}
              id={s.id}
              title={`Delete “${s.name}”?`}
              message="This setlist will be deleted. The songs in it stay in your library."
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
