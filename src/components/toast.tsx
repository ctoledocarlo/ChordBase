"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "info" | "success" | "error";

export type ToastOptions = {
  /** A toast with the same id replaces the one already showing, so repeated saves don't pile up. */
  id?: string;
  tone?: Tone;
  /** How long it stays, in milliseconds. */
  ms?: number;
  /** A button inside the toast, such as Undo. */
  action?: { label: string; onClick: () => void };
};

type Item = { key: number; id?: string; text: string; tone: Tone; action?: ToastOptions["action"] };

const ToastContext = createContext<(text: string, options?: ToastOptions) => void>(() => {});

/** Shows a short message in the corner. The same look for every "Saved", "Removed" and "Added" in the app. */
export const useToast = () => useContext(ToastContext);

const TONE_BAR: Record<Tone, string> = {
  info: "border-l-line",
  success: "border-l-[#16a34a]",
  error: "border-l-danger",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((key: number) => {
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    setItems((list) => list.filter((i) => i.key !== key));
  }, []);

  const toast = useCallback(
    (text: string, options: ToastOptions = {}) => {
      const key = ++counter.current;
      const tone = options.tone ?? "info";
      const ms = options.ms ?? (options.action ? 7000 : tone === "error" ? 6000 : 3500);
      setItems((list) => {
        const same = options.id ? list.find((i) => i.id === options.id) : undefined;
        if (same) {
          clearTimeout(timers.current.get(same.key));
          timers.current.delete(same.key);
        }
        return [...list.filter((i) => i !== same).slice(-3), { key, id: options.id, text, tone, action: options.action }];
      });
      timers.current.set(
        key,
        setTimeout(() => dismiss(key), ms),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Above the bottom bars that phones have on the song and setlist pages. */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-col gap-2 sm:max-w-sm max-lg:bottom-[4.75rem]">
        {items.map((t) => (
          <div
            key={t.key}
            role={t.tone === "error" ? "alert" : "status"}
            className={`anim-rise pointer-events-auto flex items-center gap-3 rounded-lg border border-l-4 border-line bg-surface px-3 py-2 text-sm shadow-lg ${TONE_BAR[t.tone]}`}
          >
            <span className="min-w-0 flex-1">{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="flex-none rounded px-1.5 py-0.5 font-medium underline hover:bg-hover"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.key);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
