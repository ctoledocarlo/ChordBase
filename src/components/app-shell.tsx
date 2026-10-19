"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { BackLink } from "./back-link";
import { CloseIcon, MenuIcon } from "./icons";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { Logo } from "./logo";
import { OPEN_SIDEBAR_EVENT, SIDEBAR_SLOT_ID } from "./sidebar-portal";
import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampSidebar,
  saveSidebarWidth,
  useSidebarWidth,
} from "./sidebar-width";
import { ThemeToggle } from "./theme-toggle";
import { ToastProvider } from "./toast";
import { HelpMenu } from "./tutorial/help-menu";
import { TutorialProvider, TutorialRouteWatcher } from "./tutorial/tutorial-provider";

/**
 * App frame: a navbar that stays at the top, and a sidebar that each page
 * fills with its own actions. On small screens the sidebar is a drawer.
 */
export function AppShell({ account, children }: { account: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Pages with a button of their own for the sidebar (the Filters button on Songs) ask for it to open.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SIDEBAR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SIDEBAR_EVENT, onOpen);
  }, []);

  const savedWidth = useSidebarWidth();
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const width = dragWidth ?? savedWidth;

  function onHandleDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width };
  }
  function onHandleMove(e: PointerEvent<HTMLDivElement>) {
    if (drag.current) setDragWidth(clampSidebar(drag.current.startWidth + e.clientX - drag.current.startX));
  }
  function onHandleUp() {
    if (drag.current && dragWidth !== null) saveSidebarWidth(dragWidth);
    drag.current = null;
    setDragWidth(null);
  }
  function onHandleKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") saveSidebarWidth(width - step);
    else if (e.key === "ArrowRight") saveSidebarWidth(width + step);
    else if (e.key === "Home") saveSidebarWidth(SIDEBAR_MIN);
    else if (e.key === "End") saveSidebarWidth(SIDEBAR_MAX);
    else return;
    e.preventDefault();
  }

  return (
    <TutorialProvider openSidebar={setOpen}>
    <ToastProvider>
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
    >
      Skip to content
    </a>
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-background">
        <div className="flex h-14 items-stretch gap-3 px-3 sm:gap-6 sm:px-4 lg:px-6">
          <Link href="/" aria-label="ChordBase, home" className="flex items-center text-base font-semibold tracking-tight">
            <Logo size={26} iconOnlyOnPhone />
          </Link>
          <Suspense fallback={null}>
            <MainNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Suspense fallback={null}>
              <HelpMenu />
            </Suspense>
            <div data-tour="account">{account}</div>
            <span data-tour="theme" className="flex">
              <ThemeToggle />
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <Suspense fallback={null}>
          <SidebarGate>
          <PageOptionsBar onOpen={() => setOpen(true)} />

          {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={close} aria-hidden />}

          <aside
            aria-label="Page options"
            data-tour="sidebar"
            style={{ "--sidebar-w": `${width}px` } as CSSProperties}
            className={`fixed inset-y-0 left-0 z-40 w-[min(20rem,85vw)] border-r border-line bg-background transition-transform lg:sticky lg:top-14 lg:z-auto lg:h-[calc(100vh-3.5rem)] lg:w-[var(--sidebar-w)] lg:shrink-0 lg:translate-x-0 lg:transition-none ${
              open ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="h-full space-y-5 overflow-y-auto p-3">
              <div className="flex items-center justify-between lg:hidden">
                <span className="text-sm font-medium">Page options</span>
                <button type="button" onClick={close} aria-label="Close" className="btn btn-quiet btn-icon">
                  <CloseIcon />
                </button>
              </div>
              <PageBack />
              <div id={SIDEBAR_SLOT_ID} className="space-y-6" />
            </div>

            {/* Drag the edge to change the width; double-click to go back to the default. */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              aria-valuemin={SIDEBAR_MIN}
              aria-valuemax={SIDEBAR_MAX}
              aria-valuenow={width}
              tabIndex={0}
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              onDoubleClick={() => saveSidebarWidth(SIDEBAR_DEFAULT)}
              onKeyDown={onHandleKey}
              className={`absolute inset-y-0 -right-1 hidden w-2 cursor-col-resize touch-none select-none hover:bg-accent/30 lg:block ${
                dragWidth !== null ? "bg-accent/40" : ""
              }`}
            />
          </aside>
          </SidebarGate>
        </Suspense>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 outline-none sm:py-8 lg:px-10">
          <Suspense fallback={null}>
            <PageTopBack />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
    <Suspense fallback={null}>
      <TutorialRouteWatcher />
    </Suspense>
    <KeyboardShortcuts />
    </ToastProvider>
    </TutorialProvider>
  );
}

/** The "Page options" bar that opens the sidebar on phones. Songs has its own Filters button instead. */
function PageOptionsBar({ onOpen }: { onOpen: () => void }) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="border-b border-line px-3 py-1.5 sm:px-4 lg:hidden">
      <button type="button" onClick={onOpen} className="btn">
        <MenuIcon /> {pathname.startsWith("/practice") ? "Lessons" : "Page options"}
      </button>
    </div>
  );
}

function MainNav() {
  const pathname = usePathname();
  const items = [
    { href: "/setlists", label: "Setlists", soon: false, active: pathname.startsWith("/setlists") },
    { href: "/", label: "Songs", soon: false, active: pathname === "/" || pathname.startsWith("/songs") },
    { href: "/practice", label: "Practice", soon: false, active: pathname.startsWith("/practice") },
  ];
  return (
    <nav aria-label="Main" data-tour="nav" className="flex items-stretch gap-4 text-sm sm:gap-5">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={`-mb-px flex items-center border-b-2 ${
            it.active
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {it.label}
          {it.soon && (
            <span className="ml-1.5 hidden self-center rounded-full border border-line px-1.5 text-[0.6875rem] leading-4 text-muted md:inline">
              Soon
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Where "Back" goes when there is no earlier page. */
function backFallback(pathname: string): string {
  const edit = pathname.match(/^\/songs\/([^/]+)\/edit$/);
  if (edit) return `/songs/${edit[1]}`;
  if (pathname.startsWith("/practice/")) return "/practice";
  return pathname.startsWith("/setlists/") ? "/setlists" : "/";
}

/** The way back, shown at the top of the sidebar on pages that have one. */
function PageBack() {
  const pathname = usePathname();
  // The song list is a main page, so there is nowhere "back" to go from it.
  return pathname === "/" ? null : <BackLink fallback={backFallback(pathname)} />;
}

/** Pages without a sidebar (the import page) show the way back at the top of the page instead. */
function PageTopBack() {
  const pathname = usePathname();
  return pathname === "/songs/import" ? <BackLink fallback="/" /> : null;
}

/** Only pages that put something in the sidebar get one: the song pages and the editor. */
function SidebarGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname === "/" ||
    (pathname.startsWith("/songs/") && pathname !== "/songs/import") ||
    pathname.startsWith("/setlists/") ||
    pathname.startsWith("/practice") ? (
    <>{children}</>
  ) : null;
}
