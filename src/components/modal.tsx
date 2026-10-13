"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

/**
 * A dialog centred over the page. It uses the browser's own dialog element,
 * so focus stays inside it and Esc closes it. It is rendered at the top level
 * of the page so the layout around the button that opened it can't push it
 * off-centre. Content is only rendered while it is open, so each opening starts fresh.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const host = useSyncExternalStore(
    () => () => {},
    () => document.body,
    () => null,
  );

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open, host]);

  // Keep the page behind the dialog from scrolling while it is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!host) return null;

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-3rem)] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex"
      onClose={onClose}
      // The page's keyboard shortcuts (such as undo) shouldn't fire while typing in a dialog.
      onKeyDown={(e) => e.stopPropagation()}
      // A click on the dimmed area outside the box lands on the dialog itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <header className="flex items-center justify-between gap-4 border-b border-line py-3.5 pr-4 pl-6">
            <h2 id="modal-title" className="text-[1.0625rem] font-semibold tracking-tight">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="btn btn-quiet btn-icon">
              <CloseIcon />
            </button>
          </header>
          <div className="overflow-y-auto p-6">{children}</div>
        </>
      )}
    </dialog>,
    host,
  );
}
