"use client";

import { useEffect, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Whether this device has a connection right now. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/**
 * Makes the app work without a connection: registers the service worker (which keeps the app and the pages that
 * were opened), and shows a bar while the device is offline. Changes made meanwhile are kept on the screen and
 * sent when the connection returns (each part of the app that saves does that for itself).
 */
export function OfflineSupport() {
  const online = useOnline();

  useEffect(() => {
    // Only in the real app: in development the service worker would hold on to old code.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  if (online) return null;
  return (
    <p role="status" data-app-chrome className="border-b border-[#d97706] bg-[#d97706]/15 px-4 py-2 text-center text-sm">
      You&apos;re offline. The pages you have opened still work, and what you change is kept on this device and sent when the connection is back.
    </p>
  );
}

/** Asks the service worker to keep these pages for offline use. Resolves with how many it kept (0 if it isn't running). */
export async function keepForOffline(urls: string[]): Promise<number> {
  if (!("serviceWorker" in navigator)) return 0;
  const registration = await navigator.serviceWorker.getRegistration();
  const worker = registration?.active ?? navigator.serviceWorker.controller;
  if (!worker) return 0;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(0), 20_000);
    channel.port1.onmessage = (e: MessageEvent<{ kept?: number }>) => {
      clearTimeout(timer);
      resolve(e.data?.kept ?? 0);
    };
    worker.postMessage({ type: "cache-urls", urls }, [channel.port2]);
  });
}

/** Forgets every page kept for offline use. Done when signing out, so the next person on a shared device finds nothing. */
export async function clearOfflineData(): Promise<void> {
  if (!("caches" in window)) return;
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith("chordbase-")).map((n) => caches.delete(n)));
}
