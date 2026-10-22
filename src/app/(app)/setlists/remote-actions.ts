"use server";

import { isSignedIn } from "@/lib/church";
import { newPin } from "@/lib/remote-token";
import { createClient } from "@/lib/supabase/server";

/** Switching the phone remote on and off, from the Media screen. (The remote itself is in src/app/r.) */

const NOT_SIGNED_IN = "You're not signed in to a church.";
const NEEDS_UPDATE = "The phone remote needs the latest database update (run migration 20261029000000_remote_and_versions.sql).";

type PinResult = { pin: string | null; error?: string };

const failure = (code: string | undefined, fallback: string): PinResult => ({
  pin: null,
  error: code === "42703" || code === "PGRST204" ? NEEDS_UPDATE : fallback,
});

/** The PIN the remote is on with, or null when it is off. */
export async function getRemotePin(setlistId: string): Promise<PinResult> {
  if (!(await isSignedIn())) return { pin: null, error: NOT_SIGNED_IN };
  const supabase = await createClient();
  const { data, error } = await supabase.from("setlists").select("remote_pin").eq("id", setlistId).maybeSingle<{ remote_pin: string | null }>();
  if (error) return failure(error.code, "Couldn't check the remote.");
  return { pin: data?.remote_pin ?? null };
}

/**
 * Switches the remote on and returns its PIN. With `renew`, a new PIN replaces the old one, which sends every phone
 * that joined back to the PIN screen.
 */
export async function startRemote(setlistId: string, renew = false): Promise<PinResult> {
  if (!(await isSignedIn())) return { pin: null, error: NOT_SIGNED_IN };
  const supabase = await createClient();
  if (!renew) {
    const current = await getRemotePin(setlistId);
    if (current.error || current.pin) return current;
  }
  const pin = newPin();
  const { data, error } = await supabase
    .from("setlists")
    .update({ remote_pin: pin, remote_started_at: new Date().toISOString() })
    .eq("id", setlistId)
    .select("remote_pin")
    .maybeSingle<{ remote_pin: string | null }>();
  if (error) return failure(error.code, "Couldn't start the remote. Please try again.");
  if (!data) return { pin: null, error: "That setlist no longer exists." };
  return { pin: data.remote_pin };
}

/** Switches the remote off: every phone is turned away on its next request. */
export async function stopRemote(setlistId: string): Promise<{ error?: string }> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const supabase = await createClient();
  const { error } = await supabase.from("setlists").update({ remote_pin: null, remote_started_at: null }).eq("id", setlistId);
  return error ? { error: failure(error.code, "Couldn't stop the remote. Please try again.").error } : {};
}
