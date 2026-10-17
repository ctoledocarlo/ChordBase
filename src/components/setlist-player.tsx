"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useRef, useState } from "react";
import {
  addSetlistItem,
  deleteSetlist,
  getSetlistState,
  sendMessage,
  removeSetlistItem,
  reorderSetlistItems,
  saveItemBody,
  saveItemSettings,
  saveItemTransition,
  setActiveItem,
  updateSetlist,
} from "@/app/(app)/setlists/actions";
import { KEEP_OPTIONS, formatDay } from "@/lib/setlist-expiry";
import { FIT } from "@/lib/setlist-settings";
import { findSongs } from "@/app/(app)/songs/actions";
import { effectiveBody } from "@/lib/setlist-body";
import { mergeRemote } from "@/lib/setlist-sync";
import type { Transition } from "@/lib/setlist-transition";
import type { ChatMessage, Setlist, SetlistItem } from "@/lib/setlists";
import type { ChordShortcut, PresetSettings } from "@/lib/songs";
import { DeleteButton } from "./delete-button";
import { PreviewTab } from "./editor-preview";
import { KeyChords } from "./key-chords";
import { LiveControls } from "./live-controls";
import { LiveFrame, useLiveMode } from "./live-mode";
import { Modal } from "./modal";
import { SetlistChordEditor } from "./setlist-chord-editor";
import { CornerMenu, RoleSelect } from "./screen-menu";
import { SetlistChat } from "./setlist-chat";
import { SetlistRail } from "./setlist-rail";
import { SidebarPortal } from "./sidebar-portal";
import { SongSettingsPanel, deriveSong, useSongSections } from "./song-settings";
import { TransitionPanel } from "./transition-panel";
import { useScreenRole } from "./use-screen-role";
import { newScreenId, useSetlistSync } from "./use-setlist-sync";

/** Wait this long after the last change before saving, so dragging through sizes isn't a save each. */
const SAVE_DELAY_MS = 500;

/**
 * A setlist: the song on screen, the whole list on the right, and the settings for the
 * current song in the sidebar. Each song's settings belong to this setlist only.
 */
export function SetlistPlayer({
  setlist,
  initialItems,
  initialMessages,
  shortcuts,
}: {
  setlist: Setlist;
  initialItems: SetlistItem[];
  initialMessages: ChatMessage[];
  shortcuts: ChordShortcut[];
}) {
  const [items, setItems] = useState(initialItems);
  const [currentId, setCurrentId] = useState<string | null>(
    initialItems.find((i) => i.id === setlist.active_item_id)?.id ?? initialItems[0]?.id ?? null,
  );
  const [live, setLive] = useLiveMode();
  // What this screen is (Stage, Media or Viewer) and the song currently on stage, shared by every screen.
  const [chosenRole, setRole] = useScreenRole();
  const role = chosenRole ?? "media";
  const media = role === "media";
  const [activeId, setActiveId] = useState<string | null>(setlist.active_item_id);
  const [messages, setMessages] = useState(initialMessages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // Editing the chords of the song on screen, for this setlist only.
  const [editChords, setEditChords] = useState(false);

  const [name, setName] = useState(setlist.name);
  const [date, setDate] = useState(setlist.service_date ?? "");
  const [infoNote, setInfoNote] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(setlist.expires_at);
  const [keep, setKeep] = useState("");
  const [saved, setSaved] = useState({ name: setlist.name, date: setlist.service_date ?? "" });
  // Where the person was heading when we stopped them to ask about unsaved changes.
  const [leaving, setLeaving] = useState<{ href: string; back: boolean } | null>(null);
  const router = useRouter();

  // Keeping in step with other screens showing this setlist.
  const [screenId] = useState(newScreenId);
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const [highlight, setHighlight] = useState<ReadonlySet<string>>(new Set());
  // Chords changed on another screen while they were being edited here.
  const [conflict, setConflict] = useState<SetlistItem | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const structuralRev = useRef(0);
  const noticeId = useRef(0);
  const noticeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dirty = name !== saved.name || date !== saved.date || keep !== "";

  // The song on stage: the one a Media screen chose, or the first until one is chosen.
  const stageId = activeId && items.some((i) => i.id === activeId) ? activeId : (items[0]?.id ?? null);
  const stageIndex = items.findIndex((i) => i.id === stageId);
  // A Viewer shows what is on stage. Media and Stage screens show what they picked, which can be another song;
  // Media putting a new song on stage brings every Stage screen back to it.
  const viewId = role !== "viewer" && currentId && items.some((i) => i.id === currentId) ? currentId : stageId;
  const current = items.find((i) => i.id === viewId) ?? null;
  const nextItem = current ? (items[items.findIndex((i) => i.id === current.id) + 1] ?? null) : null;
  // Stage and Viewer screens are always full screen.
  const liveView = live || !media;

  // Settings waiting to be saved, by item. Saved together after a short pause, and on leaving.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, PresetSettings>());
  // The same for each song's own version of its chords.
  const bodyTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const bodyPending = useRef(new Map<string, string | null>());
  // The same for how each song leads into the next.
  const transTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const transPending = useRef(new Map<string, Transition>());
  // Songs whose changes are on their way to the server right now.
  const savingIds = useRef(new Map<string, number>());

  // What the live-update handlers need to see, since they outlive any one render.
  const itemsRef = useRef(items);
  const currentIdRef = useRef(currentId);
  const stageIdRef = useRef(stageId);
  const editingRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  useEffect(() => {
    itemsRef.current = items;
    currentIdRef.current = currentId;
    stageIdRef.current = stageId;
    editingRef.current = media && editChords && !live ? currentId : null;
    dirtyRef.current = dirty;
  });

  async function tracked<T>(itemId: string, run: () => Promise<T>): Promise<T> {
    savingIds.current.set(itemId, (savingIds.current.get(itemId) ?? 0) + 1);
    try {
      return await run();
    } finally {
      const left = (savingIds.current.get(itemId) ?? 1) - 1;
      if (left <= 0) savingIds.current.delete(itemId);
      else savingIds.current.set(itemId, left);
    }
  }

  async function flush(itemId: string) {
    const settings = pending.current.get(itemId);
    if (!settings) return;
    pending.current.delete(itemId);
    timers.current.delete(itemId);
    const res = await tracked(itemId, () => saveItemSettings(itemId, settings, screenId));
    setSaveNote(res.error ?? "Saved to this setlist");
  }

  async function flushTransition(itemId: string) {
    const t = transPending.current.get(itemId);
    if (!t) return;
    transPending.current.delete(itemId);
    transTimers.current.delete(itemId);
    const res = await tracked(itemId, () => saveItemTransition(itemId, t.mode, t.chords, screenId));
    setSaveNote(res.error ?? "Saved to this setlist");
  }

  async function flushBody(itemId: string) {
    if (!bodyPending.current.has(itemId)) return;
    const body = bodyPending.current.get(itemId) ?? null;
    bodyPending.current.delete(itemId);
    bodyTimers.current.delete(itemId);
    const res = await tracked(itemId, () => saveItemBody(itemId, body, screenId));
    setSaveNote(res.error ?? "Saved to this setlist");
  }

  useEffect(() => {
    const t = timers.current;
    const p = pending.current;
    const bt = bodyTimers.current;
    const bp = bodyPending.current;
    const tt = transTimers.current;
    const tp = transPending.current;
    return () => {
      for (const timer of t.values()) clearTimeout(timer);
      for (const timer of bt.values()) clearTimeout(timer);
      for (const timer of tt.values()) clearTimeout(timer);
      for (const [id, tr] of tp) void saveItemTransition(id, tr.mode, tr.chords, screenId);
      for (const [id, settings] of p) void saveItemSettings(id, settings, screenId);
      for (const [id, body] of bp) void saveItemBody(id, body, screenId);
    };
  }, [screenId]);

  /** This setlist's own chords for a song (null goes back to the song's). Shown at once, saved a moment later. */
  function changeBody(itemId: string, body: string | null) {
    setItems((list) => list.map((i) => (i.id === itemId ? { ...i, body_override: body } : i)));
    bodyPending.current.set(itemId, body);
    clearTimeout(bodyTimers.current.get(itemId));
    bodyTimers.current.set(itemId, setTimeout(() => void flushBody(itemId), SAVE_DELAY_MS));
    setSaveNote("Saving…");
  }

  /** How a song leads into the next one. Shown at once, saved a moment later. */
  function changeTransition(itemId: string, transition: Transition) {
    setItems((list) => list.map((i) => (i.id === itemId ? { ...i, transition } : i)));
    transPending.current.set(itemId, transition);
    clearTimeout(transTimers.current.get(itemId));
    transTimers.current.set(itemId, setTimeout(() => void flushTransition(itemId), SAVE_DELAY_MS));
    setSaveNote("Saving…");
  }

  function changeSettings(itemId: string, settings: PresetSettings) {
    setItems((list) => list.map((i) => (i.id === itemId ? { ...i, settings } : i)));
    pending.current.set(itemId, settings);
    clearTimeout(timers.current.get(itemId));
    timers.current.set(itemId, setTimeout(() => void flush(itemId), SAVE_DELAY_MS));
    setSaveNote("Saving…");
  }

  /** A screen that becomes a Stage screen starts on the song on stage. */
  function changeRole(next: typeof role) {
    setRole(next);
    if (next === "stage" && stageId) setCurrentId(stageId);
  }

  /** Put a song on stage: Stage and Viewer screens switch to it. This screen looks at it too. */
  async function sendToStage(id: string) {
    structuralRev.current++;
    setActiveId(id);
    setCurrentId(id);
    const res = await setActiveItem(setlist.id, id, screenId);
    structuralRev.current++;
    if (res.error) setError(res.error);
  }

  /** Stage screens: look at the previous or next song, on this screen only. */
  function goLocal(delta: -1 | 1) {
    const at = items.findIndex((i) => i.id === viewId);
    const target = items[at + delta];
    if (target) setCurrentId(target.id);
  }

  /** Move the song on stage back or forward one. */
  function goStage(delta: -1 | 1) {
    const target = items[stageIndex + delta];
    if (target) void sendToStage(target.id);
  }

  // In live mode the arrow keys and Page Up / Page Down change song, unless typing somewhere.
  useEffect(() => {
    if (!liveView || role === "viewer") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const delta = e.key === "ArrowRight" || e.key === "PageDown" ? 1 : e.key === "ArrowLeft" || e.key === "PageUp" ? -1 : 0;
      if (delta === 0) return;
      e.preventDefault();
      if (media) goStage(delta);
      else goLocal(delta);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // goStage and goLocal read the latest items and songs; re-listen when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveView, role, media, stageId, viewId, items]);

  async function add(songId: string, where: "end" | "next") {
    setError(null);
    setBusy(true);
    const at = where === "next" && stageIndex >= 0 ? stageIndex + 1 : items.length;
    structuralRev.current++;
    const res = await addSetlistItem(setlist.id, songId, at, screenId);
    structuralRev.current++;
    setBusy(false);
    if (res.error) setError(res.error);
    const item = res.item;
    if (!item) return;
    setItems((list) => {
      const copy = [...list];
      copy.splice(Math.min(at, copy.length), 0, item);
      return copy;
    });
    setCurrentId((id) => id ?? item.id);
  }

  async function reorder(id: string, to: number) {
    const from = items.findIndex((i) => i.id === id);
    if (from < 0 || to < 0 || to >= items.length || to === from) return;
    const next = [...items];
    next.splice(to, 0, ...next.splice(from, 1));
    structuralRev.current++;
    setItems(next);
    setError(null);
    const res = await reorderSetlistItems(setlist.id, next.map((i) => i.id), screenId);
    structuralRev.current++;
    if (res.error) setError(res.error);
  }

  async function remove(id: string) {
    const from = items.findIndex((i) => i.id === id);
    if (from < 0) return;
    const rest = items.filter((i) => i.id !== id);
    // If the song on screen is removed, move on to the one that takes its place.
    if (id === currentId) setCurrentId((rest[from] ?? rest[from - 1])?.id ?? null);
    // If the song on stage is removed, the one that takes its place goes on stage instead of jumping to the first.
    if (id === stageId) {
      const neighbour = rest[from] ?? rest[from - 1];
      if (neighbour) void sendToStage(neighbour.id);
      else setActiveId(null);
    }
    structuralRev.current++;
    setItems(rest);
    pending.current.delete(id);
    clearTimeout(timers.current.get(id));
    bodyPending.current.delete(id);
    clearTimeout(bodyTimers.current.get(id));
    transPending.current.delete(id);
    clearTimeout(transTimers.current.get(id));
    setError(null);
    const res = await removeSetlistItem(setlist.id, id);
    structuralRev.current++;
    if (res.error) setError(res.error);
  }

  /** Saves the name, date and expiry. Returns whether it worked. */
  async function saveInfo(): Promise<boolean> {
    const res = await updateSetlist(setlist.id, name, date, keep ? Number(keep) : null, screenId);
    if (!res.error) {
      if (res.expires_at) setExpiresAt(res.expires_at);
      setKeep("");
      setSaved({ name: name.trim(), date });
      setName(name.trim());
    }
    setInfoNote(res.error ?? "Saved.");
    return !res.error;
  }

  // ---- live updates from other screens -------------------------------------

  function notify(text: string) {
    const id = ++noticeId.current;
    setNotices((n) => [...n.slice(-2), { id, text }]);
    noticeTimers.current.push(setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 6000));
  }

  function flash(ids: string[]) {
    if (ids.length === 0) return;
    setHighlight(new Set(ids));
    noticeTimers.current.push(setTimeout(() => setHighlight(new Set()), 4000));
  }

  useEffect(() => {
    const timers = noticeTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  /** Adds chat messages not seen yet, keeping them in the order they were sent. */
  function addMessages(incoming: ChatMessage[]) {
    setMessages((list) => {
      const have = new Set(list.map((m) => m.id));
      const fresh = incoming.filter((m) => !have.has(m.id));
      if (fresh.length === 0) return list;
      return [...list, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-200);
    });
  }

  /** Sends a chat message. Returns an error to show, or null when it went through. */
  async function say(text: string): Promise<string | null> {
    const res = await sendMessage(setlist.id, text, role, screenId);
    if (res.message) addMessages([res.message]);
    return res.error ?? null;
  }

  /** Fetch the setlist again and fold in whatever changed on other screens. */
  async function catchUp() {
    const startRev = structuralRev.current;
    const state = await getSetlistState(setlist.id);
    if (!state) return;
    // This screen added, removed or moved something meanwhile; try again once that has settled.
    if (structuralRev.current !== startRev) {
      noticeTimers.current.push(setTimeout(() => void catchUp(), 300));
      return;
    }

    addMessages(state.messages);

    const local = itemsRef.current;
    const pendingIds = new Set([
      ...pending.current.keys(),
      ...bodyPending.current.keys(),
      ...transPending.current.keys(),
      ...savingIds.current.keys(),
    ]);
    const merged = mergeRemote(local, state.items, { pendingIds, editingId: editingRef.current });

    const unchanged = merged.items.length === local.length && merged.items.every((it, i) => it === local[i]);
    if (!unchanged) setItems(merged.items);

    const stageBefore = stageIdRef.current;
    setActiveId(state.setlist.active_item_id);
    const stageNow = state.setlist.active_item_id && merged.items.some((i) => i.id === state.setlist.active_item_id)
      ? state.setlist.active_item_id
      : (merged.items[0]?.id ?? null);
    if (stageNow !== stageBefore) {
      const onStage = merged.items.find((i) => i.id === stageNow);
      // Media putting a song on stage overrides whatever a Stage screen was looking at.
      if (role === "stage" && stageNow) setCurrentId(stageNow);
      if (media && onStage) notify(`“${onStage.song.title}” is now on stage`);
    }

    const here = currentIdRef.current;
    if (here && merged.removed.some((r) => r.id === here)) {
      const at = local.findIndex((i) => i.id === here);
      setCurrentId((merged.items[Math.min(at, merged.items.length - 1)] ?? null)?.id ?? null);
    } else if (!here && merged.items.length > 0) {
      setCurrentId(merged.items[0].id);
    }

    const title = (i: SetlistItem) => `“${i.song.title}”`;
    if (merged.added.length === 1) notify(`${title(merged.added[0])} was added`);
    else if (merged.added.length > 1) notify(`${merged.added.length} songs were added`);
    if (merged.removed.length === 1) notify(`${title(merged.removed[0])} was removed`);
    else if (merged.removed.length > 1) notify(`${merged.removed.length} songs were removed`);
    const shownUpdate = merged.updated.find((u) => u.id === here);
    if (shownUpdate) notify(`${title(shownUpdate)} was updated on another screen`);
    flash([...merged.added, ...merged.updated].map((i) => i.id));
    if (merged.conflict) setConflict(merged.conflict);

    // The setlist's own name, date and expiry, unless they are being typed over here.
    if (!dirtyRef.current) {
      setName(state.setlist.name);
      setDate(state.setlist.service_date ?? "");
      setSaved({ name: state.setlist.name, date: state.setlist.service_date ?? "" });
      setExpiresAt(state.setlist.expires_at);
    }
  }

  const sync = useSetlistSync(setlist.id, screenId, role, {
    catchUp: () => void catchUp(),
    itemDeleted: (id) => {
      const list = itemsRef.current;
      const at = list.findIndex((i) => i.id === id);
      if (at < 0) return; // already gone here, which is what happens when this screen removed it
      const rest = list.filter((i) => i.id !== id);
      if (id === currentIdRef.current) setCurrentId((rest[at] ?? rest[at - 1])?.id ?? null);
      setItems(rest);
      pending.current.delete(id);
      bodyPending.current.delete(id);
      notify(`“${list[at].song.title}” was removed`);
    },
    setlistDeleted: () => {
      notify("This setlist was deleted.");
      router.replace("/setlists");
    },
    message: (m) => addMessages([m]),
    hasSong: (songId) => itemsRef.current.some((i) => i.song_id === songId),
  });

  function takeTheirChords() {
    if (!conflict) return;
    const theirs = conflict;
    setItems((list) => list.map((i) => (i.id === theirs.id ? theirs : i)));
    bodyPending.current.delete(theirs.id);
    clearTimeout(bodyTimers.current.get(theirs.id));
    setConflict(null);
    setEditorKey((k) => k + 1);
  }

  // With unsaved changes, links that would leave the page (Back, the navbar, Edit song...)
  // ask first, and so does closing or reloading the tab.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== "_self") || link.origin !== window.location.origin) return;
      if (link.pathname === window.location.pathname && link.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving({ href: link.pathname + link.search, back: link.hasAttribute("data-back") });
    };
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty]);

  function leave() {
    if (!leaving) return;
    const { href, back } = leaving;
    setLeaving(null);
    if (back && window.history.length > 1) router.back();
    else router.push(href);
  }

  // Which kind of screen this is is only known once the page is in the browser; until then show nothing
  // rather than flash the wrong screen at a Stage tablet.
  if (chosenRole === null) return <div aria-busy className="min-h-[50vh]" />;

  return (
    <>
      {media && !(editChords && current && !live) && (
      <SidebarPortal>
        <section>
          <h2 className="mb-2 text-sm font-medium">This screen</h2>
          <RoleSelect role={role} onChange={changeRole} />
          <p className="mt-1.5 text-sm text-muted">
            Media runs the setlist. Stage shows the song full screen for the band. Viewer only watches.
          </p>
        </section>

        <section className="border-t border-line pt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Setlist</h2>
            <button
              type="button"
              className="btn border-[#16a34a] bg-[#16a34a] font-medium text-white hover:!bg-[#15803d]"
              onClick={() => void saveInfo()}
              disabled={!name.trim() || !dirty}
            >
              Save
            </button>
          </div>
          <div className="grid gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              aria-label="Setlist name"
              className="field field-sm"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Service date"
              className="field field-sm"
            />
            <label className="block">
              <span className="label">Expires {formatDay(expiresAt)}</span>
              <select value={keep} onChange={(e) => setKeep(e.target.value)} className="field field-sm">
                <option value="">Keep as it is</option>
                {KEEP_OPTIONS.map((o) => (
                  <option key={o.months} value={o.months}>
                    Keep for {o.label} from today
                  </option>
                ))}
              </select>
            </label>
          </div>
          {dirty ? (
            <p className="mt-2 text-sm text-muted">You have unsaved changes.</p>
          ) : (
            infoNote && (
              <p role="status" className="mt-2 text-sm text-muted">
                {infoNote}
              </p>
            )
          )}
        </section>

        {current && (
          <>
            <div className="space-y-2 border-t border-line pt-5">
              <p className="truncate text-sm font-medium">{current.song.title}</p>
              <p className="text-sm text-muted">Change the chords for this setlist only:</p>
              <button type="button" className="btn btn-primary w-full" onClick={() => setEditChords(true)}>
                Edit chords
              </button>
              {current.body_override !== null && (
                <p className="text-sm text-muted">This setlist has its own chords for this song.</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted">Or change the song itself, in every setlist:</p>
              <Link href={`/songs/${current.song_id}/edit`} className="btn w-full">
                Edit the song itself
              </Link>
            </div>
            <p className="text-sm text-muted">
              The settings below are saved for this setlist only.
              {saveNote && <span role="status"> {saveNote}.</span>}
            </p>
            <SongSettingsPanel
              originalKey={current.song.original_key}
              defaultCapo={current.song.default_capo}
              settings={current.settings}
              onChange={(s) => changeSettings(current.id, s)}
            />
            {nextItem && (
              <TransitionPanel from={current} to={nextItem} onChange={(t) => changeTransition(current.id, t)} />
            )}
          </>
        )}

        <div className="border-t border-line pt-5">
          <DeleteButton
            action={deleteSetlist}
            id={setlist.id}
            title="Delete this setlist?"
            message={`“${setlist.name}” will be deleted. The songs in it stay in your library.`}
          />
        </div>
      </SidebarPortal>
      )}

      <Modal open={leaving !== null} title="Leave without saving?" onClose={() => setLeaving(null)}>
        <div className="space-y-5">
          <p>You changed this setlist&apos;s name, date or expiry but haven&apos;t saved it.</p>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn" onClick={() => setLeaving(null)}>
              Keep editing
            </button>
            <button type="button" className="btn" onClick={leave}>
              Leave without saving
            </button>
            <button
              type="button"
              className="btn border-[#16a34a] bg-[#16a34a] font-medium text-white hover:!bg-[#15803d]"
              disabled={!name.trim()}
              onClick={async () => {
                if (await saveInfo()) leave();
              }}
            >
              Save and leave
            </button>
          </div>
        </div>
      </Modal>

      {!media && <CornerMenu role={role} onChange={changeRole} />}

      <LiveFrame live={liveView} onExit={() => setLive(false)} hideExit={!media} liveClassName="pt-14 lg:pt-6">
        <div className={`flex flex-col gap-4 lg:flex-row ${liveView ? "h-full" : ""}`}>
          <div className="min-h-0 min-w-0 flex-1">
            {media && current && editChords && !live ? (
              <>
              {conflict && conflict.id === current.id && (
                <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-line bg-hover px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">Someone else just changed the chords for this song.</span>
                  <button type="button" className="btn" onClick={() => setConflict(null)}>
                    Keep mine
                  </button>
                  <button type="button" className="btn btn-primary" onClick={takeTheirChords}>
                    Use theirs
                  </button>
                </div>
              )}
              <SetlistChordEditor
                key={`${current.id}:${editorKey}`}
                item={current}
                shortcuts={shortcuts}
                onChange={(body) => changeBody(current.id, body)}
                onDone={() => setEditChords(false)}
              />
              </>
            ) : current ? (
              <CurrentSong item={current} live={liveView} />
            ) : (
              <div className="rounded-md border border-dashed border-line p-8 text-center text-muted">
                <p className="font-medium text-foreground">{setlist.name}</p>
                <p className="mt-1">No songs yet. Search for a song in the box on the right to add the first one.</p>
              </div>
            )}
          </div>
          <div
            className={`w-full flex-none lg:w-72 ${
              liveView ? "h-72 lg:h-auto lg:pt-10" : "h-[28rem] lg:h-[calc(100dvh-7.5rem)]"
            }`}
          >
            <SetlistRail
              items={items}
              role={role}
              currentId={viewId}
              activeId={stageId}
              onSendToStage={(id) => void sendToStage(id)}
              onSearch={findSongs}
              busy={busy}
              error={error}
              onSelect={setCurrentId}
              onBackToStage={() => stageId && setCurrentId(stageId)}
              onPrev={() => (media ? goStage(-1) : goLocal(-1))}
              onNext={() => (media ? goStage(1) : goLocal(1))}
              onAdd={(songId, where) => void add(songId, where)}
              onReorder={(id, to) => void reorder(id, to)}
              onRemove={(id) => void remove(id)}
              live={liveView}
              onGoLive={() => setLive(true)}
              status={sync.status}
              roles={sync.roles}
              highlightIds={highlight}
              reference={current ? <KeyChords item={current} /> : null}
              chat={<SetlistChat messages={messages} role={role} screenId={screenId} onSend={say} />}
              keyControl={
                liveView && current && role !== "viewer" ? (
                  <LiveControls item={current} showCapo={role !== "stage"} onChange={(settings) => changeSettings(current.id, settings)} />
                ) : null
              }
            />
          </div>
        </div>
      </LiveFrame>

      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-[60] flex max-w-sm flex-col gap-2">
        {notices.map((n) => (
          <p key={n.id} className="anim-rise pointer-events-auto rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
            {n.text}
          </p>
        ))}
      </div>
    </>
  );
}

const CurrentSong = memo(function CurrentSong({ item, live }: { item: SetlistItem; live: boolean }) {
  const { keyLabel } = deriveSong(item.song.original_key, item.settings);
  const sections = useSongSections(effectiveBody(item), item.song.original_key, item.settings);
  return (
    <PreviewTab
      fill={live}
      info={{ title: item.song.title, key: keyLabel, tempo: item.song.tempo ? String(item.song.tempo) : "" }}
      sections={sections}
      size={item.settings.fontSize === FIT ? "fit" : item.settings.fontSize}
      showChords={item.settings.showChords}
    />
  );
});
