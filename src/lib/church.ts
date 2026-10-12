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
