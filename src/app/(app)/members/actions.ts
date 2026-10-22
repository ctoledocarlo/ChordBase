"use server";

import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/church";
import { churchNameProblem, tidyChurchName } from "@/lib/account-type";
import { MAX_NAME, cleanMinistries } from "@/lib/ministries";
import { isRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * Joining a church and running its people. Each one asks a database function to do it, and the function checks who
 * is asking (the database is what enforces it, not these checks, which only give a friendlier answer sooner).
 */

const NOT_SIGNED_IN = "Sign in first.";
const NEEDS_UPDATE = "Joining or registering a church needs the latest database update (run migrations 20261101000000 and 20261102000000).";

type Result = { ok: true } | { error: string };

/** What a database function answered: { ok } or { error }, or a failure of the call itself. */
function answer(data: unknown, error: { code?: string; message: string } | null): Result {
  if (error) {
    console.error("membership call failed:", error.message);
    return { error: error.code === "PGRST202" || error.code === "42883" ? NEEDS_UPDATE : "Something went wrong. Please try again." };
  }
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  return r.ok ? { ok: true } : { error: r.error ?? "Something went wrong. Please try again." };
}

const name = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, MAX_NAME) : "");

/** Churches whose name contains the text. */
export async function searchChurches(query: string): Promise<{ churches: { id: string; name: string }[] } | { error: string }> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const q = typeof query === "string" ? query.trim().slice(0, 80) : "";
  if (q.length < 2) return { churches: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_churches", { p_q: q });
  if (error) return { error: error.code === "PGRST202" ? NEEDS_UPDATE : "Couldn't search just now." };
  return { churches: (data as { id: string; name: string }[] | null) ?? [] };
}

/** Applies to join a church, with the name and the ministries the person serves in. */
export async function applyToChurch(churchId: string, first: string, last: string, ministries: string[]): Promise<Result> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const f = name(first);
  const l = name(last);
  const chosen = cleanMinistries(ministries);
  if (!f || !l) return { error: "Enter your first and last name." };
  if (chosen.length === 0) return { error: "Choose at least one ministry." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_to_church", { p_church: churchId, p_first: f, p_last: l, p_ministries: chosen });
  const res = answer(data, error);
  if ("ok" in res) revalidatePath("/", "layout");
  return res;
}

/** Withdraws the waiting application. */
export async function cancelApplication(): Promise<Result> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_application");
  if (error) return answer(null, error);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The church account answers an application. */
export async function decideApplication(id: string, approve: boolean): Promise<Result> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_application", { p_id: id, p_approve: !!approve });
  const res = answer(data, error);
  if ("ok" in res) revalidatePath("/", "layout");
  return res;
}

/** The church account makes someone an admin, or an individual account again. */
export async function setMemberRole(userId: string, role: string): Promise<Result> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  if (!isRole(role)) return { error: "Choose main account, admin or individual account." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_member_role", { p_user: userId, p_role: role });
  const res = answer(data, error);
  if ("ok" in res) revalidatePath("/members");
  return res;
}

/** The church account takes someone out of the church. */
export async function removeMember(userId: string): Promise<Result> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_member", { p_user: userId });
  const res = answer(data, error);
  if ("ok" in res) revalidatePath("/members");
  return res;
}

/** A person changes their own name and ministries. */
export async function updateMyProfile(first: string, last: string, ministries: string[]): Promise<Result> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const f = name(first);
  const l = name(last);
  const chosen = cleanMinistries(ministries);
  if (!f || !l) return { error: "Enter your first and last name." };
  if (chosen.length === 0) return { error: "Choose at least one ministry." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_my_profile", { p_first: f, p_last: l, p_ministries: chosen });
  const res = answer(data, error);
  if ("ok" in res) revalidatePath("/", "layout");
  return res;
}

/** Registers a church. The person who does it becomes its first main account. */
export async function registerChurch(churchName: string): Promise<Result> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const problem = churchNameProblem(typeof churchName === "string" ? churchName : "");
  if (problem) return { error: problem };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_church", { p_name: tidyChurchName(churchName) });
  const res = answer(data, error);
  if ("ok" in res) revalidatePath("/", "layout");
  return res;
}
