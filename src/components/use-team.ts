"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDefaultTasks,
  addTask as addTaskOnServer,
  addView as addViewOnServer,
  deleteTask,
  deleteView,
  saveNote,
  setTaskDone,
  updateView,
} from "@/app/(app)/setlists/team-actions";
import { everyoneView, noteFor, type SetlistNote, type SetlistTask, type SetlistView, type TeamExtras } from "@/lib/setlist-team";
import { useToast } from "./toast";
import { useStoredText } from "./use-stored-flag";

/** Wait this long after typing stops before saving a note. */
const NOTE_DELAY_MS = 700;
/** If a note couldn't be saved (no connection), try again this often. */
const RETRY_MS = 8000;

/**
 * The team side of a setlist on one screen: the instrument views, the notes for each song and view, and the
 * pre-service checklist. Changes show here at once and are saved a moment later; what other screens changed
 * arrives through `apply`, which never overwrites a note still being typed here.
 */
export function useTeam(setlistId: string, screenId: string, initial: TeamExtras) {
  const toast = useToast();
  const [views, setViews] = useState(initial.views);
  const [notes, setNotes] = useState(initial.notes);
  const [tasks, setTasks] = useState(initial.tasks);
  // Which instrument this screen is, for this setlist (remembered on the device).
  const [chosen, setChosen] = useStoredText(`chordbase.stageView.${setlistId}`, "");

  const everyone = everyoneView(views);
  const myView = views.find((v) => v.id === chosen) ?? everyone ?? null;

  // Notes waiting to be saved, by "item:view". The text is kept so a retry sends the latest.
  const pending = useRef(new Map<string, { itemId: string; viewId: string; text: string; timer: ReturnType<typeof setTimeout> | undefined }>());
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  });

  // The save retries itself later through this, since a function can't name itself inside its own useCallback.
  const retry = useRef<(key: string) => void>(() => {});

  const flush = useCallback(
    async (key: string) => {
      const entry = pending.current.get(key);
      if (!entry) return;
      clearTimeout(entry.timer);
      const sent = entry.text;
      let failed = false;
      try {
        const res = await saveNote(setlistId, entry.itemId, entry.viewId, sent, screenId);
        if ("error" in res) {
          failed = true;
          toast(res.error, { tone: "error", id: "note-error" });
        } else if (pending.current.get(key)?.text === sent) {
          // Nothing newer was typed meanwhile: the saved note is now the truth.
          pending.current.delete(key);
          setNotes((list) => {
            const rest = list.filter((n) => !(n.item_id === entry.itemId && n.view_id === entry.viewId));
            return res.note ? [...rest, res.note] : rest;
          });
        }
      } catch {
        // Most likely there is no connection. Keep the text and try again.
        failed = true;
      }
      const still = pending.current.get(key);
      if (failed && still) still.timer = setTimeout(() => retry.current(key), RETRY_MS);
      else if (still && still.text !== sent) still.timer = setTimeout(() => retry.current(key), NOTE_DELAY_MS);
    },
    [setlistId, screenId, toast],
  );

  useEffect(() => {
    retry.current = (key) => void flush(key);
  }, [flush]);

  /** A note's text for a song on a view: what is being typed, or what is saved. */
  const noteText = useCallback((itemId: string, viewId: string) => noteFor(notes, itemId, viewId)?.body ?? "", [notes]);

  const setNote = useCallback(
    (itemId: string, viewId: string, text: string) => {
      const key = `${itemId}:${viewId}`;
      setNotes((list) => {
        const existing = list.find((n) => n.item_id === itemId && n.view_id === viewId);
        if (existing) return list.map((n) => (n === existing ? { ...n, body: text } : n));
        return [...list, { id: `local-${key}`, item_id: itemId, view_id: viewId, body: text, updated_at: "" }];
      });
      const entry = pending.current.get(key);
      clearTimeout(entry?.timer);
      pending.current.set(key, { itemId, viewId, text, timer: setTimeout(() => void flush(key), NOTE_DELAY_MS) });
    },
    [flush],
  );

  // Save what is waiting when the person leaves, and as soon as the connection comes back.
  useEffect(() => {
    const waiting = pending.current;
    const retryAll = () => waiting.forEach((_, key) => void flush(key));
    window.addEventListener("online", retryAll);
    return () => {
      window.removeEventListener("online", retryAll);
      for (const [key, entry] of waiting) {
        clearTimeout(entry.timer);
        void saveNote(setlistId, entry.itemId, entry.viewId, entry.text, screenId);
        waiting.delete(key);
      }
    };
  }, [flush, setlistId, screenId]);

  /** Folds in what the server says now (from another screen), keeping notes that are still being typed here. */
  const apply = useCallback((extras: TeamExtras) => {
    setViews(extras.views);
    setTasks(extras.tasks);
    setNotes((local) => {
      const keep = local.filter((n) => pending.current.has(`${n.item_id}:${n.view_id}`));
      const keepKeys = new Set(keep.map((n) => `${n.item_id}:${n.view_id}`));
      return [...extras.notes.filter((n) => !keepKeys.has(`${n.item_id}:${n.view_id}`)), ...keep];
    });
  }, []);

  // ---- Views ----

  const addView = useCallback(
    async (name: string, showChords: boolean) => {
      const res = await addViewOnServer(setlistId, name, showChords, screenId);
      if ("error" in res) {
        toast(res.error, { tone: "error" });
        return false;
      }
      setViews((list) => [...list.filter((v) => v.id !== res.view.id), res.view].sort((a, b) => a.position - b.position));
      return true;
    },
    [setlistId, screenId, toast],
  );

  const changeView = useCallback(
    async (id: string, patch: { name?: string; show_chords?: boolean }) => {
      const before = views;
      setViews((list) => list.map((v) => (v.id === id ? { ...v, ...patch, name: patch.name?.trim() || v.name } : v)));
      const res = await updateView(id, patch, screenId);
      if (res.error) {
        setViews(before);
        toast(res.error, { tone: "error" });
      }
    },
    [views, screenId, toast],
  );

  const removeView = useCallback(
    async (id: string) => {
      const before = { views, notes, tasks };
      setViews((list) => list.filter((v) => v.id !== id));
      setNotes((list) => list.filter((n) => n.view_id !== id));
      setTasks((list) => list.filter((t) => t.view_id !== id));
      if (chosen === id) setChosen("");
      const res = await deleteView(id);
      if (res.error) {
        setViews(before.views);
        setNotes(before.notes);
        setTasks(before.tasks);
        toast(res.error, { tone: "error" });
      }
    },
    [views, notes, tasks, chosen, setChosen, toast],
  );

  // ---- Checklist ----

  const addTask = useCallback(
    async (label: string, viewId: string | null) => {
      const res = await addTaskOnServer(setlistId, label, viewId, screenId);
      if ("error" in res) {
        toast(res.error, { tone: "error" });
        return false;
      }
      setTasks((list) => [...list.filter((t) => t.id !== res.task.id), res.task]);
      return true;
    },
    [setlistId, screenId, toast],
  );

  const addUsualTasks = useCallback(async () => {
    const res = await addDefaultTasks(setlistId, screenId);
    if ("error" in res) return toast(res.error, { tone: "error" });
    setTasks((list) => [...list, ...res.tasks.filter((t) => !list.some((x) => x.id === t.id))]);
  }, [setlistId, screenId, toast]);

  const toggleTask = useCallback(
    async (id: string, done: boolean, by: string | null) => {
      const before = tasks;
      setTasks((list) => list.map((t) => (t.id === id ? { ...t, done, done_by: done ? by : null } : t)));
      try {
        const res = await setTaskDone(id, done, by, screenId);
        if (res.error) throw new Error(res.error);
      } catch (e) {
        setTasks(before);
        toast(e instanceof Error ? e.message : "Couldn't save that.", { tone: "error", id: "task-error" });
      }
    },
    [tasks, screenId, toast],
  );

  const removeTask = useCallback(
    async (id: string) => {
      const before = tasks;
      setTasks((list) => list.filter((t) => t.id !== id));
      const res = await deleteTask(id);
      if (res.error) {
        setTasks(before);
        toast(res.error, { tone: "error" });
      }
    },
    [tasks, toast],
  );

  return {
    views,
    notes,
    tasks,
    everyone,
    myView,
    chooseView: setChosen,
    apply,
    noteText,
    setNote,
    addView,
    changeView,
    removeView,
    addTask,
    addUsualTasks,
    toggleTask,
    removeTask,
  } as const;
}

export type Team = ReturnType<typeof useTeam>;

export type { SetlistNote, SetlistTask, SetlistView };
