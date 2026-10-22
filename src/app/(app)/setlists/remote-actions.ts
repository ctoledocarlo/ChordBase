"use server";

import { isSignedIn } from "@/lib/church";
import { newPin } from "@/lib/remote-token";
import { REMOTE_EXTEND_WINDOW_MS, canExtend, endOf, extendedEnd, isOn, leftMs, remoteEnd } from "@/lib/remote-window";
import { createClient } from "@/lib/supabase/server";

/** Switching the phone remote on and off, and adding an hour, from the Media screen. (The remote itself is in src/app/r.) */

const NOT_SIGNED_IN = "You're not signed in to a church.";
const NEEDS_UPDATE = "The phone remote needs the latest database update (run migrations 20261029000000 and 20261030000000).";

/** The PIN the remote is on with (null when it is off) and when it switches itself off. */
export type RemoteStatus = { pin: string | null; endsAt: string | null; error?: string };

const failure = (code: string | undefined, fallback: string): RemoteStatus => ({
  pin: null,
  endsAt: null,
  error: code === "42703" || code === "PGRST204" ? NEEDS_UPDATE : fallback,
});

type Row = { remote_pin: string | null; remote_started_at: string | null; remote_expires_at: string | null };
const COLUMNS = "remote_pin, remote_started_at, remote_expires_at";

/** Reads the remote's state. A remote past its time is switched off here, so the page never shows a dead PIN. */
async function read(setlistId: string): Promise<RemoteStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("setlists").select(COLUMNS).eq("id", setlistId).maybeSingle<Row>();
  if (error) return failure(error.code, "Couldn't check the remote.");
  if (!data?.remote_pin) return { pin: null, endsAt: null };
  if (!isOn(data, Date.now())) {
    await supabase.from("setlists").update({ remote_pin: null, remote_started_at: null, remote_expires_at: null }).eq("id", setlistId);
    return { pin: null, endsAt: null };
  }
  return { pin: data.remote_pin, endsAt: endOf(data) };
}

export async function getRemoteStatus(setlistId: string): Promise<RemoteStatus> {
  if (!(await isSignedIn())) return { pin: null, endsAt: null, error: NOT_SIGNED_IN };
  return read(setlistId);
}

/**
 * Switches the remote on for four hours and returns its PIN. With `renew`, a new PIN replaces the old one (every phone
 * that joined has to enter it) and the time left stays as it was, so a PIN can't be renewed forever.
 */
export async function startRemote(setlistId: string, renew = false): Promise<RemoteStatus> {
  if (!(await isSignedIn())) return { pin: null, endsAt: null, error: NOT_SIGNED_IN };
  const current = await read(setlistId);
  if (current.error) return current;
  if (current.pin && !renew) return current;

  const supabase = await createClient();
  const now = Date.now();
  const endsAt = current.pin && current.endsAt ? current.endsAt : remoteEnd(now);
  const { data, error } = await supabase
    .from("setlists")
    .update({ remote_pin: newPin(), remote_started_at: new Date(now).toISOString(), remote_expires_at: endsAt })
    .eq("id", setlistId)
    .select(COLUMNS)
    .maybeSingle<Row>();
  if (error) return failure(error.code, "Couldn't start the remote. Please try again.");
  if (!data) return { pin: null, endsAt: null, error: "That setlist no longer exists." };
  return { pin: data.remote_pin, endsAt: endOf(data) };
}

/** Adds an hour, offered when half an hour or less is left. */
export async function extendRemote(setlistId: string): Promise<RemoteStatus> {
  if (!(await isSignedIn())) return { pin: null, endsAt: null, error: NOT_SIGNED_IN };
  const current = await read(setlistId);
  if (current.error) return current;
  if (!current.pin || !current.endsAt) return { pin: null, endsAt: null, error: "The remote is off. Start it again." };
  if (!canExtend(leftMs(current.endsAt, Date.now()))) {
    return { ...current, error: `An hour can be added when ${REMOTE_EXTEND_WINDOW_MS / 60_000} minutes or less are left.` };
  }

  const supabase = await createClient();
  const next = extendedEnd(current.endsAt);
  // Only if nobody else has just done it (two Media screens pressing at once add one hour, not two).
  const { data, error } = await supabase
    .from("setlists")
    .update({ remote_expires_at: next })
    .eq("id", setlistId)
    .eq("remote_pin", current.pin)
    .or(`remote_expires_at.eq.${current.endsAt},remote_expires_at.is.null`)
    .select(COLUMNS)
    .maybeSingle<Row>();
  if (error) return failure(error.code, "Couldn't add an hour. Please try again.");
  if (!data) return read(setlistId);
  return { pin: data.remote_pin, endsAt: endOf(data) };
}

/** Switches the remote off: every phone is turned away on its next request. */
export async function stopRemote(setlistId: string): Promise<{ error?: string }> {
  if (!(await isSignedIn())) return { error: NOT_SIGNED_IN };
  const supabase = await createClient();
  const { error } = await supabase.from("setlists").update({ remote_pin: null, remote_started_at: null, remote_expires_at: null }).eq("id", setlistId);
  return error ? { error: failure(error.code, "Couldn't stop the remote. Please try again.").error } : {};
}
