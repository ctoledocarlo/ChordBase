"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { BackLink } from "./back-link";
import { CloseIcon, MenuIcon } from "./icons";
import { Logo } from "./logo";
import { SIDEBAR_SLOT_ID } from "./sidebar-portal";
import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampSidebar,
  saveSidebarWidth,
  useSidebarWidth,
} from "./sidebar-width";
import { ThemeToggle } from "./theme-toggle";

/**
 * App frame: a navbar that stays at the top, and a sidebar that each page
 * fills with its own actions. On small screens the sidebar is a drawer.
 */
export function AppShell({ account, children }: { account: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

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
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-background">
        <div className="flex h-14 items-stretch gap-6 px-4 lg:px-6">
          <Link href="/" className="flex items-center text-base font-semibold tracking-tight">
            <Logo size={26} />
          </Link>
          <Suspense fallback={null}>
            <MainNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            {account}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <Suspense fallback={null}>
          <SidebarGate>
          <div className="border-b border-line px-4 py-2 lg:hidden">
            <button type="button" onClick={() => setOpen(true)} className="btn">
              <MenuIcon /> Page options
            </button>
          </div>

          {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={close} aria-hidden />}

          <aside
            aria-label="Page options"
            style={{ "--sidebar-w": `${width}px` } as CSSProperties}
            className={`fixed inset-y-0 left-0 z-40 w-[var(--sidebar-w)] border-r border-line bg-background transition-transform lg:sticky lg:top-14 lg:z-auto lg:h-[calc(100vh-3.5rem)] lg:shrink-0 lg:translate-x-0 lg:transition-none ${
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

        <main className="min-w-0 flex-1 px-4 py-8 lg:px-10">
          <Suspense fallback={null}>
            <PageTopBack />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}

function MainNav() {
  const pathname = usePathname();
  const items = [
    { href: "/setlists", label: "Setlists", soon: false, active: pathname.startsWith("/setlists") },
    { href: "/", label: "Songs", soon: false, active: pathname === "/" || pathname.startsWith("/songs") },
  ];
  return (
    <nav aria-label="Main" className="flex items-stretch gap-5 text-sm">
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
  return pathname === "/" || (pathname.startsWith("/songs/") && pathname !== "/songs/import") || pathname.startsWith("/setlists/") ? <>{children}</> : null;
}
