"use client";

import { useRef, type ReactNode } from "react";

/** On a phone the account links (Team, Profile, Log out) sit in one small menu, which closes when one is chosen. */
export function AccountMenu({ badge = 0, children }: { badge?: number; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={menu} className="relative md:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-hover">
        Account
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
        {children}
      </div>
    </details>
  );
}
