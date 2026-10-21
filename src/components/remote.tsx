"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSetlistState, saveItemSettings, sendMessage, setActiveItem } from "@/app/(app)/setlists/actions";
import { setServiceTimer } from "@/app/(app)/setlists/team-actions";
import { deriveSong } from "@/lib/setlist-derive";
import { taskProgress, type TeamExtras } from "@/lib/setlist-team";
import { mergeRemote } from "@/lib/setlist-sync";
import type { ChatMessage, Setlist, SetlistItem } from "@/lib/setlists";
import { Modal } from "./modal";
import { ServiceClock } from "./service-clock";
import { SetlistChat } from "./setlist-chat";
import { Checklist } from "./team-checklist";
import { useToast } from "./toast";
import { newScreenId, useSetlistSync } from "./use-setlist-sync";
import { useTeam } from "./use-team";

const SAVE_DELAY_MS = 400;

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A controller for a phone: big Previous and Next buttons for the song on stage, a tap on any song to send it
 * there, the key of the song on stage, the service clock, the checklist and the chat. It takes over the screen
 * and keeps the phone awake while it is open. Changes go to every other screen straight away.
 */
export function Remote({
  setlist,
  initialItems,
  initialMessages,
  initialExtras,
}: {
  setlist: Setlist;
  initialItems: SetlistItem[];
  initialMessages: ChatMessage[];
  initialExtras: TeamExtras;
}) {
  const router = useRouter();
  const toast = useToast();
  const [screenId] = useState(newScreenId);
  const team = useTeam(setlist.id, screenId, initialExtras);
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState(setlist.active_item_id);
  const [messages, setMessages] = useState(initialMessages);
  const [timerEndsAt, setTimerEndsAt] = useState(setlist.timer_ends_at);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  const stageId = activeId && items.some((i) => i.id === activeId) ? activeId : (items[0]?.id ?? null);
  const stageIndex = items.findIndex((i) => i.id === stageId);
  const onStage = stageIndex >= 0 ? items[stageIndex] : null;
  const next = stageIndex >= 0 ? items[stageIndex + 1] : undefined;

  // Keep the phone awake while the remote is open.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const sentinel = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen");
        if (sentinel && !cancelled) lock = sentinel;
        else void sentinel?.release();
      } catch {
        // Not allowed here (or unsupported); the phone may dim as usual.
      }
    };
    void acquire();
    const again = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", again);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", again);
      void lock?.release();
    };
  }, []);

  async function goTo(id: string) {
    setActiveId(id);
    const res = await setActiveItem(setlist.id, id, screenId, localDay());
    if (res.error) toast(res.error, { tone: "error" });
  }

  // The key of the song on stage, saved a moment after the last tap.
  const keyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function stepKey(delta: number) {
    if (!onStage) return;
    const settings = { ...onStage.settings, semitones: (onStage.settings.semitones + delta + 12) % 12 };
    setItems((list) => list.map((i) => (i.id === onStage.id ? { ...i, settings } : i)));
    clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(async () => {
      const res = await saveItemSettings(onStage.id, settings, screenId);
      if (res.error) toast(res.error, { tone: "error" });
    }, SAVE_DELAY_MS);
  }
  useEffect(() => () => clearTimeout(keyTimer.current), []);

  async function changeTimer(endsAt: string | null) {
    setTimerEndsAt(endsAt);
    const res = await setServiceTimer(setlist.id, endsAt, screenId);
    if (res.error) toast(res.error, { tone: "error" });
  }

  function addMessages(incoming: ChatMessage[]) {
    setMessages((list) => {
      const have = new Set(list.map((m) => m.id));
      const fresh = incoming.filter((m) => !have.has(m.id));
      return fresh.length === 0 ? list : [...list, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-200);
    });
  }

  async function catchUp() {
    const state = await getSetlistState(setlist.id);
    if (!state) return;
    addMessages(state.messages);
    team.apply(state.extras);
    setTimerEndsAt(state.setlist.timer_ends_at);
    setActiveId(state.setlist.active_item_id);
    setItems((local) => {
      const merged = mergeRemote(local, state.items, { pendingIds: new Set(), editingId: null });
      return merged.items;
    });
  }

  const sync = useSetlistSync(setlist.id, screenId, "media", {
    catchUp: () => void catchUp(),
    itemDeleted: (id) => setItems((list) => list.filter((i) => i.id !== id)),
    setlistDeleted: () => router.replace("/setlists"),
    message: (m) => addMessages([m]),
    hasSong: (songId) => itemsRef.current.some((i) => i.song_id === songId),
  });

  const progress = taskProgress(team.tasks);
  const keyName = onStage ? deriveSong(onStage.song.original_key, onStage.settings).keyLabel : "";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 p-4">
        <header className="flex items-center gap-3">
          <Link href={`/setlists/${setlist.id}`} className="btn flex-none">
            ← Setlist
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{setlist.name}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className={`h-2 w-2 rounded-full ${sync.status === "live" ? "bg-[#16a34a]" : sync.status === "offline" ? "bg-[#d97706]" : "bg-line"}`} />
              {sync.status === "live" ? "Live" : sync.status === "offline" ? "Reconnecting…" : "Connecting…"}
            </p>
          </div>
          <ServiceClock endsAt={timerEndsAt} canSet onSet={(t) => void changeTimer(t)} large />
        </header>

        <section data-tour="remote-stage" aria-label="On stage" className="rounded-2xl border border-line p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">On stage</p>
          {onStage ? (
            <>
              <p className="mt-1 text-2xl font-semibold leading-tight">{onStage.song.title}</p>
              <p className="mt-1 font-mono text-sm text-muted">{keyName}</p>
              {next && (
                <p className="mt-3 border-t border-line pt-3 text-sm">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">Up next </span>
                  {next.song.title}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-muted">Nothing in the setlist yet.</p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn min-h-16 text-lg" disabled={stageIndex <= 0} onClick={() => void goTo(items[stageIndex - 1].id)}>
            ← Previous
          </button>
          <button type="button" className="btn btn-primary min-h-16 text-lg" disabled={!next} onClick={() => next && void goTo(next.id)}>
            Next →
          </button>
        </div>

        {onStage && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
            <span className="text-sm text-muted">Key of the song on stage</span>
            <span className="flex items-center gap-2">
              <button type="button" className="btn btn-icon h-10 w-10 text-lg" onClick={() => stepKey(-1)} aria-label="Down a half step">
                −
              </button>
              <span className="w-12 text-center font-mono font-semibold">{deriveSong(onStage.song.original_key, onStage.settings).soundingKey || onStage.settings.semitones}</span>
              <button type="button" className="btn btn-icon h-10 w-10 text-lg" onClick={() => stepKey(1)} aria-label="Up a half step">
                +
              </button>
            </span>
          </div>
        )}

        <section aria-label="The setlist">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Setlist · {items.length} {items.length === 1 ? "song" : "songs"}. Tap one to send it to stage.
          </p>
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {items.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void goTo(item.id)}
                  aria-current={item.id === stageId ? "true" : undefined}
                  className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left ${item.id === stageId ? "bg-hover font-medium" : "hover:bg-hover"}`}
                >
                  <span className="w-5 flex-none text-right text-sm text-muted tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{item.song.title}</span>
                  {item.id === stageId && <span className="flex-none text-xs font-medium text-accent">On stage</span>}
                  <span className="flex-none font-mono text-xs text-muted">{deriveSong(item.song.original_key, item.settings).soundingKey}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn" onClick={() => setChecklistOpen(true)}>
            Checklist{progress.total > 0 ? ` ${progress.done}/${progress.total}` : ""}
          </button>
          <button type="button" className="btn" onClick={() => setChatOpen((o) => !o)} aria-expanded={chatOpen}>
            {chatOpen ? "Hide chat" : "Chat"}
          </button>
        </div>

        {chatOpen && (
          <div className="h-72">
            <SetlistChat
              messages={messages}
              role="media"
              screenId={screenId}
              onSend={async (text) => {
                const res = await sendMessage(setlist.id, text, "media", screenId);
                if (res.message) addMessages([res.message]);
                return res.error ?? null;
              }}
            />
          </div>
        )}
      </div>

      <Modal open={checklistOpen} title="Before the service" onClose={() => setChecklistOpen(false)}>
        <Checklist team={team} manage />
      </Modal>
    </div>
  );
}
