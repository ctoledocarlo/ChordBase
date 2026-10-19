"use client";

import type { ReactNode } from "react";

/** A labelled control, in the style used all over Practice. */
export function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  );
}

/** A row of buttons where exactly one is chosen. */
export function Pills<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Control label={label}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`btn min-w-9 px-2.5 py-1 text-[0.8125rem] ${o.value === value ? "btn-primary" : ""}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Control>
  );
}

/** Everything a widget is made of sits in one of these. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`not-prose my-6 space-y-4 rounded-xl border border-line bg-surface p-3 sm:p-4 ${className}`}>{children}</div>;
}

export function SoundSwitch({ sound, onChange }: { sound: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={sound} onChange={(e) => onChange(e.target.checked)} />
      Sound
    </label>
  );
}

export type Chip = { top?: string; main: string; bottom?: string; tone?: "root" | "note" | "now" };

/** A row of small cards, one per note: where it is in the scale or chord, its name, and the finger. */
export function Chips({ items }: { items: Chip[] }) {
  return (
    <ol className="flex flex-wrap gap-1.5">
      {items.map((c, i) => (
        <li
          key={i}
          className={`flex min-w-11 flex-col items-center rounded-md border px-1.5 py-1 text-center transition-colors ${
            c.tone === "now" ? "border-[#16a34a] bg-[#16a34a]/15" : c.tone === "root" ? "border-[#ea580c] bg-[#ea580c]/10" : "border-line"
          }`}
        >
          <span className="h-3.5 text-[0.625rem] leading-3.5 text-muted">{c.top ?? ""}</span>
          <span className="font-mono text-sm font-semibold leading-5">{c.main}</span>
          <span className="h-3.5 text-[0.625rem] leading-3.5 text-muted">{c.bottom ?? ""}</span>
        </li>
      ))}
    </ol>
  );
}

/** A big "how to" button: Play, Next... */
export function ActionButton({ children, onClick, primary = false, disabled = false }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`btn px-3 py-1.5 ${primary ? "btn-primary" : ""}`}>
      {children}
    </button>
  );
}
