"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** How long to wait after the last keystroke before searching. */
const DELAY_MS = 250;

/**
 * The search box at the top of every main page. It searches as you type: the page reloads
 * with `?q=...` a moment after you stop, with no need to press Enter.
 */
export function SearchForm({
  action,
  q = "",
  label,
  placeholder,
  disabled = false,
  keep = [],
  className = "mt-5",
  tourId,
}: {
  /** The page to search, e.g. "/". */
  action: string;
  q?: string;
  label: string;
  placeholder: string;
  disabled?: boolean;
  /** Other query values to carry along when searching (such as the filters), as [name, value]. */
  keep?: [string, string][];
  className?: string;
  /** Marks the box for the tutorials. */
  tourId?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [seenQ, setSeenQ] = useState(q);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The last search we sent, so a change that came from elsewhere (like "Clear all") can be told apart.
  const [sent, setSent] = useState(q);

  // If the page's search text changes from somewhere else, show it here too.
  if (q !== seenQ) {
    setSeenQ(q);
    if (q !== sent) {
      setSent(q);
      setValue(q);
    }
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const keepKey = JSON.stringify(keep);

  function search(text: string) {
    const params = new URLSearchParams(JSON.parse(keepKey) as [string, string][]);
    const trimmed = text.trim();
    if (trimmed) params.set("q", trimmed);
    if (trimmed === sent) return;
    setSent(trimmed);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${action}?${qs}` : action));
  }

  return (
    <form
      role="search"
      data-tour={tourId}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        search(value);
      }}
    >
      <input
        type="search"
        data-search=""
        name="q"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => search(e.target.value), DELAY_MS);
        }}
        placeholder={placeholder}
        aria-label={label}
        disabled={disabled}
        autoComplete="off"
        className="field disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}
