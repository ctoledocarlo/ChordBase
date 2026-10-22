"use server";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { clientIp, waitMessage } from "@/lib/login-guard";
import { gate, recordFailure, recordSuccess } from "@/lib/login-guard-store";
import { recordPlayWith } from "@/lib/record-play";
import { readRemoteState, remoteAccess, switchOffRemote, type Access, type RemoteState } from "@/lib/remote-access";
import { isOn } from "@/lib/remote-window";
import { REMOTE_TTL_SECONDS, cleanPin, isPin, isUuid, pinGuardKeys, pinsMatch, remoteCookie, signRemote } from "@/lib/remote-token";
import { validSettings } from "@/lib/setlist-settings";
import { MAX_NOTE, NOTE_COLUMNS, type SetlistNote } from "@/lib/setlist-team";
import { MESSAGE_COLUMNS, type ChatMessage } from "@/lib/setlists";
import type { PresetSettings } from "@/lib/songs";
import { serviceClient, serviceKey } from "@/lib/supabase/service";

/**
 * What a phone remote can do. None of it needs a login: each call first checks the phone's ticket (given for a right
 * PIN) with remoteAccess, and only ever touches the one setlist the ticket is for.
 */

/** The answer when the phone's ticket isn't good (any more): it should ask for the PIN again. */
export type Denied = { denied: true; error: string };
const denied = (refusal: "unavailable" | "denied"): Denied =>
  refusal === "unavailable"
    ? { denied: true, error: "The phone remote isn't set up on this server (it needs the Supabase service role key)." }
    : { denied: true, error: "The remote was switched off or its PIN changed. Enter the new PIN." };

/** The id a browser tab makes up for itself, saved with a change so that tab can ignore its own echo. */
const screenId = (id: string | undefined) => (typeof id === "string" && id.length > 0 ? id.slice(0, 64) : null);

async function withRemote<T>(setlistId: string, run: (access: Access) => Promise<T>): Promise<T | Denied> {
  const found = await remoteAccess(setlistId);
  return "access" in found ? run(found.access) : denied(found.refusal);
}

/** Checks the PIN. A right one gives this phone a ticket (a cookie) that lasts the day. Wrong guesses are limited, cheaply, before anything else. */
export async function joinRemote(setlistId: string, typed: string): Promise<{ ok: true } | { error: string }> {
  if (!isUuid(setlistId)) return { error: "That link isn't right." };
  const db = serviceClient();
  const secret = serviceKey();
  if (!db || !secret) return { error: denied("unavailable").error };
  const pin = cleanPin(typeof typed === "string" ? typed.slice(0, 40) : "");
  if (!isPin(pin)) return { error: "Enter the 6-digit PIN shown on the Media screen." };

  const keys = pinGuardKeys(setlistId, clientIp(await headers()));
  const guard = await gate(keys.all, keys.pair);
  if (guard.blockedFor > 0) return { error: waitMessage(guard.blockedFor) };

  type Row = { remote_pin: string | null; expires_at: string; remote_started_at: string | null; remote_expires_at?: string | null };
  const read = (columns: string) => db.from("setlists").select(columns).eq("id", setlistId).maybeSingle<Row>();
  let { data } = await read("remote_pin, expires_at, remote_started_at, remote_expires_at");
  // The end-time update may not have been run yet; an older remote ends four hours after it started.
  if (!data) ({ data } = await read("remote_pin, expires_at, remote_started_at"));
  const actual = data?.remote_pin;
  // A remote past its four hours is switched off here too, and looks the same as a wrong PIN.
  if (actual && data && !isOn(data, Date.now())) await switchOffRemote(db, setlistId);
  if (!actual || !data || Date.parse(data.expires_at) <= Date.now() || !isOn(data, Date.now()) || !pinsMatch(pin, actual)) {
    const lockedFor = await recordFailure(keys.all);
    return { error: lockedFor > 0 ? waitMessage(lockedFor) : "That PIN isn't right, or the remote has been switched off." };
  }
  if (guard.hadFailures) await recordSuccess(keys.pair);

  (await cookies()).set(remoteCookie(setlistId), signRemote(secret, setlistId, actual, Date.now() + REMOTE_TTL_SECONDS * 1000), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REMOTE_TTL_SECONDS,
  });
  return { ok: true };
}

/** Takes this phone's ticket away. */
export async function leaveRemote(setlistId: string): Promise<void> {
  if (isUuid(setlistId)) (await cookies()).delete(remoteCookie(setlistId));
}

/** The setlist as it is now. The phone asks every few seconds to see what changed. */
export async function getRemoteState(setlistId: string): Promise<{ state: RemoteState } | Denied> {
  return withRemote(setlistId, async (access) => ({ state: await readRemoteState(access) }));
}

type Result = { error?: string };
const failed = (error: string): Result => ({ error });

/** Puts a song on stage (and into the history, once per song per day). */
export async function remoteGoTo(setlistId: string, itemId: string, clientId?: string, localDay?: string): Promise<Result | Denied> {
  if (!isUuid(itemId)) return failed("That song isn't in the setlist.");
  return withRemote(setlistId, async ({ db, setlist }) => {
    const { data: item } = await db.from("setlist_items").select("id").eq("id", itemId).eq("setlist_id", setlist.id).maybeSingle();
    if (!item) return failed("That song isn't in the setlist any more.");
    const { error } = await db.from("setlists").update({ active_item_id: itemId, edited_by: screenId(clientId) }).eq("id", setlist.id);
    if (error) return failed("Couldn't change the song on stage.");
    after(() => recordPlayWith(db, setlist.id, itemId, localDay, setlist.church_id));
    return {};
  });
}

/** Saves the key (and capo, size) of one song in this setlist. */
export async function remoteSaveSettings(setlistId: string, itemId: string, settings: PresetSettings, clientId?: string): Promise<Result | Denied> {
  if (!isUuid(itemId)) return failed("That song isn't in the setlist.");
  if (!validSettings(settings)) return failed("Those settings aren't valid.");
  return withRemote(setlistId, async ({ db, setlist }) => {
    const { data, error } = await db.from("setlist_items").update({ settings, edited_by: screenId(clientId) }).eq("id", itemId).eq("setlist_id", setlist.id).select("id");
    return error || !data?.length ? failed("Couldn't save these settings.") : {};
  });
}

/** Sets when the set should end (every screen counts down to it), or clears it with null. */
export async function remoteSetTimer(setlistId: string, endsAt: string | null, clientId?: string): Promise<Result | Denied> {
  if (endsAt !== null && (typeof endsAt !== "string" || Number.isNaN(Date.parse(endsAt)))) return failed("That time isn't valid.");
  return withRemote(setlistId, async ({ db, setlist }) => {
    const { error } = await db
      .from("setlists")
      .update({ timer_ends_at: endsAt, timer_started_at: endsAt ? new Date().toISOString() : null, edited_by: screenId(clientId) })
      .eq("id", setlist.id);
    return error ? failed("Couldn't set the timer. Please try again.") : {};
  });
}

/** Ticks or unticks a checklist item, noting who did it (the instrument). */
export async function remoteSetTaskDone(setlistId: string, taskId: string, done: boolean, by: string | null, clientId?: string): Promise<Result | Denied> {
  if (!isUuid(taskId)) return failed("That item isn't there any more.");
  return withRemote(setlistId, async ({ db, setlist }) => {
    const { data, error } = await db
      .from("setlist_tasks")
      .update({
        done: !!done,
        done_by: done ? (typeof by === "string" ? by.slice(0, 40) : null) : null,
        done_at: done ? new Date().toISOString() : null,
        edited_by: screenId(clientId),
      })
      .eq("id", taskId)
      .eq("setlist_id", setlist.id)
      .select("id");
    return error || !data?.length ? failed("Couldn't save that. Please try again.") : {};
  });
}

const MAX_MESSAGE = 500;

/** Sends a line to the session chat, from this phone. */
export async function remoteSendMessage(setlistId: string, body: string, clientId: string): Promise<{ message?: ChatMessage; error?: string } | Denied> {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return failed("Type a message first.");
  if (text.length > MAX_MESSAGE) return failed(`Keep it under ${MAX_MESSAGE} characters.`);
  const sender = screenId(clientId);
  if (!sender) return failed("Couldn't send that.");
  return withRemote(setlistId, async ({ db, setlist }) => {
    const { data, error } = await db
      .from("setlist_messages")
      .insert({ church_id: setlist.church_id, setlist_id: setlist.id, sender_role: "stage", sender, body: text })
      .select(MESSAGE_COLUMNS)
      .single<ChatMessage>();
    if (error || !data) {
      console.error("remoteSendMessage failed", error);
      return failed("Couldn't send that. Please try again.");
    }
    return { message: data };
  });
}

/** Saves the note for one song on one instrument's view (an empty note removes it). A phone can write for an instrument, never for "Everyone". */
export async function remoteSaveNote(setlistId: string, itemId: string, viewId: string, body: string): Promise<{ note: SetlistNote | null } | { error: string } | Denied> {
  if (!isUuid(itemId) || !isUuid(viewId)) return { error: "That song isn't in the setlist any more." };
  if (typeof body !== "string" || body.length > MAX_NOTE) return { error: `Keep a note under ${MAX_NOTE} characters.` };
  return withRemote(setlistId, async ({ db, setlist }) => {
    const [{ data: view }, { data: item }] = await Promise.all([
      db.from("setlist_views").select("id").eq("id", viewId).eq("setlist_id", setlist.id).eq("kind", "instrument").maybeSingle(),
      db.from("setlist_items").select("id").eq("id", itemId).eq("setlist_id", setlist.id).maybeSingle(),
    ]);
    if (!view) return { error: "Phones can write notes for an instrument. Pick one first." };
    if (!item) return { error: "That song isn't in the setlist any more." };
    if (body.trim() === "") {
      const { error } = await db.from("setlist_notes").delete().eq("item_id", itemId).eq("view_id", viewId).eq("setlist_id", setlist.id);
      return error ? { error: "Couldn't clear that note." } : { note: null };
    }
    const { data, error } = await db
      .from("setlist_notes")
      .upsert({ church_id: setlist.church_id, setlist_id: setlist.id, item_id: itemId, view_id: viewId, body: body.replace(/\r\n?/g, "\n") }, { onConflict: "item_id,view_id" })
      .select(NOTE_COLUMNS)
      .single<SetlistNote>();
    return error || !data ? { error: "Couldn't save that note." } : { note: data };
  });
}
