/** Grey placeholders in the shape of what is loading, so a page doesn't jump when it arrives. */
function Bar({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-line/70 ${className}`} />;
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** A list of rows like the song and setlist lists. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul aria-hidden className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-4 py-3">
          <Bar className="h-10 w-12 flex-none" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bar className="h-3.5 w-1/2" />
            <Bar className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A page with a title, a search box and a list (Songs and Setlists). */
export function ListPageSkeleton() {
  return (
    <Status>
      <div className="mx-auto w-full max-w-4xl">
        <Bar className="h-7 w-32" />
        <Bar className="mt-2 h-4 w-24" />
        <Bar className="mt-5 h-10 w-full" />
        <ListSkeleton />
      </div>
    </Status>
  );
}

/** A song or setlist: a title and the columns of words. */
export function SongSkeleton() {
  return (
    <Status>
      <Bar className="h-8 w-64 max-w-full" />
      <Bar className="mt-2 h-4 w-40" />
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, c) => (
          <div key={c} className="space-y-3">
            <Bar className="h-4 w-20" />
            {Array.from({ length: 8 }, (_, i) => (
              <Bar key={i} className={`h-3.5 ${i % 3 === 0 ? "w-4/5" : i % 3 === 1 ? "w-full" : "w-2/3"}`} />
            ))}
          </div>
        ))}
      </div>
    </Status>
  );
}
