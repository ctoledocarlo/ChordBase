"use client";

import { useEffect, useState } from "react";
import { Modal } from "./modal";

/** Asked for by the "Keyboard shortcuts" item in the Tutorial menu. */
export const SHORTCUTS_EVENT = "chordbase:shortcuts";

const typing = (el: Element | null) =>
  !!el && ((el as HTMLElement).isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

const rows = () => [...document.querySelectorAll<HTMLAnchorElement>("a[data-row]")];
const searchBox = () => document.querySelector<HTMLInputElement>("input[data-search]");

const LIST: { keys: string[]; what: string }[] = [
  { keys: ["/"], what: "Jump to the search box" },
  { keys: ["↓", "↑"], what: "Move through the search results (Enter opens one)" },
  { keys: ["?"], what: "Show this list" },
  { keys: ["←", "→"], what: "Previous or next song in live mode (Page Up and Page Down too)" },
  { keys: ["Esc"], what: "Leave live mode or close a window" },
  { keys: ["Ctrl or ⌘", "Z"], what: "Undo in the song editor (add Shift to redo)" },
];

/**
 * Keyboard shortcuts for the whole app: "/" finds the search box, the arrow keys walk the results, and "?"
 * lists them. Nothing here fires while typing in a field, except the arrow keys leaving the search box.
 */
export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const search = searchBox();
        if (el && el === search && e.key === "ArrowDown") {
          const first = rows()[0];
          if (first) {
            e.preventDefault();
            first.focus();
          }
        } else if (el instanceof HTMLAnchorElement && el.hasAttribute("data-row")) {
          const list = rows();
          const at = list.indexOf(el);
          const next = list[at + (e.key === "ArrowDown" ? 1 : -1)];
          e.preventDefault();
          if (next) next.focus();
          else if (e.key === "ArrowUp") search?.focus();
        }
        return;
      }

      if (typing(el)) return;
      if (e.key === "/") {
        const search = searchBox();
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
      } else if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onAsk = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(SHORTCUTS_EVENT, onAsk);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(SHORTCUTS_EVENT, onAsk);
    };
  }, []);

  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={() => setOpen(false)}>
      <dl className="divide-y divide-line">
        {LIST.map((row) => (
          <div key={row.what} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <dt className="min-w-0 flex-1">{row.what}</dt>
            <dd className="flex flex-none items-center gap-1">
              {row.keys.map((k) => (
                <kbd key={k} className="rounded border border-line bg-hover px-1.5 py-0.5 font-mono text-xs">
                  {k}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
