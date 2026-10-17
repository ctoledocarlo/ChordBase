import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Church = { id: string; name: string; slug: string };

/**
 * The church the signed-in login belongs to, or null if signed out or the
 * login isn't linked to a church. RLS guarantees only their own church is
 * visible. Reads the request cookies, so call it inside <Suspense>.
 */
export const getCurrentChurch = cache(async (): Promise<Church | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return null;

  const { data } = await supabase
    .from("church_accounts")
    .select("church:churches(id, name, slug)")
    .maybeSingle<{ church: Church | null }>();

  return data?.church ?? null;
});

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
