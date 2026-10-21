import type { ReactNode } from "react";
import { ChevronIcon } from "./icons";

/** A heading that opens and closes its section, so the sidebar stays short until you need something. */
export function Fold({ title, hint, tour, defaultOpen = false, children }: { title: string; hint?: string; tour?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details data-tour={tour} open={defaultOpen} className="group border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
        <span className="flex-none text-muted transition-transform group-open:rotate-0 -rotate-90">
          <ChevronIcon />
        </span>
        <span className="min-w-0 flex-1">{title}</span>
        {hint && <span className="flex-none text-xs font-normal text-muted">{hint}</span>}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}
