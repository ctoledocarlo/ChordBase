"use client";

import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { usePhone } from "./use-phone";

const MIN_PX = 7;
const MAX_PX = 30;
/** On a phone the text never shrinks below this to fit everything in; the song scrolls instead. */
const PHONE_MIN_PX = 15;

/**
 * Picks the largest text size at which everything fits in the box without
 * scrolling. Children are the columns, laid out side by side.
 */
function fit(el: HTMLElement, size: number | "fit", minPx: number) {
  if (size !== "fit") {
    el.style.fontSize = `${size}px`;
    el.style.overflow = "auto";
    return;
  }
  el.style.overflow = "hidden";
  const fits = (px: number) => {
    el.style.fontSize = `${px}px`;
    return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
  };
  if (fits(MAX_PX)) return;
  let lo = minPx;
  let hi = MAX_PX;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  // Even the smallest size doesn't fit: let it scroll rather than cut text off.
  if (!fits(lo)) el.style.overflow = "auto";
}

/**
 * `size` is "fit" (default) or a fixed size in pixels. Give it a height from
 * its parent (e.g. flex-1 with min-h-0, or an explicit height).
 */
export function FitToScreen({
  size = "fit",
  className,
  children,
  ...rest
}: {
  size?: number | "fit";
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "style" | "className" | "children">) {
  const ref = useRef<HTMLDivElement>(null);
  // On a phone the parts of the song stack in one column and the text stays readable (the song scrolls if it must).
  const phone = usePhone();

  // No dependency list on purpose: re-fit whenever the content changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const minPx = phone ? PHONE_MIN_PX : MIN_PX;
    fit(el, size, minPx);
    const observer = new ResizeObserver(() => fit(el, size, minPx));
    observer.observe(el);
    return () => observer.disconnect();
  });

  return (
    <div
      ref={ref}
      data-fit-area="true"
      className={className}
      // Columns sit side by side, each as wide as its widest line, so no space is wasted between them.
      style={{ display: "flex", flexDirection: phone ? "column" : "row", alignItems: "stretch", columnGap: "1.75em", position: "relative" }}
      {...rest}
    >
      {children}
    </div>
  );
}
