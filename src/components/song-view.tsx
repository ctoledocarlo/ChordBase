"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FIT, defaultSettings } from "@/lib/setlist-settings";
import type { PresetSettings } from "@/lib/songs";
import { PreviewTab } from "./editor-preview";
import { LiveFrame, useLiveMode } from "./live-mode";
import { SidebarPortal } from "./sidebar-portal";
import { SCREEN_HEIGHT } from "./song-editor-shared";
import { SongToolbar } from "./song-toolbar";
import { MinusIcon, PlusIcon } from "./icons";
import { SongSettingsPanel, deriveSong, useSongSections } from "./song-settings";

type Props = {
  title: string;
  tempo: number | null;
  originalKey: string;
  defaultCapo: number;
  body: string;
  editHref: string;
  /** Shown at the bottom of the sidebar (delete). */
  actions?: ReactNode;
  /** Shown in the bar at the bottom of a phone's screen, beside Live and the key. */
  barAction?: ReactNode;
};

/** One song, laid out like the editor's Preview tab, with its settings in the sidebar. */
export function SongView({ title, tempo, originalKey, defaultCapo, body, editHref, actions, barAction }: Props) {
  const [settings, setSettings] = useState<PresetSettings>(() => defaultSettings(defaultCapo));
  const [live, setLive] = useLiveMode();

  const { keyLabel, soundingKey, hasKey } = deriveSong(originalKey, settings);
  const stepKey = (delta: number) => setSettings((s) => ({ ...s, semitones: (s.semitones + delta + 12) % 12 }));
  const sections = useSongSections(body, originalKey, settings);

  return (
    <>
      <SidebarPortal>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
          <div className="flex gap-2">
            <Link data-tour="song-edit" href={editHref} className="btn btn-primary">
              Edit song
            </Link>
            <button data-tour="song-live" type="button" className="btn" onClick={() => setLive(true)}>
              Live
            </button>
          </div>
        </div>
        <div data-tour="song-settings" className="space-y-6">
          <SongSettingsPanel originalKey={originalKey} defaultCapo={defaultCapo} settings={settings} onChange={setSettings} />
        </div>
        {actions && <div className="border-t border-line pt-5">{actions}</div>}
      </SidebarPortal>
      <div className={live ? "" : "pb-20 lg:pb-0"}>
        <LiveFrame tour="song-screen" live={live} onExit={() => setLive(false)} liveClassName="pr-28">
          <div className={`flex flex-col ${live ? "h-full" : SCREEN_HEIGHT}`}>
            {!live && <SongToolbar originalKey={originalKey} settings={settings} onChange={setSettings} />}
            <div className="min-h-0 flex-1">
              <PreviewTab
                fill
                info={{ title, key: keyLabel, tempo: tempo ? String(tempo) : "" }}
                sections={sections}
                size={settings.fontSize === FIT ? "fit" : settings.fontSize}
                showChords={settings.showChords}
              />
            </div>
          </div>
        </LiveFrame>
      </div>

      {/* On a phone the sidebar is behind a button, so the three things used most are always at the thumb. */}
      {!live && (
        <div className="fixed inset-x-0 bottom-0 z-[25] flex items-center gap-2 border-t border-line bg-background px-3 py-2 lg:hidden">
          <button type="button" className="btn btn-primary" onClick={() => setLive(true)}>
            Live
          </button>
          <div className="flex items-center gap-1" role="group" aria-label="Key">
            <button type="button" className="btn btn-icon" onClick={() => stepKey(-1)} aria-label="Down a half step">
              <MinusIcon />
            </button>
            <span className="min-w-9 text-center font-mono text-sm font-semibold">{hasKey ? soundingKey : settings.semitones}</span>
            <button type="button" className="btn btn-icon" onClick={() => stepKey(1)} aria-label="Up a half step">
              <PlusIcon />
            </button>
          </div>
          <div className="ml-auto">{barAction}</div>
        </div>
      )}
    </>
  );
}
