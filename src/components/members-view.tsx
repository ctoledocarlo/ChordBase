"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decideApplication, removeMember, setMemberRole } from "@/app/(app)/members/actions";
import { describeMinistries, fullName } from "@/lib/ministries";
import type { Member, Request } from "@/lib/members";
import { personName, type Person } from "@/lib/schedule";
import { MAX_MAIN_ACCOUNTS, ROLE_LABELS, canRemove, rolesYouCanGive, type Role } from "@/lib/roles";
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
export function MembersView({ members: initialMembers, requests: initialRequests, actor, unlinked = [] }: { members: Member[]; requests: Request[]; actor: Role; /** People on the schedule who have no account yet. */ unlinked?: Person[] }) {
  const router = useRouter();
  const toast = useToast();
  // What is shown changes at once; the server is asked in the background, and the page looks again when that is done.
  const [state, setState] = useState({ members: initialMembers, requests: initialRequests });
  const [seen, setSeen] = useState({ members: initialMembers, requests: initialRequests });
  const [saving, setSaving] = useState(0);
  if (initialMembers !== seen.members || initialRequests !== seen.requests) {
    setSeen({ members: initialMembers, requests: initialRequests });
    if (saving === 0) setState({ members: initialMembers, requests: initialRequests });
  }
  const { members, requests } = state;
  const [removing, setRemoving] = useState<string | null>(null);
  // For each request: the person on the schedule it is linked to ("" = a new person). Starts at the one with the same name.
  const [linked, setLinked] = useState<Record<string, string>>({});
  const suggested = (r: Request) => unlinked.find((p) => personName(p).toLowerCase() === fullName(r.first_name, r.last_name).toLowerCase())?.id ?? "";
  const chosen = (r: Request) => linked[r.id] ?? suggested(r);

  function act(apply: (s: typeof state) => typeof state, change: () => Promise<{ ok: true } | { error: string }>, done: string) {
    setState(apply);
    setRemoving(null);
    setSaving((n) => n + 1);
    void change()
      .catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }))
      .then((res) => toast("error" in res ? res.error : done, { tone: "error" in res ? "error" : "success" }))
      .finally(() => {
        setSaving((n) => n - 1);
        router.refresh();
      });
  }

  const mains = members.filter((m) => m.role === "church").length;
  const giveLabel: Record<Role, string> = { church: "Make main account", admin: "Make admin", member: "Make individual account" };
  const givenLabel: Record<Role, string> = { church: "Now a main account.", admin: "Now an admin.", member: "Now an individual account." };

  const groups: { role: Role; title: string }[] = [
    { role: "church", title: `Church (main) · ${mains} of ${MAX_MAIN_ACCOUNTS}` },
    { role: "admin", title: `Admins · ${members.filter((m) => m.role === "admin").length}` },
    { role: "member", title: `Individual accounts · ${members.filter((m) => m.role === "member").length}` },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
      <p className="mt-1 text-sm text-muted">
        Church (main), then admins, then individual accounts. A church has up to 2 main accounts. What each role can do will grow over time; for now only main accounts approve requests and manage people.
      </p>

      <section data-tour="team-requests" className="mt-6" aria-labelledby="requests-title">
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
                    <button type="button" className="btn btn-primary" onClick={() =>
                        act(
                          (st) => ({
                            requests: st.requests.filter((x) => x.id !== r.id),
                            members: [...st.members, { user_id: r.user_id, email: r.email, first_name: r.first_name, last_name: r.last_name, ministries: r.ministries, role: "member", joined_at: new Date().toISOString() }],
                          }),
                          () => decideApplication(r.id, true, chosen(r) || null),
                          `${fullName(r.first_name, r.last_name)} joined.`,
                        )
                      }
                    >
                      Approve
                    </button>
                    <button type="button" className="btn" onClick={() => act((st) => ({ ...st, requests: st.requests.filter((x) => x.id !== r.id) }), () => decideApplication(r.id, false), "Request declined.")}>
                      Decline
                    </button>
                  </div>
                </div>
                {unlinked.length > 0 && (
                  <label className="mt-3 block border-t border-line pt-3 text-sm">
                    <span className="text-muted">Is this person already on your schedule?</span>
                    <select className="field field-sm mt-1" value={chosen(r)} onChange={(e) => setLinked((l) => ({ ...l, [r.id]: e.target.value }))} aria-label={`Link ${fullName(r.first_name, r.last_name)} to a person already on the schedule`}>
                      <option value="">No, they are new</option>
                      {unlinked.map((p) => (
                        <option key={p.id} value={p.id}>
                          Yes, they are {personName(p)}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-muted">Linking keeps everything they were put on the schedule for.</span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-tour="team-people" className="mt-8 space-y-6" aria-label="People">
        {members.length === 0 && <EmptyState art="songs" title="No one here yet" />}
        {groups.map(({ role, title }) => {
          const list = members.filter((m) => m.role === role);
          if (list.length === 0) return null;
          return (
            <div key={role}>
              <h2 className="mb-2 text-sm font-medium">
                {title}
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {list.map((m) => {
                  const name = fullName(m.first_name, m.last_name);
                  const give = rolesYouCanGive(actor, m.role, mains);
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
                            <button type="button" className="btn border-[#dc2626] bg-[#dc2626] text-white hover:!bg-[#b91c1c]" onClick={() => act((st) => ({ ...st, members: st.members.filter((x) => x.user_id !== m.user_id) }), () => removeMember(m.user_id), "Removed from the church.")}>
                              Yes, remove
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
                                onClick={() => act((st) => ({ ...st, members: st.members.map((x) => (x.user_id === m.user_id ? { ...x, role: r } : x)) }), () => setMemberRole(m.user_id, r), givenLabel[r])}
                              >
                                {giveLabel[r]}
                              </button>
                            ))}
                            {canRemove(actor, m.role) && (
                              <button type="button" className="btn btn-quiet hover:!text-[#dc2626]" onClick={() => setRemoving(m.user_id)}>
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
