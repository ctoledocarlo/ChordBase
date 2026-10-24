"use client";

import { useRef, type ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

/** On a phone the account links (Team, Profile, Log out) sit in one small menu, which closes when one is chosen. */
export function AccountMenu({ badge = 0, who = null, children }: { badge?: number; /** Who is signed in, shown at the top of the menu. */ who?: string | null; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={menu} className="relative md:hidden">
      <summary aria-label="Account" className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 text-sm hover:bg-hover sm:px-2">
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="sm:hidden">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
        </svg>
        <span className="max-sm:hidden">Account</span>
        {badge > 0 && (
          <span aria-label={`${badge} waiting`} className="rounded-full bg-accent px-1.5 py-0.5 text-[0.6875rem] font-medium text-white">
            {badge}
          </span>
        )}
      </summary>
      <div
        className="absolute right-0 top-full z-50 mt-1 flex w-48 flex-col gap-1 rounded-lg border border-line bg-background p-2 text-sm shadow-lg [&_a]:rounded-md [&_a]:px-2 [&_a]:py-2 [&_a:hover]:bg-hover [&_button]:w-full [&_button]:rounded-md [&_button]:px-2 [&_button]:py-2 [&_button]:text-left [&_button]:no-underline [&_button:hover]:bg-hover"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button")) menu.current?.removeAttribute("open");
        }}
      >
        {who && <p className="border-b border-line px-2 pb-2 pt-1 font-medium text-muted">{who}</p>}
        {children}
        <div className="mt-1 flex items-center justify-between border-t border-line px-2 pt-2 sm:hidden">
          <span className="text-muted">Light or dark</span>
          <ThemeToggle />
        </div>
      </div>
    </details>
  );
}
