import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** The service role key, which only the server has. The phone remote signs its tickets with it. */
export function serviceKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/**
 * A database client that skips row level security, for the places where nobody is signed in but the app has
 * checked access itself (the phone remote). Server only; it is never sent to the browser. Null without the key.
 * Everything done with it must be limited to the one setlist the visitor proved they may use.
 */
export function serviceClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceKey();
  if (!url || !key) return (client = null);
  return (client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}
