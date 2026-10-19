import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FailureCounter, LockMemory, type GuardKey } from "./login-guard";

/**
 * The shared half of login protection: failure counters in the database, reached with the service role key
 * (server only; it is never sent to the browser). Without the key, protection falls back to what this one
 * server instance remembers, and a warning is logged once.
 */

type Locked = { key: string; seconds: number };

const memory = new LockMemory();
const counter = new FailureCounter();
let client: SupabaseClient | null | undefined;
let warned = false;

function service(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!warned) {
      warned = true;
      console.warn("SUPABASE_SERVICE_ROLE_KEY isn't set: login attempts are only limited per server instance.");
    }
    return (client = null);
  }
  return (client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

export type Gate = { blockedFor: number; hadFailures: boolean };

/**
 * Is this attempt allowed to reach the password check? Asked in order of cost: this instance's memory first
 * (no I/O), then one database call. A database problem never locks people out; it just lets the attempt through.
 */
export async function gate(keys: GuardKey[], pair: GuardKey): Promise<Gate> {
  const ids = keys.map((k) => k.key);
  const remembered = memory.secondsLeft(ids, Date.now());
  if (remembered > 0) return { blockedFor: remembered, hadFailures: true };

  const db = service();
  if (!db) return { blockedFor: 0, hadFailures: false };
  const { data, error } = await db.rpc("login_gate", { p_keys: ids, p_pair: pair.key });
  if (error || !data) {
    if (error) console.error("login_gate failed", error.message);
    return { blockedFor: 0, hadFailures: false };
  }
  const locked = (data.locked ?? []) as Locked[];
  memory.remember(locked, Date.now());
  return { blockedFor: Math.max(0, ...locked.map((l) => l.seconds)), hadFailures: Boolean(data.had_fails) };
}

/** Counts a wrong password against every key. Returns how long the attempt's keys are now locked for, if at all. */
export async function recordFailure(keys: GuardKey[]): Promise<number> {
  const db = service();
  if (!db) {
    // Without the database this instance still counts, for what it alone sees.
    const locked = counter.record(keys, Date.now());
    memory.remember(locked, Date.now());
    return Math.max(0, ...locked.map((l) => l.seconds));
  }
  const { data, error } = await db.rpc("login_failed", { p_keys: keys.map((k) => k.key), p_limits: keys.map((k) => k.limit) });
  if (error || !data) {
    if (error) console.error("login_failed failed", error.message);
    return 0;
  }
  const locked = (data.locked ?? []) as Locked[];
  memory.remember(locked, Date.now());
  return Math.max(0, ...locked.map((l) => l.seconds));
}

/** A good login: forget the failures for this email from this address. */
export async function recordSuccess(pair: GuardKey): Promise<void> {
  const db = service();
  if (!db) {
    counter.clear(pair.key);
    return;
  }
  const { error } = await db.rpc("login_ok", { p_pair: pair.key });
  if (error) console.error("login_ok failed", error.message);
}
