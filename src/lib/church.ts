import { cache } from "react";
import { isRole, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type Church = { id: string; name: string; slug: string; /** What the signed-in login is in this church. */ role: Role };

/**
 * Which church the signed-in login belongs to, and whether finding out failed. `church` is null when signed out or
 * when the login isn't in a church; `failed` tells that apart from the database not answering, so a hiccup is never
 * mistaken for "not in a church". Reads the request cookies, so call it inside <Suspense>.
 */
export const getMembership = cache(async (): Promise<{ church: Church | null; failed: boolean }> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { church: null, failed: false };

  type Row = { role?: string; church: Omit<Church, "role"> | null };
  let { data, error } = await supabase.from("church_accounts").select("role, church:churches(id, name, slug)").maybeSingle<Row>();
  // 42703 is "no such column": the membership update hasn't been run, and every login that exists is its church's own.
  if (error?.code === "42703") ({ data, error } = await supabase.from("church_accounts").select("church:churches(id, name, slug)").maybeSingle<Row>());
  if (error) return { church: null, failed: true };

  return { church: data?.church ? { ...data.church, role: isRole(data.role) ? data.role : "church" } : null, failed: false };
});

/**
 * The church the signed-in login belongs to, or null if signed out or the
 * login isn't linked to a church. RLS guarantees only their own church is
 * visible. Reads the request cookies, so call it inside <Suspense>.
 */
export const getCurrentChurch = cache(async (): Promise<Church | null> => (await getMembership()).church);

/**
 * Whether anyone is signed in. The session token is checked here, on the server, without asking the
 * database anything, so it costs almost nothing. Use it where row level security already limits what
 * can be read or changed to the login's own church and the church itself isn't needed (updating or
 * deleting something by id); use getCurrentChurch when the church is needed.
 */
export const isSignedIn = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return Boolean(claims?.claims);
});

/** The signed-in login's id, from the session token (no database lookup), or null. */
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
});
