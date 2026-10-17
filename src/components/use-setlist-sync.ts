"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/setlists";
import type { createClient } from "@/lib/supabase/client";
import type { ScreenRole } from "./use-screen-role";

export type SyncStatus = "connecting" | "live" | "offline";

/** How often to check in while the live connection is down, in case something was missed. */
const CATCH_UP_EVERY_MS = 45_000;
/** While the connection is up, messages arrive on their own, so checking in is only a safety net. */
const SAFETY_NET_EVERY_MS = 4 * CATCH_UP_EVERY_MS;
/** Wait a moment after a change so a burst of them (like a reorder) is one catch-up. */
const SETTLE_MS = 200;

/** A random id for this browser tab. (crypto.randomUUID needs https, which a laptop on the venue's network may not have.) */
export function newScreenId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type Handlers = {
  /** Fetch the setlist again and bring this screen up to date. */
  catchUp: () => void;
  /** A song was removed from the setlist on another screen (or this one; the handler ignores songs already gone). */
  itemDeleted: (itemId: string) => void;
  /** The setlist itself was deleted. */
  setlistDeleted: () => void;
  /** A chat message arrived (from any screen, including this one; the handler skips ones it already has). */
  message: (message: ChatMessage) => void;
  /** Whether a song id is in this setlist, for noticing edits to the songs themselves. */
  hasSong: (songId: string) => boolean;
};

/**
 * Keeps a setlist in step across screens. Changes saved on another screen (add, remove, reorder,
 * key, capo, chords, the song itself) arrive through Supabase Realtime. Each one makes this screen
 * fetch the setlist again; the screen's own changes are skipped. It also checks in every so often and
 * when the tab comes back or the network returns, so a missed message never leaves a screen out of date.
 */
export function useSetlistSync(setlistId: string, screenId: string, role: ScreenRole, handlers: Handlers) {
  const [status, setStatus] = useState<SyncStatus>("connecting");
  // How many screens of each kind are watching this setlist, this one included.
  const [roles, setRoles] = useState<Partial<Record<ScreenRole, number>>>({ [role]: 1 });
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    let wasLive = false;
    let up = false;
    let ticks = 0;
    let cancelled = false;
    let disconnect: (() => void) | undefined;

    const catchUpSoon = () => {
      clearTimeout(settle);
      settle = setTimeout(() => latest.current.catchUp(), SETTLE_MS);
    };

    type Row = Record<string, unknown> | undefined;

    function connect(supabase: ReturnType<typeof createClient>) {
      const channel = supabase.channel(`setlist:${setlistId}`, { config: { presence: { key: screenId } } });

      // Listens church-wide and picks out this setlist's rows here, since Realtime can't filter deletes.
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "setlist_items" }, (p) => {
          if (p.eventType === "DELETE") {
            const id = (p.old as Row)?.id;
            if (typeof id === "string") latest.current.itemDeleted(id);
            return;
          }
          const row = p.new as Row;
          if (row?.setlist_id !== setlistId || row?.edited_by === screenId) return;
          catchUpSoon();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "setlists" }, (p) => {
          if (p.eventType === "DELETE") {
            if ((p.old as Row)?.id === setlistId) latest.current.setlistDeleted();
            return;
          }
          const row = p.new as Row;
          if (row?.id === setlistId && row?.edited_by !== screenId) catchUpSoon();
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "songs" }, (p) => {
          const id = (p.new as Row)?.id;
          if (typeof id === "string" && latest.current.hasSong(id)) catchUpSoon();
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "setlist_messages" }, (p) => {
          const row = p.new as (Row & ChatMessage) | undefined;
          if (row && row.setlist_id === setlistId) {
            latest.current.message({
              id: row.id,
              sender_role: row.sender_role,
              sender: row.sender,
              body: row.body,
              created_at: row.created_at,
            });
          }
        })
        .on("presence", { event: "sync" }, () => {
          const counts: Partial<Record<ScreenRole, number>> = {};
          for (const metas of Object.values(channel.presenceState<{ role?: ScreenRole }>())) {
            const r = metas[0]?.role;
            if (r) counts[r] = (counts[r] ?? 0) + 1;
          }
          setRoles(counts);
        });

      void supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (data.session) supabase.realtime.setAuth(data.session.access_token);
        channel.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            up = true;
            setStatus("live");
            void channel.track({ role });
            // Anything that changed while we were disconnected.
            if (wasLive) catchUpSoon();
            wasLive = true;
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
            up = false;
            setStatus("offline");
          }
        });
      });

      return () => void supabase.removeChannel(channel);
    }

    // The live connection's code is loaded after the page has appeared, not as part of it.
    void import("@/lib/supabase/client").then(({ createClient: make }) => {
      if (!cancelled) disconnect = connect(make());
    });

    const interval = setInterval(() => {
      ticks++;
      if (document.visibilityState !== "visible") return;
      // With the connection up, check in a quarter as often.
      const every = up ? SAFETY_NET_EVERY_MS / CATCH_UP_EVERY_MS : 1;
      if (ticks % every === 0) latest.current.catchUp();
    }, CATCH_UP_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") catchUpSoon();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", catchUpSoon);

    return () => {
      cancelled = true;
      clearTimeout(settle);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", catchUpSoon);
      disconnect?.();
    };
  }, [setlistId, screenId, role]);

  return { status, roles };
}
