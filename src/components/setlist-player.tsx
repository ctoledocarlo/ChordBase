"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  addSetlistItem,
  deleteSetlist,
  removeSetlistItem,
  reorderSetlistItems,
  saveItemSettings,
  updateSetlist,
} from "@/app/(app)/setlists/actions";
import { FIT } from "@/lib/setlist-settings";
import type { Setlist, SetlistItem } from "@/lib/setlists";
import type { PresetSettings, SongSummary } from "@/lib/songs";
import { DeleteButton } from "./delete-button";
import { PreviewTab } from "./editor-preview";
import { LiveFrame, useLiveMode } from "./live-mode";
import { SetlistRail } from "./setlist-rail";
import { SidebarPortal } from "./sidebar-portal";
import { Group, SongSettingsPanel, deriveSong, useSongSections } from "./song-settings";

/** Wait this long after the last change before saving, so dragging through sizes isn't a save each. */
const SAVE_DELAY_MS = 500;

/**
 * A setlist: the song on screen, the whole list on the right, and the settings for the
 * current song in the sidebar. Each song's settings belong to this setlist only.
 */
export function SetlistPlayer({
  setlist,
  initialItems,
  library,
}: {
  setlist: Setlist;
  initialItems: SetlistItem[];
  library: SongSummary[];
}) {
  const [items, setItems] = useState(initialItems);
  const [currentId, setCurrentId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [live, setLive] = useLiveMode();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const [name, setName] = useState(setlist.name);
  const [date, setDate] = useState(setlist.service_date ?? "");
  const [infoNote, setInfoNote] = useState<string | null>(null);

  const index = items.findIndex((i) => i.id === currentId);
  const current = index >= 0 ? items[index] : null;

  // Settings waiting to be saved, by item. Saved together after a short pause, and on leaving.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, PresetSettings>());

  async function flush(itemId: string) {
    const settings = pending.current.get(itemId);
    if (!settings) return;
    pending.current.delete(itemId);
    timers.current.delete(itemId);
    const res = await saveItemSettings(itemId, settings);
    setSaveNote(res.error ?? "Saved to this setlist");
  }

  useEffect(() => {
    const t = timers.current;
    const p = pending.current;
    return () => {
      for (const timer of t.values()) clearTimeout(timer);
      for (const [id, settings] of p) void saveItemSettings(id, settings);
    };
  }, []);

  function changeSettings(itemId: string, settings: PresetSettings) {
    setItems((list) => list.map((i) => (i.id === itemId ? { ...i, settings } : i)));
    pending.current.set(itemId, settings);
    clearTimeout(timers.current.get(itemId));
    timers.current.set(itemId, setTimeout(() => void flush(itemId), SAVE_DELAY_MS));
    setSaveNote("Saving…");
  }

  function go(delta: -1 | 1) {
    const target = items[index + delta];
    if (target) setCurrentId(target.id);
  }

  // In live mode the arrow keys and Page Up / Page Down change song, unless typing somewhere.
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const target = index + (e.key === "ArrowRight" || e.key === "PageDown" ? 1 : e.key === "ArrowLeft" || e.key === "PageUp" ? -1 : 0);
      if (target === index || !items[target]) return;
      e.preventDefault();
      setCurrentId(items[target].id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [live, index, items]);

  async function add(songId: string, where: "end" | "next") {
    setError(null);
    setBusy(true);
    const at = where === "next" && index >= 0 ? index + 1 : items.length;
    const res = await addSetlistItem(setlist.id, songId, at);
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
    setItems(next);
    setError(null);
    const res = await reorderSetlistItems(setlist.id, next.map((i) => i.id));
    if (res.error) setError(res.error);
  }

  async function remove(id: string) {
    const from = items.findIndex((i) => i.id === id);
    if (from < 0) return;
    const rest = items.filter((i) => i.id !== id);
    // If the song on screen is removed, move on to the one that takes its place.
    if (id === currentId) setCurrentId((rest[from] ?? rest[from - 1])?.id ?? null);
    setItems(rest);
    pending.current.delete(id);
    clearTimeout(timers.current.get(id));
    setError(null);
    const res = await removeSetlistItem(setlist.id, id);
    if (res.error) setError(res.error);
  }

  async function saveInfo() {
    const res = await updateSetlist(setlist.id, name, date);
    setInfoNote(res.error ?? "Saved.");
  }

  return (
    <>
      <SidebarPortal>
        <Group title="Setlist">
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
            <button type="button" className="btn" onClick={() => void saveInfo()} disabled={!name.trim()}>
              Save
            </button>
          </div>
          {infoNote && (
            <p role="status" className="mt-2 text-sm text-muted">
              {infoNote}
            </p>
          )}
        </Group>

        {current && (
          <>
            <div className="border-t border-line pt-5">
              <p className="truncate text-sm font-medium">{current.song.title}</p>
              <p className="mt-0.5 text-sm text-muted">
                These settings are saved for this setlist only.
                {saveNote && <span role="status"> {saveNote}.</span>}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted">Want to change the lyrics or chords?</p>
              <Link href={`/songs/${current.song_id}/edit`} className="btn w-full">
                Edit song
              </Link>
            </div>
            <SongSettingsPanel
              originalKey={current.song.original_key}
              defaultCapo={current.song.default_capo}
              settings={current.settings}
              onChange={(s) => changeSettings(current.id, s)}
            />
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

      <LiveFrame live={live} onExit={() => setLive(false)} liveClassName="pt-14 lg:pt-6">
        <div className={`flex flex-col gap-4 lg:flex-row ${live ? "h-full" : ""}`}>
          <div className="min-h-0 min-w-0 flex-1">
            {current ? (
              <CurrentSong item={current} live={live} />
            ) : (
              <div className="rounded-md border border-dashed border-line p-8 text-center text-muted">
                <p className="font-medium text-foreground">{setlist.name}</p>
                <p className="mt-1">No songs yet. Search for a song in the box on the right to add the first one.</p>
              </div>
            )}
          </div>
          <div
            className={`w-full flex-none lg:w-72 ${
              live ? "h-72 lg:h-auto lg:pt-10" : "h-[28rem] lg:h-[calc(100dvh-7.5rem)]"
            }`}
          >
            <SetlistRail
              items={items}
              currentId={currentId}
              library={library}
              busy={busy}
              error={error}
              onSelect={setCurrentId}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
              onAdd={(songId, where) => void add(songId, where)}
              onReorder={(id, to) => void reorder(id, to)}
              onRemove={(id) => void remove(id)}
              live={live}
              onGoLive={() => setLive(true)}
            />
          </div>
        </div>
      </LiveFrame>
    </>
  );
}

function CurrentSong({ item, live }: { item: SetlistItem; live: boolean }) {
  const { keyLabel } = deriveSong(item.song.original_key, item.settings);
  const sections = useSongSections(item.song.body, item.song.original_key, item.settings);
  return (
    <PreviewTab
      fill={live}
      info={{ title: item.song.title, key: keyLabel, tempo: item.song.tempo ? String(item.song.tempo) : "" }}
      sections={sections}
      size={item.settings.fontSize === FIT ? "fit" : item.settings.fontSize}
      showChords={item.settings.showChords}
    />
  );
}
