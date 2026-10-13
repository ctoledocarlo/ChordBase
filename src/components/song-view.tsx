"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FIT, defaultSettings } from "@/lib/setlist-settings";
import type { PresetSettings } from "@/lib/songs";
import { PreviewTab } from "./editor-preview";
import { LiveFrame, useLiveMode } from "./live-mode";
import { SidebarPortal } from "./sidebar-portal";
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
};

/** One song, laid out like the editor's Preview tab, with its settings in the sidebar. */
export function SongView({ title, tempo, originalKey, defaultCapo, body, editHref, actions }: Props) {
  const [settings, setSettings] = useState<PresetSettings>(() => defaultSettings(defaultCapo));
  const [live, setLive] = useLiveMode();

  const { keyLabel } = deriveSong(originalKey, settings);
  const sections = useSongSections(body, originalKey, settings);

  return (
    <>
      <SidebarPortal>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
          <div className="flex gap-2">
            <Link href={editHref} className="btn btn-primary">
              Edit song
            </Link>
            <button type="button" className="btn" onClick={() => setLive(true)}>
              Live
            </button>
          </div>
        </div>
        <SongSettingsPanel originalKey={originalKey} defaultCapo={defaultCapo} settings={settings} onChange={setSettings} />
        {actions && <div className="border-t border-line pt-5">{actions}</div>}
      </SidebarPortal>
      <LiveFrame live={live} onExit={() => setLive(false)} liveClassName="pr-28">
        <PreviewTab
          fill={live}
          info={{ title, key: keyLabel, tempo: tempo ? String(tempo) : "" }}
          sections={sections}
          size={settings.fontSize === FIT ? "fit" : settings.fontSize}
          showChords={settings.showChords}
        />
      </LiveFrame>
    </>
  );
}
