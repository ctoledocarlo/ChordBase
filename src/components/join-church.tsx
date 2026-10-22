"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { applyToChurch, cancelApplication, searchChurches } from "@/app/(app)/members/actions";
import { MAX_NAME, describeMinistries } from "@/lib/ministries";
import type { Application } from "@/lib/members";
import { Logo } from "./logo";
import { MinistryPicker } from "./ministry-picker";

/**
 * What someone sees when they have signed in but belong to no church yet: find a church, say who they are and what
 * they serve in, and apply. The church's own account answers. It covers the whole screen, so nothing of any church is
 * shown behind it (and the database wouldn't give them anything anyway).
 */
export function JoinChurch({ application, signOut }: { application: Application | null; signOut: ReactNode }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[] | null>(null);
  const [church, setChurch] = useState<{ id: string; name: string } | null>(null);
  const [first, setFirst] = useState(application?.first_name ?? "");
  const [last, setLast] = useState(application?.last_name ?? "");
  const [ministries, setMinistries] = useState<string[]>(application?.ministries ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search a moment after typing stops; an older answer never replaces a newer one.
  const latest = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (church || q.length < 2) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      const res = await searchChurches(q);
      if (id !== latest.current) return;
      setResults("churches" in res ? res.churches : []);
      if ("error" in res) setError(res.error);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, church]);

  const searching = !church && query.trim().length >= 2;

  async function apply() {
    if (!church) return;
    setBusy(true);
    setError(null);
    const res = await applyToChurch(church.id, first, last, ministries);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    router.refresh();
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await cancelApplication();
    setBusy(false);
    if ("error" in res) return setError(res.error);
    router.refresh();
  }

  const waiting = application?.status === "pending";

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <Logo size={28} className="text-lg" />
          {signOut}
        </header>

        {waiting && application ? (
          <section className="space-y-4" aria-live="polite">
            <h1 className="text-2xl font-semibold tracking-tight">Waiting for {application.church_name}</h1>
            <p className="text-muted">
              Your application was sent. The church&apos;s account will see it and let you in, and then everything opens up here.
            </p>
            <dl className="space-y-2 rounded-xl border border-line p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Name</dt>
                <dd className="text-right font-medium">
                  {application.first_name} {application.last_name}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Ministry</dt>
                <dd className="text-right font-medium">{describeMinistries(application.ministries)}</dd>
              </div>
            </dl>
            <button type="button" className="btn" onClick={() => void cancel()} disabled={busy}>
              {busy ? "Cancelling…" : "Cancel and apply somewhere else"}
            </button>
          </section>
        ) : (
          <section className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Join your church</h1>
              <p className="mt-2 text-muted">
                This account isn&apos;t part of a church yet. Find your church and apply; its account will be asked to let you in.
              </p>
              {application?.status === "declined" && (
                <p role="status" className="mt-3 rounded-lg border border-line p-3 text-sm">
                  {application.church_name} didn&apos;t accept your last application. You can apply again, to them or to another church.
                </p>
              )}
            </div>

            <div>
              <label className="block">
                <span className="label">Your church</span>
                {church ? (
                  <span className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                    <span className="min-w-0 truncate font-medium">{church.name}</span>
                    <button
                      type="button"
                      className="flex-none text-sm text-muted underline hover:text-foreground"
                      onClick={() => {
                        setChurch(null);
                        setQuery("");
                        setResults(null);
                      }}
                    >
                      Change
                    </button>
                  </span>
                ) : (
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="field"
                    placeholder="Start typing the church's name"
                    autoComplete="off"
                    maxLength={80}
                    autoFocus
                  />
                )}
              </label>
              {searching && results && (
                <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line" aria-label="Churches found">
                  {results.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted">No church with that name. Check the spelling, or ask your church whether it uses ChordBase.</li>
                  ) : (
                    results.map((c) => (
                      <li key={c.id}>
                        <button type="button" className="w-full px-3 py-2.5 text-left hover:bg-hover" onClick={() => setChurch(c)}>
                          {c.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            {church && (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void apply();
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">First name</span>
                    <input value={first} onChange={(e) => setFirst(e.target.value)} className="field" maxLength={MAX_NAME} autoComplete="given-name" required />
                  </label>
                  <label className="block">
                    <span className="label">Last name</span>
                    <input value={last} onChange={(e) => setLast(e.target.value)} className="field" maxLength={MAX_NAME} autoComplete="family-name" required />
                  </label>
                </div>
                <MinistryPicker value={ministries} onChange={setMinistries} disabled={busy} />
                <button type="submit" className="btn btn-primary min-h-11 w-full" disabled={busy || !first.trim() || !last.trim() || ministries.length === 0}>
                  {busy ? "Sending…" : `Apply to ${church.name}`}
                </button>
              </form>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
