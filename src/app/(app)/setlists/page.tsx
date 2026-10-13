import Link from "next/link";
import { Suspense } from "react";
import { NewSetlist } from "@/components/new-setlist";
import { SearchForm } from "@/components/search-form";
import { getCurrentChurch } from "@/lib/church";
import { listSetlists, type SetlistSummary } from "@/lib/setlists";

export default function SetlistsPage({ searchParams }: PageProps<"/setlists">) {
  return (
    <Suspense>
      <Setlists searchParams={searchParams} />
    </Suspense>
  );
}

/** "Sun, Oct 18" — read as a plain date so the time zone can't shift it a day. */
function formatDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function Setlists({ searchParams }: { searchParams: PageProps<"/setlists">["searchParams"] }) {
  const church = await getCurrentChurch();
  if (!church) return null;

  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const { upcoming, past } = await listSetlists(q);
  const total = upcoming.length + past.length;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Setlists</h1>
          <p className="mt-1 text-sm text-muted">
            {q ? `${total} matching “${q}”` : `${total} ${total === 1 ? "setlist" : "setlists"}`}
          </p>
        </div>
        <NewSetlist />
      </div>

      <SearchForm action="/setlists" q={q} label="Search setlists" placeholder="Search setlists" />

      {total === 0 ? (
        <p className="mt-10 text-muted">{q ? "Nothing matches that search." : "No setlists yet. Create your first one."}</p>
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
          <li key={s.id}>
            <Link href={`/setlists/${s.id}`} className="flex items-baseline gap-4 px-1 py-3.5 hover:bg-hover">
              <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
              <span className="hidden text-sm text-muted sm:inline">{s.service_date ? formatDate(s.service_date) : "No date"}</span>
              <span className="w-20 text-right text-sm text-muted">
                {s.songCount} {s.songCount === 1 ? "song" : "songs"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
