"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { getRemoteState, joinRemote, leaveRemote, remoteGoTo, remoteSaveNote, remoteSaveSettings, remoteSendMessage, remoteSetTaskDone, remoteSetTimer } from "@/app/r/actions";
import { cleanPin } from "@/lib/remote-token";
import { deriveSong } from "@/lib/setlist-derive";
import { mergeRemote } from "@/lib/setlist-sync";
import { MAX_NOTE, everyoneView, noteFor, notesToShow, taskProgress, tasksFor, type SetlistTask } from "@/lib/setlist-team";
import type { ChatMessage, SetlistItem } from "@/lib/setlists";
import type { RemoteState } from "@/lib/remote-access";
import { ServiceClock } from "./service-clock";
import { SetlistChat } from "./setlist-chat";
import { useToast } from "./toast";
import { newScreenId } from "./use-setlist-sync";
import { useStoredText } from "./use-stored-flag";

const SAVE_DELAY_MS = 400;
/** How often the phone asks what changed. Slower while it is just sitting there. */
const POLL_MS = 3000;

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The screen a phone sees before it has joined: a PIN to type. */
export function RemotePin({ setlistId, unavailable = false }: { setlistId: string; unavailable?: boolean }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function join() {
    setError(null);
    start(async () => {
      const res = await joinRemote(setlistId, pin);
      if ("error" in res) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Join the remote</h1>
        <p className="mt-2 text-muted">Type the 6-digit PIN shown on the Media screen. No login needed.</p>
      </div>
      {unavailable ? (
        <p role="alert" className="text-danger">
          The remote isn&apos;t set up on this server yet.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <label className="block">
            <span className="label">PIN</span>
            <input
              value={pin}
              onChange={(e) => setPin(cleanPin(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={6}
              placeholder="••••••"
              aria-describedby={error ? "pin-error" : undefined}
              className="field text-center font-mono text-3xl tracking-[0.4em]"
            />
          </label>
          {error && (
            <p id="pin-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary min-h-12 w-full text-lg" disabled={pending || pin.length !== 6}>
            {pending ? "Joining…" : "Join"}
          </button>
        </form>
      )}
    </main>
  );
}

/**
 * A controller for a phone, joined with the PIN (no login): big Previous and Next buttons for the song on stage,
 * the notes for this phone's own instrument, a tap on any song to send it there, the key of the song on stage, the
 * service clock, the checklist and the chat. As many phones as you like can be joined at once. It keeps the phone
 * awake, and asks the server every few seconds what the other screens changed.
 */
export function Remote({ setlistId, initial }: { setlistId: string; initial: RemoteState }) {
  const router = useRouter();
  const toast = useToast();
  const [screenId] = useState(newScreenId);
  const [items, setItems] = useState<SetlistItem[]>(initial.items);
  const [activeId, setActiveId] = useState(initial.setlist.active_item_id);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [timerEndsAt, setTimerEndsAt] = useState(initial.setlist.timer_ends_at);
  const [extras, setExtras] = useState(initial.extras);
  const [status, setStatus] = useState<"live" | "offline">("live");
  const [chatOpen, setChatOpen] = useState(false);
  // A song waiting for "yes, put it on stage": changing the live song is never one accidental tap.
  const [ask, setAsk] = useState<{ id: string; title: string } | null>(null);
  // The song whose note for this phone's instrument is being written, and what has been typed.
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  // Which instrument this phone is, for this setlist (remembered on the phone, and the same choice a Stage screen makes).
  const [chosen, setChosen] = useStoredText(`chordbase.stageView.${setlistId}`, "");

  const { views, notes, tasks } = extras;
  const everyone = everyoneView(views);
  const myView = views.find((v) => v.id === chosen) ?? everyone ?? null;
  const myViewId = myView?.id ?? null;

  const stageId = activeId && items.some((i) => i.id === activeId) ? activeId : (items[0]?.id ?? null);
  const stageIndex = items.findIndex((i) => i.id === stageId);
  const onStage = stageIndex >= 0 ? items[stageIndex] : null;
  const next = stageIndex >= 0 ? items[stageIndex + 1] : undefined;

  // What was changed on this phone and not yet saved, so a poll doesn't undo it; and a counter that tells a poll it is out of date.
  const pendingIds = useRef(new Set<string>());
  const epoch = useRef(0);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  /** A refusal means the PIN was changed or the remote switched off: back to the PIN screen. */
  function refused(res: unknown): boolean {
    if (res && typeof res === "object" && "denied" in res) {
      toast((res as { error?: string }).error ?? "The remote was switched off.", { tone: "error" });
      router.refresh();
      return true;
    }
    return false;
  }

  // Ask the server what changed, every few seconds while the phone is on screen.
  useEffect(() => {
    let stopped = false;
    let running = false;
    async function poll() {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      const seen = epoch.current;
      try {
        const res = await getRemoteState(setlistId);
        if (stopped) return;
        if (refused(res)) return;
        if ("state" in res && seen === epoch.current) {
          const state = res.state;
          setStatus("live");
          setMessages((list) => {
            const have = new Set(list.map((m) => m.id));
            const fresh = state.messages.filter((m) => !have.has(m.id));
            return fresh.length === 0 ? list : [...list, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-200);
          });
          setExtras((now) => ({
            views: state.extras.views,
            notes: state.extras.notes,
            // A tick still being saved stays as it is here.
            tasks: state.extras.tasks.map((t) => (pendingIds.current.has(t.id) ? (now.tasks.find((x) => x.id === t.id) ?? t) : t)),
          }));
          setTimerEndsAt(state.setlist.timer_ends_at);
          setActiveId(state.setlist.active_item_id);
          setItems((local) => mergeRemote(local, state.items, { pendingIds: pendingIds.current, editingId: null }).items);
        }
      } catch {
        // No connection just now; it tries again on the next beat.
        if (!stopped) setStatus("offline");
      } finally {
        running = false;
      }
    }
    const timer = setInterval(() => void poll(), POLL_MS);
    const again = () => void poll();
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("online", again);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `refused` only uses stable things (router, toast).
  }, [setlistId]);

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

  /** Runs a change on the server; a problem is shown, and a refusal sends the phone back to the PIN. */
  async function run(change: Promise<{ error?: string } | { denied: true; error: string }>) {
    epoch.current++;
    const res = await change;
    epoch.current++;
    if (refused(res)) return false;
    if ("error" in res && res.error) {
      toast(res.error, { tone: "error" });
      return false;
    }
    return true;
  }

  async function goTo(id: string) {
    setActiveId(id);
    await run(remoteGoTo(setlistId, id, screenId, localDay()));
  }

  /** Asks before putting a song on stage (the song already there needs nothing). */
  function request(id: string) {
    const item = items.find((i) => i.id === id);
    if (item && id !== stageId) setAsk({ id, title: item.song.title });
  }

  function startNote() {
    if (!onStage || !myViewId) return;
    setDraft(noteFor(notes, onStage.id, myViewId)?.body ?? "");
    setEditItemId(onStage.id);
  }

  async function saveNote() {
    if (!editItemId || !myViewId) return;
    setSavingNote(true);
    epoch.current++;
    const res = await remoteSaveNote(setlistId, editItemId, myViewId, draft);
    epoch.current++;
    setSavingNote(false);
    if (refused(res)) return;
    if ("error" in res) return toast(res.error, { tone: "error" });
    const saved = res.note;
    const item = editItemId;
    const view = myViewId;
    setExtras((e) => ({ ...e, notes: [...e.notes.filter((n) => !(n.item_id === item && n.view_id === view)), ...(saved ? [saved] : [])] }));
    setEditItemId(null);
  }

  // The key of the song on stage, saved a moment after the last tap.
  const keyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function stepKey(delta: number) {
    if (!onStage) return;
    const settings = { ...onStage.settings, semitones: (onStage.settings.semitones + delta + 12) % 12 };
    const id = onStage.id;
    pendingIds.current.add(id);
    setItems((list) => list.map((i) => (i.id === id ? { ...i, settings } : i)));
    clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(async () => {
      await run(remoteSaveSettings(setlistId, id, settings, screenId));
      pendingIds.current.delete(id);
    }, SAVE_DELAY_MS);
  }
  useEffect(() => () => clearTimeout(keyTimer.current), []);

  async function changeTimer(endsAt: string | null) {
    setTimerEndsAt(endsAt);
    await run(remoteSetTimer(setlistId, endsAt, screenId));
  }

  async function tick(task: SetlistTask, done: boolean) {
    pendingIds.current.add(task.id);
    setExtras((e) => ({ ...e, tasks: e.tasks.map((t) => (t.id === task.id ? { ...t, done, done_by: done ? (myView?.kind === "instrument" ? myView.name : null) : null } : t)) }));
    await run(remoteSetTaskDone(setlistId, task.id, done, myView?.kind === "instrument" ? myView.name : null, screenId));
    pendingIds.current.delete(task.id);
  }

  async function leave() {
    await leaveRemote(setlistId);
    router.refresh();
  }

  const myTasks = tasksFor(tasks, views, myViewId);
  const progress = taskProgress(myTasks);
  const keyName = onStage ? deriveSong(onStage.song.original_key, onStage.settings).keyLabel : "";
  const instruments = views.filter((v) => v.kind === "instrument");
  const noteLabel = (view: { kind: string; name: string }) => (view.kind === "all" ? "Everyone" : view.name);

  // Only an instrument's own note can be written from a phone (not the shared "Everyone" one).
  const canWriteNote = myView?.kind === "instrument";
  const stageNotes = onStage ? notesToShow(notes, views, onStage.id, myViewId) : [];
  const nextNotes = next ? notesToShow(notes, views, next.id, myViewId) : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{initial.setlist.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden className={`h-2 w-2 rounded-full ${status === "live" ? "bg-[#16a34a]" : "bg-[#d97706]"}`} />
            {status === "live" ? "Live" : "Reconnecting…"}
          </p>
        </div>
        <ServiceClock endsAt={timerEndsAt} canSet onSet={(t) => void changeTimer(t)} large />
      </header>

      {instruments.length > 0 && (
        <label className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
          <span className="flex-none text-sm text-muted">This phone is</span>
          <select className="field field-sm min-w-0 flex-1" value={myViewId ?? ""} onChange={(e) => setChosen(e.target.value)} aria-label="Which instrument this phone is">
            {everyone && <option value={everyone.id}>Everyone (no instrument)</option>}
            {instruments.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <section data-tour="remote-stage" aria-label="On stage" className="rounded-xl border border-line p-3">
        {onStage ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="flex-none text-[0.6875rem] font-medium uppercase tracking-wide text-muted">On stage</span>
              <p className="min-w-0 flex-1 truncate text-lg font-semibold leading-tight">{onStage.song.title}</p>
              <span className="flex-none font-mono text-sm text-muted">{keyName}</span>
            </div>
            {(stageNotes.length > 0 || canWriteNote) && (
              <div className="mt-2 space-y-1.5 border-t border-line pt-2 text-sm" aria-label="Notes for this song">
                {stageNotes.map(({ view, body }) => (
                  <p key={view.id} className="whitespace-pre-wrap leading-snug">
                    <span className="mr-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">{noteLabel(view)}</span>
                    {body}
                  </p>
                ))}
                {canWriteNote &&
                  (editItemId === onStage.id ? (
                    <div className="space-y-2">
                      <textarea
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={MAX_NOTE}
                        rows={3}
                        className="field field-sm"
                        aria-label={`Notes for ${myView?.name}`}
                        placeholder={`Notes for ${myView?.name}…`}
                      />
                      <div className="flex gap-2">
                        <button type="button" className="btn btn-primary px-3 py-1 text-sm" onClick={() => void saveNote()} disabled={savingNote}>
                          {savingNote ? "Saving…" : "Save note"}
                        </button>
                        <button type="button" className="btn px-3 py-1 text-sm" onClick={() => setEditItemId(null)} disabled={savingNote}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="text-xs text-muted underline" onClick={startNote}>
                      {noteFor(notes, onStage.id, myViewId!)?.body.trim() ? `Edit ${myView?.name} note` : `Add a note for ${myView?.name}`}
                    </button>
                  ))}
              </div>
            )}
            {next && (
              <p className="mt-2 truncate text-xs text-muted">
                <span className="font-medium uppercase tracking-wide">Next </span>
                {next.song.title}
                {nextNotes.map(({ view, body }) => ` · ${noteLabel(view)}: ${body}`).join("")}
              </p>
            )}
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button type="button" className="btn min-h-11" disabled={stageIndex <= 0} onClick={() => request(items[stageIndex - 1].id)}>
                ← Previous
              </button>
              <button type="button" className="btn btn-primary min-h-11" disabled={!next} onClick={() => next && request(next.id)}>
                Next →
              </button>
            </div>
          </>
        ) : (
          <p className="text-muted">Nothing in the setlist yet.</p>
        )}
      </section>

      {onStage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-1.5">
          <span className="text-sm text-muted">Key of the song on stage</span>
          <span className="flex items-center gap-2">
            <button type="button" className="btn btn-icon h-9 w-9 text-lg" onClick={() => stepKey(-1)} aria-label="Down a half step">
              −
            </button>
            <span className="w-12 text-center font-mono font-semibold">{deriveSong(onStage.song.original_key, onStage.settings).soundingKey || onStage.settings.semitones}</span>
            <button type="button" className="btn btn-icon h-9 w-9 text-lg" onClick={() => stepKey(1)} aria-label="Up a half step">
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
          {items.map((item, i) => {
            const hasNote = !!myViewId && ((everyone && noteFor(notes, item.id, everyone.id)?.body.trim()) || noteFor(notes, item.id, myViewId)?.body.trim());
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => request(item.id)}
                  aria-current={item.id === stageId ? "true" : undefined}
                  className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left ${item.id === stageId ? "bg-hover font-medium" : "hover:bg-hover"}`}
                >
                  <span className="w-5 flex-none text-right text-sm text-muted tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{item.song.title}</span>
                  {hasNote && (
                    <span className="flex-none text-xs text-muted" title="Has a note for you">
                      note
                    </span>
                  )}
                  {item.id === stageId && <span className="flex-none text-xs font-medium text-accent">On stage</span>}
                  <span className="flex-none font-mono text-xs text-muted">{deriveSong(item.song.original_key, item.settings).soundingKey}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {myTasks.length > 0 && (
        <details className="rounded-xl border border-line">
          <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium">
            Before the service{" "}
            <span className="font-normal text-muted">
              {progress.done}/{progress.total} ready
            </span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {myTasks.map((t) => (
              <li key={t.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                  <input type="checkbox" className="h-5 w-5 flex-none" checked={t.done} onChange={(e) => void tick(t, e.target.checked)} />
                  <span className={`min-w-0 flex-1 ${t.done ? "text-muted line-through" : ""}`}>{t.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button type="button" className="btn" onClick={() => setChatOpen((o) => !o)} aria-expanded={chatOpen}>
        {chatOpen ? "Hide chat" : "Chat"}
      </button>
      {chatOpen && (
        <div className="h-72">
          <SetlistChat
            messages={messages}
            role="stage"
            screenId={screenId}
            onSend={async (text) => {
              epoch.current++;
              const res = await remoteSendMessage(setlistId, text, screenId);
              epoch.current++;
              if (refused(res)) return "The remote was switched off.";
              if ("message" in res && res.message) {
                const sent = res.message;
                setMessages((list) => (list.some((m) => m.id === sent.id) ? list : [...list, sent]));
              }
              return ("error" in res && res.error) || null;
            }}
          />
        </div>
      )}

      {ask && (
        <>
          <div aria-hidden className="fixed inset-0 z-40 bg-black/40" onClick={() => setAsk(null)} />
          <div role="alertdialog" aria-modal="true" aria-label="Change the song on stage" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-background p-4 shadow-lg">
            <div className="mx-auto max-w-md space-y-3">
              <p>
                Put <strong>{ask.title}</strong> on stage? Every screen will switch to it.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="btn min-h-12" onClick={() => setAsk(null)} autoFocus>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary min-h-12"
                  onClick={() => {
                    const id = ask.id;
                    setAsk(null);
                    void goTo(id);
                  }}
                >
                  Yes, put it on stage
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <button type="button" className="btn btn-quiet mt-auto self-center text-sm" onClick={() => void leave()}>
        Leave the remote
      </button>
    </main>
  );
}
