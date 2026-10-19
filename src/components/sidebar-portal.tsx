"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The element in the app frame where each page puts its own actions. */
export const SIDEBAR_SLOT_ID = "page-sidebar-slot";

/** Pages that show a button for the sidebar themselves (Filters on Songs) dispatch this on window to open it on phones. */
export const OPEN_SIDEBAR_EVENT = "chordbase:open-sidebar";

/** Renders its children inside the app sidebar (once the frame has mounted). */
export function SidebarPortal({ children }: { children: ReactNode }) {
  const slot = useSyncExternalStore(
    () => () => {},
    () => document.getElementById(SIDEBAR_SLOT_ID),
    () => null,
  );
  return slot ? createPortal(children, slot) : null;
}
