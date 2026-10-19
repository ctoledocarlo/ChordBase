"use client";

import { useEffect, useState } from "react";

/**
 * True once nothing has moved, been tapped or been typed for `ms`, while `enabled`. Any of those brings it back to false.
 * It also stays false while a field inside an element marked `data-no-autohide` has focus (someone typing a chat message),
 * or the corner menu (`data-corner-menu`) is open.
 */
export function useIdle(ms: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const active = document.activeElement;
        const typing = !!active && !!active.closest("[data-no-autohide]") && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
        // An open menu (such as Display) is being used too.
        const menuOpen = !!document.querySelector("[data-corner-menu] details[open]");
        if (typing || menuOpen) arm();
        else setIdle(true);
      }, ms);
    };
    const wake = () => {
      setIdle(false);
      arm();
    };
    const events = ["pointermove", "pointerdown", "keydown", "focusin", "wheel", "touchstart"] as const;
    for (const e of events) document.addEventListener(e, wake, { passive: true });
    arm();
    return () => {
      clearTimeout(timer);
      for (const e of events) document.removeEventListener(e, wake);
      setIdle(false);
    };
  }, [ms, enabled]);

  return enabled && idle;
}
