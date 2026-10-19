import type { ReactNode } from "react";

const ART = {
  songs: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  setlists: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
};

/** What to show instead of a list that has nothing in it: one line of why, and the next thing to do. */
export function EmptyState({
  art,
  title,
  children,
  actions,
}: {
  art: keyof typeof ART;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <svg aria-hidden viewBox="0 0 24 24" className="h-9 w-9 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {ART[art]}
      </svg>
      <p className="mt-3 font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
