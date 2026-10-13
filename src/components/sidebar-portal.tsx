"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The element in the app frame where each page puts its own actions. */
export const SIDEBAR_SLOT_ID = "page-sidebar-slot";

/** Renders its children inside the app sidebar (once the frame has mounted). */
export function SidebarPortal({ children }: { children: ReactNode }) {
  const slot = useSyncExternalStore(
    () => () => {},
    () => document.getElementById(SIDEBAR_SLOT_ID),
    () => null,
  );
  return slot ? createPortal(children, slot) : null;
}
