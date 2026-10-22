"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decideApplication, removeMember, setMemberRole } from "@/app/(app)/members/actions";
import { describeMinistries, fullName } from "@/lib/ministries";
import type { Member, Request } from "@/lib/members";
import { ROLE_LABELS, canRemove, rolesYouCanGive, type Role } from "@/lib/roles";
import { EmptyState } from "./empty-state";
import { useToast } from "./toast";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function RoleBadge({ role }: { role: Role }) {
  const tone = role === "church" ? "border-accent text-accent" : role === "admin" ? "border-foreground text-foreground" : "border-line text-muted";
  return <span className={`flex-none rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide ${tone}`}>{ROLE_LABELS[role]}</span>;
}

/**
 * The church account's page for its people: who has asked to join (approve or decline), and everyone who belongs, with
 * the power to make someone an admin, make an admin an individual account again, or remove them. Church, then admins,
 * then individual accounts.
 */
export function MembersView({ members, requests, actor }: { members: Member[]; requests: Request[]; actor: Role }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function run(key: string, change: Promise<{ ok: true } | { error: string }>, done: string) {
    setBusy(key);
    const res = await change;
    setBusy(null);
    if ("error" in res) return toast(res.error, { tone: "error" });
    setRemoving(null);
    toast(done, { tone: "success" });
    router.refresh();
  }

  const groups: { role: Role; title: string }[] = [
    { role: "church", title: "Church" },
    { role: "admin", title: "Admins" },
    { role: "member", title: "Individual accounts" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
      <p className="mt-1 text-sm text-muted">
        Church (this account), then admins, then individual accounts. What each can do will grow over time; for now only the church account approves requests and manages people.
      </p>

      <section className="mt-6" aria-labelledby="requests-title">
        <h2 id="requests-title" className="text-sm font-medium">
          Requests to join {requests.length > 0 && <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-white">{requests.length}</span>}
        </h2>
        {requests.length === 0 ? (
          <p className="mt-2 rounded-xl border border-line p-4 text-sm text-muted">No one is waiting. When someone applies to your church, they appear here.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{fullName(r.first_name, r.last_name)}</p>
                    <p className="truncate text-sm text-muted">{r.email}</p>
                    <p className="mt-1 text-sm">{describeMinistries(r.ministries)}</p>
                    <p className="mt-1 text-xs text-muted">
                      Applied <time suppressHydrationWarning dateTime={r.created_at}>{day(r.created_at)}</time>
                    </p>
                  </div>
                  <div className="flex flex-none gap-2">
                    <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void run(r.id, decideApplication(r.id, true), `${fullName(r.first_name, r.last_name)} joined.`)}>
                      {busy === r.id ? "…" : "Approve"}
                    </button>
                    <button type="button" className="btn" disabled={busy !== null} onClick={() => void run(r.id, decideApplication(r.id, false), "Request declined.")}>
                      Decline
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 space-y-6" aria-label="People">
        {members.length === 0 && <EmptyState art="songs" title="No one here yet" />}
        {groups.map(({ role, title }) => {
          const list = members.filter((m) => m.role === role);
          if (list.length === 0) return null;
          return (
            <div key={role}>
              <h2 className="mb-2 text-sm font-medium">
                {title} <span className="font-normal text-muted">{list.length}</span>
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {list.map((m) => {
                  const name = fullName(m.first_name, m.last_name);
                  const give = rolesYouCanGive(actor, m.role);
                  return (
                    <li key={m.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{name || m.email}</span>
                          <RoleBadge role={m.role} />
                        </p>
                        {name && <p className="truncate text-sm text-muted">{m.email}</p>}
                        <p className="text-sm">{describeMinistries(m.ministries) || <span className="text-muted">No ministry chosen yet</span>}</p>
                      </div>
                      {(give.length > 0 || canRemove(actor, m.role)) &&
                        (removing === m.user_id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-muted">Remove {name || m.email}? They lose access right away.</span>
                            <button type="button" className="btn border-[#dc2626] bg-[#dc2626] text-white hover:!bg-[#b91c1c]" disabled={busy !== null} onClick={() => void run(m.user_id, removeMember(m.user_id), "Removed from the church.")}>
                              {busy === m.user_id ? "…" : "Yes, remove"}
                            </button>
                            <button type="button" className="btn" onClick={() => setRemoving(null)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-none flex-wrap gap-2">
                            {give.map((r) => (
                              <button
                                key={r}
                                type="button"
                                className="btn"
                                disabled={busy !== null}
                                onClick={() => void run(m.user_id, setMemberRole(m.user_id, r), r === "admin" ? "Now an admin." : "Now an individual account.")}
                              >
                                {r === "admin" ? "Make admin" : "Make individual account"}
                              </button>
                            ))}
                            {canRemove(actor, m.role) && (
                              <button type="button" className="btn btn-quiet hover:!text-[#dc2626]" disabled={busy !== null} onClick={() => setRemoving(m.user_id)}>
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
