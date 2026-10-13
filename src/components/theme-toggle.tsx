"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";

const root = () => document.documentElement;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(root(), { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Light by default; the choice is remembered in localStorage. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => root().classList.contains("dark"),
    () => false,
  );

  function toggle() {
    const next = !dark;
    root().classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Storage unavailable; the choice just won't be remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-quiet btn-icon"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
