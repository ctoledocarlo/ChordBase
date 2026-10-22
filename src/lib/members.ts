import { isRole, type Role } from "./roles";
import { cleanMinistries } from "./ministries";
import { createClient } from "./supabase/server";

/** Reading who belongs to a church and who has applied. The changes themselves are in app/(app)/members/actions.ts. */

export type Application = {
  id: string;
  status: "pending" | "declined" | "approved";
  church_id: string;
  church_name: string;
  first_name: string;
  last_name: string;
  ministries: string[];
  created_at: string;
};

export type Request = { id: string; user_id: string; email: string; first_name: string; last_name: string; ministries: string[]; created_at: string };

export type Member = { user_id: string; email: string; first_name: string; last_name: string; ministries: string[]; role: Role; joined_at: string };

export type Profile = { first_name: string; last_name: string; ministries: string[]; role: Role };

/** The signed-in person's latest application (waiting or declined), or null. */
export async function getMyApplication(): Promise<Application | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_application");
  if (error) {
    console.error("getMyApplication failed:", error.message);
    return null;
  }
  const row = data as Application | null;
  return row ? { ...row, ministries: cleanMinistries(row.ministries) } : null;
}

/** Waiting applications to the signed-in church account's church (empty for anyone else). */
export async function listRequests(): Promise<Request[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("church_requests");
  if (error) {
    console.error("listRequests failed:", error.message);
    return [];
  }
  return ((data as Request[] | null) ?? []).map((r) => ({ ...r, ministries: cleanMinistries(r.ministries) }));
}

/** Everyone in the signed-in church account's church (empty for anyone else). */
export async function listMembers(): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("church_members");
  if (error) {
    console.error("listMembers failed:", error.message);
    return [];
  }
  return ((data as Member[] | null) ?? []).map((m) => ({ ...m, role: isRole(m.role) ? m.role : "member", ministries: cleanMinistries(m.ministries) }));
}

/** How many applications are waiting, for the badge. One small count, not the list. */
export async function countRequests(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("church_applications").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

/** The signed-in person's own details in their church. */
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("church_accounts").select("first_name, last_name, ministries, role").maybeSingle<Profile>();
  if (error || !data) return null;
  return { ...data, role: isRole(data.role) ? data.role : "church", ministries: cleanMinistries(data.ministries) };
}
