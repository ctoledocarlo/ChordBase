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
import { addServiceToHistory, setItemSinger, setServiceTimer } from "@/app/(app)/setlists/team-actions";
import { KEEP_OPTIONS, formatDay } from "@/lib/setlist-expiry";
import { taskProgress, tasksFor, type Singer, type TeamExtras } from "@/lib/setlist-team";
import { readLinks } from "@/lib/song-links";
import { FIT } from "@/lib/setlist-settings";
import { findSongs } from "@/app/(app)/songs/actions";
import { effectiveBody } from "@/lib/setlist-body";
import { mergeRemote } from "@/lib/setlist-sync";
import type { Transition } from "@/lib/setlist-transition";
import type { ChatMessage, Setlist, SetlistItem } from "@/lib/setlists";
import type { ChordShortcut, PresetSettings } from "@/lib/songs";
import { DeleteButton } from "./delete-button";
import { Fold } from "./fold";
import { KeyForSinger } from "./singers";
import { keepForOffline } from "./offline-support";
import { ServiceClock } from "./service-clock";
import { SongLinkList } from "./song-extras";
import { Checklist } from "./team-checklist";
import { NotesCard, NotesEditor, ViewManager } from "./team-notes";
import { useTeam } from "./use-team";
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
import { Metronome } from "./metronome";
import { SongSettingsPanel, deriveSong, useSongSections } from "./song-settings";
import { SCREEN_HEIGHT } from "./song-editor-shared";
import { SongToolbar } from "./song-toolbar";
import { StageStrip } from "./stage-strip";
import { useToast } from "./toast";
import { TransitionPanel } from "./transition-panel";
import { useIdle } from "./use-idle";
import { useStoredFlag } from "./use-stored-flag";
import { useScreenRole } from "./use-screen-role";
import { newScreenId, useSetlistSync } from "./use-setlist-sync";

/** Wait this long after the last change before saving, so dragging through sizes isn't a save each. */
const SAVE_DELAY_MS = 500;
/** How long a removed song can be brought back with Undo before it is really deleted. */
const UNDO_MS = 6000;
/** How soon to try again after a save failed for want of a connection. */
const RETRY_MS = 10_000;
/** The height of the setlist sheet on a phone when it is pulled down to just its bar, in pixels. */
const SHEET_PEEK = 56;

/** Today on this device, as "2026-10-18". */
function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The list with `item` back at `index` (or the end, if the list got shorter). */
function insertAt(list: SetlistItem[], item: SetlistItem, index: number): SetlistItem[] {
  const copy = [...list];
  copy.splice(Math.min(index, copy.length), 0, item);
  return copy;
}

/**
 * A setlist: the song on screen, the whole list on the right, and the settings for the
 * current song in the sidebar. Each song's settings belong to this setlist only.
 */
export function SetlistPlayer({
  setlist,
  initialItems,
  initialMessages,
  initialExtras,
  initialSingers,
  shortcuts,
}: {
  setlist: Setlist;
  initialItems: SetlistItem[];
  initialMessages: ChatMessage[];
  initialExtras: TeamExtras;
  initialSingers: Singer[];
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
  // On a phone the setlist panel is a sheet at the bottom of the screen; this is whether it is pulled up.
  const [railOpen, setRailOpen] = useState(false);
  // While a finger is dragging the sheet: its height right now (null when it isn't being dragged).
  const [sheetDrag, setSheetDrag] = useState<number | null>(null);
  const sheetGesture = useRef<{ startY: number; startHeight: number; startTime: number; moved: boolean } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  // Display choices for this device on Stage and Viewer screens.
  const [night, setNight] = useStoredFlag("chordbase.night", false);
  const [autoHide, setAutoHide] = useStoredFlag("chordbase.autoHide", false);

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
  // The team side: instrument views, notes, the checklist, singers and the service timer.
  const team = useTeam(setlist.id, screenId, initialExtras);
  const [singers, setSingers] = useState(initialSingers);
  const [timerEndsAt, setTimerEndsAt] = useState(setlist.timer_ends_at);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [showNotes, setShowNotes] = useStoredFlag("chordbase.showNotes", true);
  const [highlight, setHighlight] = useState<ReadonlySet<string>>(new Set());
  // Chords changed on another screen while they were being edited here.
  const [conflict, setConflict] = useState<SetlistItem | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const structuralRev = useRef(0);
  const toast = useToast();
  // Songs taken out of the list a few seconds ago. They are still on the server, so Undo can put them back where they were.
  const removing = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; item: SetlistItem; index: number; wasStage: boolean; wasCurrent: boolean }>(),
  );
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
  // The checklist items this screen has to tick off.
  const myTasks = tasksFor(team.tasks, team.views, team.myView?.id ?? null);
  // Stage and Viewer screens hide their controls after a few quiet seconds so the song has the whole screen.
  const idle = useIdle(5000, liveView && !media && autoHide);
  const hideControls = idle && !railOpen;

  // Settings waiting to be saved, by item. Saved together after a short pause, and on leaving.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, PresetSettings>());
  // The same for each song's own version of its chords.
  const bodyTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const bodyPending = useRef(new Map<string, string | null>());
  // A tutorial step about the setlist panel pulls the sheet up on a phone.
  useEffect(() => {
    const onTour = (e: Event) => setRailOpen(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener("chordbase:tour-rail", onTour);
    return () => window.removeEventListener("chordbase:tour-rail", onTour);
  }, []);

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

  // Saves that failed for want of a connection, waiting to be tried again.
  const retries = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const waiting = retries.current;
    // The moment the connection returns, send everything that is waiting.
    const sendNow = () => {
      for (const id of [...pending.current.keys()]) void flush(id);
      for (const id of [...bodyPending.current.keys()]) void flushBody(id);
      for (const id of [...transPending.current.keys()]) void flushTransition(id);
    };
    window.addEventListener("online", sendNow);
    return () => {
      window.removeEventListener("online", sendNow);
      waiting.forEach(clearTimeout);
    };
    // The save functions only read refs and stable setters, so the first ones are as good as any.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    try {
      const res = await tracked(itemId, () => saveItemSettings(itemId, settings, screenId));
      afterSave(res.error);
    } catch {
      // No connection: keep the change and send it when it is back.
      if (!pending.current.has(itemId)) pending.current.set(itemId, settings);
      tryAgainLater(`s:${itemId}`, () => void flush(itemId));
    }
  }

  async function flushTransition(itemId: string) {
    const t = transPending.current.get(itemId);
    if (!t) return;
    transPending.current.delete(itemId);
    transTimers.current.delete(itemId);
    try {
      const res = await tracked(itemId, () => saveItemTransition(itemId, t.mode, t.chords, screenId));
      afterSave(res.error);
    } catch {
      if (!transPending.current.has(itemId)) transPending.current.set(itemId, t);
      tryAgainLater(`t:${itemId}`, () => void flushTransition(itemId));
    }
  }

  async function flushBody(itemId: string) {
    if (!bodyPending.current.has(itemId)) return;
    const body = bodyPending.current.get(itemId) ?? null;
    bodyPending.current.delete(itemId);
    bodyTimers.current.delete(itemId);
    try {
      const res = await tracked(itemId, () => saveItemBody(itemId, body, screenId));
      afterSave(res.error);
    } catch {
      if (!bodyPending.current.has(itemId)) bodyPending.current.set(itemId, body);
      tryAgainLater(`b:${itemId}`, () => void flushBody(itemId));
    }
  }

  /** A save didn't get through (no connection). Say so, and try again soon and as soon as the connection is back. */
  function tryAgainLater(key: string, retry: () => void) {
    setSaveNote("Offline: kept on this screen, and sent when the connection is back");
    clearTimeout(retries.current.get(key));
    retries.current.set(
      key,
      setTimeout(() => {
        retries.current.delete(key);
        retry();
      }, RETRY_MS),
    );
  }

  useEffect(() => {
    const t = timers.current;
    const p = pending.current;
    const bt = bodyTimers.current;
    const bp = bodyPending.current;
    const tt = transTimers.current;
    const tp = transPending.current;
    const rm = removing.current;
    return () => {
      // Songs still waiting out their Undo are removed now, since there is no page left to undo on.
      for (const [id, r] of rm) {
        clearTimeout(r.timer);
        void removeSetlistItem(setlist.id, id);
      }
      for (const timer of t.values()) clearTimeout(timer);
      for (const timer of bt.values()) clearTimeout(timer);
      for (const timer of tt.values()) clearTimeout(timer);
      for (const [id, tr] of tp) void saveItemTransition(id, tr.mode, tr.chords, screenId);
      for (const [id, settings] of p) void saveItemSettings(id, settings, screenId);
      for (const [id, body] of bp) void saveItemBody(id, body, screenId);
    };
  }, [screenId, setlist.id]);

  /** The setlist sheet on a phone follows a finger dragging its top bar, and settles open or closed where the swipe was heading. */
  function sheetDown(e: React.PointerEvent<HTMLButtonElement>) {
    const box = sheet.current;
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sheetGesture.current = { startY: e.clientY, startHeight: box.getBoundingClientRect().height, startTime: e.timeStamp, moved: false };
  }

  function sheetMove(e: React.PointerEvent<HTMLButtonElement>) {
    const g = sheetGesture.current;
    if (!g) return;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.abs(dy) < 6) return;
    g.moved = true;
    const tallest = Math.min(window.innerHeight * 0.82, 704);
    setSheetDrag(Math.min(tallest, Math.max(SHEET_PEEK, g.startHeight - dy)));
  }

  function sheetUp(e: React.PointerEvent<HTMLButtonElement>) {
    const g = sheetGesture.current;
    sheetGesture.current = null;
    setSheetDrag(null);
    if (!g?.moved) return;
    const dy = e.clientY - g.startY;
    const flick = Math.abs(dy) / Math.max(1, e.timeStamp - g.startTime) > 0.4;
    // A swipe up opens it, a swipe down closes it; a short slow drag leaves it as it was.
    if (flick || Math.abs(dy) > 40) setRailOpen(dy < 0);
  }

  /** Saves finished: one "Saved" toast however many changes went through, or the error. */
  function afterSave(error?: string) {
    setSaveNote(null);
    toast(error ?? "Saved to this setlist", { id: "saved", tone: error ? "error" : "success", ms: 2200 });
  }

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
    const res = await setActiveItem(setlist.id, id, screenId, localDay());
    structuralRev.current++;
    if (res.error) setError(res.error);
  }

  /** Sets (or clears) when the set should end, for every screen. */
  async function changeTimer(endsAt: string | null) {
    const before = timerEndsAt;
    setTimerEndsAt(endsAt);
    const res = await setServiceTimer(setlist.id, endsAt, screenId);
    if (res.error) {
      setTimerEndsAt(before);
      toast(res.error, { tone: "error" });
    }
  }

  /** Who sings a song in this setlist. */
  async function chooseSinger(itemId: string, singerId: string | null) {
    const before = itemsRef.current;
    setItems((list) => list.map((i) => (i.id === itemId ? { ...i, singer_id: singerId } : i)));
    const res = await setItemSinger(itemId, singerId, screenId);
    if (res.error) {
      setItems(before);
      toast(res.error, { tone: "error" });
    }
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

  /** Takes a song out of the list. It disappears at once; the delete itself waits a few seconds so Undo can bring it back. */
  function remove(id: string) {
    const from = items.findIndex((i) => i.id === id);
    if (from < 0) return;
    const item = items[from];
    const rest = items.filter((i) => i.id !== id);
    const wasCurrent = id === viewId;
    const wasStage = id === stageId;
    // If the song on screen is removed, move on to the one that takes its place.
    if (id === currentId) setCurrentId((rest[from] ?? rest[from - 1])?.id ?? null);
    // If the song on stage is removed, the one that takes its place goes on stage instead of jumping to the first.
    if (wasStage) {
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
    removing.current.set(id, { timer: setTimeout(() => void finishRemove(id), UNDO_MS), item, index: from, wasStage, wasCurrent });
    toast(`Removed “${item.song.title}”`, { ms: UNDO_MS, action: { label: "Undo", onClick: () => undoRemove(id) } });
  }

  /** The Undo time is up: delete the song for good. */
  async function finishRemove(id: string) {
    const entry = removing.current.get(id);
    if (!entry) return;
    removing.current.delete(id);
    const res = await removeSetlistItem(setlist.id, id);
    structuralRev.current++;
    if (res.error) {
      // It couldn't be removed, so it is still in the setlist: show it again.
      setError(res.error);
      setItems((list) => (list.some((i) => i.id === id) ? list : insertAt(list, entry.item, entry.index)));
    }
  }

  function undoRemove(id: string) {
    const entry = removing.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    removing.current.delete(id);
    structuralRev.current++;
    setItems((list) => insertAt(list, entry.item, entry.index));
    if (entry.wasStage) void sendToStage(id);
    else if (entry.wasCurrent) setCurrentId(id);
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
    setInfoNote(res.error ?? null);
    if (!res.error) toast("Setlist saved", { id: "saved", tone: "success", ms: 2200 });
    return !res.error;
  }

  // ---- live updates from other screens -------------------------------------

  function notify(text: string) {
    toast(text, { ms: 6000 });
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
    team.apply(state.extras);
    setTimerEndsAt(state.setlist.timer_ends_at);

    const local = itemsRef.current;
    const pendingIds = new Set([
      ...pending.current.keys(),
      ...bodyPending.current.keys(),
      ...transPending.current.keys(),
      ...savingIds.current.keys(),
    ]);
    // Songs waiting out their Undo are gone here, whatever the server still says.
    const remote = state.items.filter((i) => !removing.current.has(i.id));
    const merged = mergeRemote(local, remote, { pendingIds, editingId: editingRef.current });

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
        <section data-tour="setlist-role">
          <h2 className="mb-2 text-sm font-medium">This screen</h2>
          <RoleSelect role={role} onChange={changeRole} />
          <p className="mt-1.5 text-sm text-muted">
            Media runs the setlist. Stage shows the song full screen for the band. Viewer only watches.
          </p>
        </section>

        <section data-tour="setlist-info" className="border-t border-line pt-5">
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
              <button data-tour="setlist-edit-chords" type="button" className="btn btn-primary w-full" onClick={() => setEditChords(true)}>
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
              {saveNote && <span role="status"> {saveNote}</span>}
            </p>
            <div data-tour="setlist-settings" className="space-y-6">
              <SongSettingsPanel
                originalKey={current.song.original_key}
                defaultCapo={current.song.default_capo}
                settings={current.settings}
                onChange={(s) => changeSettings(current.id, s)}
              />
            </div>
            {nextItem && (
              <div data-tour="setlist-bridge">
                <TransitionPanel from={current} to={nextItem} onChange={(t) => changeTransition(current.id, t)} />
              </div>
            )}
            <Fold title="Who sings it" tour="setlist-singer" hint={singers.find((x) => x.id === current.singer_id)?.name}>
              <KeyForSinger
                originalKey={current.song.original_key}
                melodyLow={current.song.melody_low ?? ""}
                melodyHigh={current.song.melody_high ?? ""}
                singers={singers}
                onSingers={setSingers}
                singerId={current.singer_id ?? null}
                onSinger={(id) => void chooseSinger(current.id, id)}
                settings={current.settings}
                onChange={(st) => changeSettings(current.id, st)}
                editHref={`/songs/${current.song_id}/edit`}
              />
            </Fold>
            <Fold title="Notes for the band" tour="setlist-notes">
              <NotesEditor team={team} itemId={current.id} />
            </Fold>
            {readLinks(current.song.links).length > 0 && (
              <Fold title="Links for this song">
                <SongLinkList links={readLinks(current.song.links)} />
              </Fold>
            )}
          </>
        )}

        <Fold title="Instrument views" tour="setlist-views" hint={team.views.length > 1 ? `${team.views.length - 1} added` : undefined}>
          <ViewManager team={team} />
        </Fold>
        <Fold
          title="Before the service"
          tour="setlist-checklist"
          hint={team.tasks.length > 0 ? `${taskProgress(team.tasks).done}/${team.tasks.length} ready` : undefined}
        >
          <Checklist team={team} manage />
        </Fold>
        <Fold title="Share, print and history" tour="setlist-share">
          <div className="grid gap-2">
            <Link href={`/setlists/${setlist.id}/remote`} className="btn w-full">
              Open the phone remote
            </Link>
            <button
              type="button"
              className="btn w-full"
              onClick={() => {
                const url = `${window.location.origin}/setlists/${setlist.id}/remote`;
                void navigator.clipboard?.writeText(url).then(
                  () => toast("Remote link copied. Open it on a phone that is signed in.", { tone: "success" }),
                  () => toast(url),
                );
              }}
            >
              Copy the remote link
            </button>
            <Link href={`/setlists/${setlist.id}/print`} className="btn w-full">
              Print or save as PDF
            </Link>
            <button
              type="button"
              className="btn w-full"
              onClick={async () => {
                const res = await addServiceToHistory(setlist.id, localDay());
                toast(res.error ?? `Added ${res.added} ${res.added === 1 ? "song" : "songs"} to the service history.`, { tone: res.error ? "error" : "success" });
              }}
            >
              Add this service to the history
            </button>
          </div>
          <button
            type="button"
            className="btn w-full"
            onClick={async () => {
              const kept = await keepForOffline([window.location.pathname, `/setlists/${setlist.id}/remote`, `/setlists/${setlist.id}/print`, "/setlists", "/"]);
              toast(
                kept > 0 ? "Kept for offline use. This setlist will open on this device without a connection." : "Couldn't keep it just now. Open it once more while online and try again.",
                { tone: kept > 0 ? "success" : "error" },
              );
            }}
          >
            Keep this setlist for offline use
          </button>
          <p className="text-xs text-muted">Songs are added to the history on their own when you put them on stage.</p>
        </Fold>

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

      <Modal open={checklistOpen} title="Before the service" onClose={() => setChecklistOpen(false)}>
        <Checklist team={team} manage={false} />
      </Modal>

      {!media && (
        <CornerMenu
          role={role}
          onChange={changeRole}
          night={night}
          onNight={setNight}
          autoHide={autoHide}
          onAutoHide={setAutoHide}
          faded={hideControls}
          views={team.views}
          viewId={team.myView?.id}
          onView={team.chooseView}
          checklist={myTasks.length > 0 ? { left: myTasks.filter((t) => !t.done).length, onOpen: () => setChecklistOpen(true) } : null}
          showNotes={showNotes}
          onShowNotes={setShowNotes}
        />
      )}

      <LiveFrame live={liveView} onExit={() => setLive(false)} hideExit={!media} liveClassName={`pt-14 lg:pt-6 ${night && !media ? "night" : ""} ${hideControls ? "cursor-none" : ""}`}>
        {liveView && (
          <div className="pointer-events-none fixed bottom-16 left-1/2 z-[55] -translate-x-1/2 rounded-full border border-line bg-background/90 px-4 py-1.5 shadow-lg lg:bottom-3">
            <ServiceClock endsAt={timerEndsAt} large />
          </div>
        )}
        <div className={`flex flex-col gap-4 lg:flex-row ${liveView ? "h-full" : ""}`}>
          <div data-tour="setlist-song" className={`min-h-0 min-w-0 flex-1 max-lg:pb-14 ${liveView && !media ? "lg:pt-8" : ""}`}>
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
              <div className={`flex flex-col ${liveView ? "h-full" : SCREEN_HEIGHT}`}>
                <StageStrip
                  role={role}
                  stageTitle={items.find((i) => i.id === stageId)?.song.title ?? null}
                  viewingStage={viewId === stageId}
                  stageScreens={sync.roles.stage ?? 0}
                  onPut={() => void sendToStage(current.id)}
                  onGoToStage={() => stageId && setCurrentId(stageId)}
                />
                {(media || showNotes) && <NotesCard team={team} itemId={current.id} role={role} />}
                {media && !liveView && (
                  <SongToolbar originalKey={current.song.original_key} settings={current.settings} onChange={(s) => changeSettings(current.id, s)} />
                )}
                <div className="min-h-0 flex-1">
                  <CurrentSong item={current} hideChords={role === "stage" && team.myView?.show_chords === false} />
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-line p-8 text-center text-muted">
                <p className="font-medium text-foreground">{setlist.name}</p>
                <p className="mt-1">No songs yet. Search for a song in the box on the right to add the first one.</p>
              </div>
            )}
          </div>
          <div
            ref={sheet}
            style={sheetDrag !== null ? ({ "--sheet-h": `${sheetDrag}px` } as React.CSSProperties) : undefined}
            className={`w-full flex-none lg:w-72 ${
              liveView ? "lg:h-auto lg:pt-10" : "lg:h-[calc(100dvh-7.5rem)]"
            } max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[25] max-lg:rounded-t-2xl max-lg:border max-lg:border-b-0 max-lg:border-line max-lg:bg-background max-lg:px-4 max-lg:shadow-[0_-8px_30px_rgba(0,0,0,0.18)] max-lg:transition-[height,transform,opacity] ${
              railOpen ? "max-lg:h-[min(82dvh,44rem)]" : "max-lg:h-14 max-lg:overflow-hidden"
            } ${hideControls ? "lg:hidden max-lg:pointer-events-none max-lg:translate-y-full max-lg:opacity-0" : ""} ${
              sheetDrag !== null ? "max-lg:!h-[var(--sheet-h)] max-lg:!transition-none" : ""
            }`}
          >
            {/* Swipe this bar up to open the setlist and down to close it. Pressing Enter or Space on it works too, for keyboards and screen readers. */}
            <button
              type="button"
              onClick={(e) => {
                if (e.detail === 0) setRailOpen((o) => !o);
              }}
              onPointerDown={sheetDown}
              onPointerMove={sheetMove}
              onPointerUp={sheetUp}
              onPointerCancel={sheetUp}
              aria-expanded={railOpen}
              aria-label={`Setlist, ${railOpen ? "swipe down to close" : "swipe up to open"}`}
              className="flex h-14 w-full touch-none select-none items-center gap-3 text-left lg:hidden"
            >
              <span aria-hidden className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-line" />
              <span className="mt-2 text-sm font-semibold">Setlist</span>
              <span className="mt-2 min-w-0 flex-1 truncate text-sm text-muted">
                {items.find((i) => i.id === stageId)?.song.title ?? "Nothing on stage"}
              </span>
              <span aria-hidden className={`mt-2 text-muted transition-transform ${railOpen ? "rotate-180" : ""}`}>
                ▲
              </span>
            </button>
            <div className="max-lg:h-[calc(100%-3.5rem)] lg:h-full">
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
              clock={!liveView ? <ServiceClock endsAt={timerEndsAt} canSet={media} onSet={(t) => void changeTimer(t)} /> : null}
              sungBy={singers.find((x) => x.id === items.find((i) => i.id === stageId)?.singer_id)?.name}
              status={sync.status}
              roles={sync.roles}
              highlightIds={highlight}
              reference={
                current ? (
                  <>
                    {/* Keyed by the song so it stops and takes that song's tempo when the song changes. */}
                    <div data-tour="metronome" className="flex-none border-b border-line">
                      <Metronome key={current.id} tempo={current.song.tempo} timeSignature={current.song.time_signature} />
                    </div>
                    <KeyChords item={current} />
                  </>
                ) : null
              }
              chat={<SetlistChat messages={messages} role={role} screenId={screenId} onSend={say} />}
              keyControl={
                liveView && current && role !== "viewer" ? (
                  <LiveControls item={current} showCapo={role !== "stage"} onChange={(settings) => changeSettings(current.id, settings)} />
                ) : null
              }
            />
            </div>
          </div>
        </div>
      </LiveFrame>
    </>
  );
}

const CurrentSong = memo(function CurrentSong({ item, hideChords }: { item: SetlistItem; hideChords: boolean }) {
  const { keyLabel } = deriveSong(item.song.original_key, item.settings);
  const sections = useSongSections(effectiveBody(item), item.song.original_key, item.settings);
  return (
    <PreviewTab
      fill
      info={{ title: item.song.title, key: keyLabel, tempo: item.song.tempo ? String(item.song.tempo) : "" }}
      sections={sections}
      size={item.settings.fontSize === FIT ? "fit" : item.settings.fontSize}
      showChords={item.settings.showChords && !hideChords}
    />
  );
});
