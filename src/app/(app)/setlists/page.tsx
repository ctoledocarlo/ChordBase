import { SearchForm } from "@/components/search-form";

export default function SetlistsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Setlists</h1>
      <p className="mt-1 text-sm text-muted">Coming soon</p>

      <SearchForm action="/setlists" label="Search setlists" placeholder="Search setlists" disabled />

      <p className="mt-10 max-w-xl text-muted">
        Setlists are on the way. You&apos;ll be able to put songs in order for each service, pick a key for each one, and
        share the plan with the band.
      </p>
    </div>
  );
}
