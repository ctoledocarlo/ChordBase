"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SHORTCUTS_EVENT } from "../keyboard-shortcuts";
import { Modal } from "../modal";
import { useFinishedTutorials, useTutorial } from "./tutorial-provider";
import {
  PAGE_NAMES,
  TUTORIALS,
  functionTutorialsFor,
  pageKeyFor,
  pageTutorialFor,
  tutorialById,
  type PageKey,
  type Tutorial,
} from "./tutorials";

/** Where to send someone who wants a tutorial that belongs to a page they aren't on. */
const PAGE_LINKS: Record<PageKey, { href: string; label: string }> = {
  songs: { href: "/", label: "Go to Songs" },
  song: { href: "/", label: "Open a song" },
  setlists: { href: "/setlists", label: "Go to Setlists" },
  setlist: { href: "/setlists", label: "Open a setlist" },
  editor: { href: "/songs/new", label: "Open the editor" },
  import: { href: "/songs/import", label: "Go to Import" },
};

/**
 * The one Tutorial button in the navbar. It opens a short menu: the tour of the site, how the page you're
 * on works, and any guides for features on this page. "Browse all" reaches every tutorial from anywhere.
 */
export function HelpMenu() {
  const pathname = usePathname();
  const page = pageKeyFor(pathname);
  const { start, running } = useTutorial();
  const finished = useFinishedTutorials();
  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const site = tutorialById("site")!;
  const here = pageTutorialFor(page);
  const guides = functionTutorialsFor(page);

  function play(t: Tutorial) {
    setOpen(false);
    setBrowse(false);
    // Let the menu or dialog close before the page is dimmed.
    setTimeout(() => start(t.id), 60);
  }

  const item = (t: Tutorial, title = t.title) => (
    <button
      key={t.id}
      type="button"
      role="menuitem"
      onClick={() => play(t)}
      className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{t.summary}</span>
      </span>
      {finished.has(t.id) && (
        <span className="mt-0.5 flex-none text-xs text-muted" title="You've finished this one">
          ✓
        </span>
      )}
    </button>
  );

  return (
    <div ref={box} className="relative" data-tour="help">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={running}
        className="btn btn-quiet px-2 sm:px-2.5"
        title="Tutorials and help"
      >
        <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs font-semibold leading-none">
          ?
        </span>
        <span className="hidden sm:inline">Tutorial</span>
        <span className="sr-only sm:hidden">Tutorial</span>
      </button>

      {open && (
        <div role="menu" aria-label="Tutorials" className="anim-rise absolute right-0 top-full z-40 mt-1.5 w-80 rounded-xl border border-line bg-background p-1.5 shadow-xl max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-[3.75rem] max-sm:mt-0 max-sm:w-auto">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium uppercase tracking-wide text-muted">Start here</p>
          {item(site)}

          {(here || guides.length > 0) && (
            <>
              <p className="px-2.5 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted">On this page</p>
              {here && item(here, "How this page works")}
              {guides.map((g) => item(g))}
            </>
          )}

          <div className="mt-1.5 border-t border-line pt-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setBrowse(true);
              }}
              className="w-full rounded-md px-2.5 py-2 text-left text-sm text-muted hover:bg-hover hover:text-foreground"
            >
              Browse all tutorials…
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(SHORTCUTS_EVENT));
              }}
              className="w-full rounded-md px-2.5 py-2 text-left text-sm text-muted hover:bg-hover hover:text-foreground"
            >
              Keyboard shortcuts
            </button>
          </div>
        </div>
      )}

      <Modal open={browse} title="All tutorials" onClose={() => setBrowse(false)}>
        <div className="space-y-6">
          {(
            [
              ["Tour", TUTORIALS.filter((t) => t.kind === "site")],
              ["How each page works", TUTORIALS.filter((t) => t.kind === "page")],
              ["Guides to specific features", TUTORIALS.filter((t) => t.kind === "function")],
            ] as const
          ).map(([heading, list]) => (
            <section key={heading}>
              <h3 className="mb-2 text-sm font-medium">{heading}</h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {list.map((t) => {
                  // A tutorial for a page you aren't on can't point at anything yet, so offer to go there.
                  const fits = !t.pages || (page !== null && t.pages.includes(page));
                  const target = t.pages?.[0];
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {t.title}
                          {finished.has(t.id) && <span className="ml-1.5 text-xs font-normal text-muted">✓ done</span>}
                        </span>
                        <span className="block text-xs text-muted">
                          {t.summary}
                          {!fits && target && ` · for ${PAGE_NAMES[target]}`}
                        </span>
                      </span>
                      {fits ? (
                        <button type="button" className="btn flex-none" onClick={() => play(t)}>
                          Start
                        </button>
                      ) : (
                        target && (
                          <Link href={PAGE_LINKS[target].href} className="btn flex-none" onClick={() => setBrowse(false)}>
                            {PAGE_LINKS[target].label}
                          </Link>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Modal>
    </div>
  );
}
