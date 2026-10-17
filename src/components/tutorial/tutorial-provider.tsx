"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { tutorialById, type Tutorial } from "./tutorials";

// ---- which tutorials have been finished (remembered on this device) ---------------------------

const DONE_KEY = "chordbase.tutorialsDone";
const listeners = new Set<() => void>();

function readDone(): string {
  try {
    return localStorage.getItem(DONE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function markDone(id: string) {
  try {
    const done = new Set<string>(JSON.parse(readDone()));
    done.add(id);
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  } catch {
    // Storage unavailable; the tick just won't be remembered.
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Ids of the tutorials finished on this device. */
export function useFinishedTutorials(): ReadonlySet<string> {
  const raw = useSyncExternalStore(subscribe, readDone, () => "[]");
  return useMemo(() => {
    try {
      return new Set<string>(JSON.parse(raw));
    } catch {
      return new Set<string>();
    }
  }, [raw]);
}

// ---- running a tutorial -----------------------------------------------------------------------

type Run = { id: string; index: number };

type TutorialApi = {
  /** Start a tutorial. It ends if the person goes to another page. */
  start: (id: string) => void;
  stop: () => void;
  running: boolean;
};

const Ctx = createContext<TutorialApi>({ start: () => {}, stop: () => {}, running: false });
export const useTutorial = () => useContext(Ctx);

/** The first element carrying this name that can be seen (a page can have a phone version and a desktop version). */
function visibleTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

const PAD = 6;
const CARD_W = 352;
const GAP = 14;
const MARGIN = 12;

type Spot = { top: number; left: number; width: number; height: number };

/** Runs tutorials: dims the page, lights up the thing being explained, and shows the step. */
export function TutorialProvider({ children, openSidebar }: { children: ReactNode; openSidebar: (open: boolean) => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const start = useCallback((id: string) => setRun({ id, index: 0 }), []);
  const stop = useCallback(() => setRun(null), []);
  const api = useMemo(() => ({ start, stop, running: run !== null }), [start, stop, run]);

  const tutorial = run ? tutorialById(run.id) : undefined;

  return (
    <Ctx.Provider value={api}>
      {children}
      {run && tutorial && (
        <Overlay
          key={run.id}
          tutorial={tutorial}
          index={run.index}
          openSidebar={openSidebar}
          onIndex={(index) => setRun((r) => (r ? { ...r, index } : r))}
          onEnd={() => setRun(null)}
          onFinish={() => {
            markDone(tutorial.id);
            setRun(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/** Ends a running tutorial if the person moves to another page, since what it points at is gone. */
export function TutorialRouteWatcher() {
  const pathname = usePathname();
  const { stop, running } = useTutorial();
  const first = useRef(pathname);
  useEffect(() => {
    if (running && pathname !== first.current) stop();
    first.current = pathname;
  }, [pathname, running, stop]);
  return null;
}

function Overlay({
  tutorial,
  index,
  openSidebar,
  onIndex,
  onEnd,
  onFinish,
}: {
  tutorial: Tutorial;
  index: number;
  openSidebar: (open: boolean) => void;
  onIndex: (index: number) => void;
  onEnd: () => void;
  onFinish: () => void;
}) {
  const step = tutorial.steps[index];
  const last = index === tutorial.steps.length - 1;
  const [spot, setSpot] = useState<Spot | null>(null);
  const [card, setCard] = useState({ w: CARD_W, h: 220 });
  const [view, setView] = useState({ w: 1024, h: 768 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const scrolled = useRef<string | null>(null);
  // The step whose target has been looked for at least once, so "not on screen" isn't flashed before the search.
  const [measured, setMeasured] = useState(-1);

  // Where the thing being explained is, kept up to date while it moves (scrolling, the sidebar sliding in).
  useEffect(() => {
    // On a phone the page options are a drawer; open it for steps about them, close it otherwise.
    openSidebar(Boolean(step.sidebar));
    window.dispatchEvent(new CustomEvent("chordbase:tour-rail", { detail: Boolean(step.rail) }));
    scrolled.current = null;

    const measure = () => {
      setView({ w: window.innerWidth, h: window.innerHeight });
      setMeasured(index);
      const el = step.target ? visibleTarget(step.target) : null;
      if (!el) {
        setSpot((s) => (s === null ? s : null));
        return;
      }
      if (scrolled.current !== `${index}`) {
        scrolled.current = `${index}`;
        el.scrollIntoView({ block: "center", inline: "nearest" });
      }
      const r = el.getBoundingClientRect();
      const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      setSpot((s) => (s && s.top === next.top && s.left === next.left && s.width === next.width && s.height === next.height ? s : next));
    };

    const first = setTimeout(measure, step.sidebar || step.rail ? 320 : 30);
    const timer = setInterval(measure, 150);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [index, step, openSidebar]);

  // Leaving the tutorial puts the page back as it was.
  useEffect(
    () => () => {
      openSidebar(false);
      window.dispatchEvent(new CustomEvent("chordbase:tour-rail", { detail: false }));
    },
    [openSidebar],
  );

  // The card's own size, for placing it (it grows and shrinks with each step's text).
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const update = () => {
      const b = el.getBoundingClientRect();
      setCard((c) => (Math.abs(b.height - c.h) > 1 || Math.abs(b.width - c.w) > 1 ? { w: b.width, h: b.height } : c));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // New step: say it to screen readers, and land focus on Next so Enter or Space moves on.
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEnd();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (last) onFinish();
        else onIndex(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (index > 0) onIndex(index - 1);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [index, last, onEnd, onFinish, onIndex]);

  // The card: docked along the bottom on a phone, beside the thing being explained on a larger screen.
  const phone = view.w < 640;
  let place: { top?: number; left?: number; right?: number; bottom?: number; width?: number } = {};
  if (phone) {
    place = { left: 12, right: 12, bottom: 12 };
  } else if (!spot) {
    place = { top: Math.max(MARGIN, (view.h - card.h) / 2), left: Math.max(MARGIN, (view.w - CARD_W) / 2), width: CARD_W };
  } else {
    const clampTop = (t: number) => Math.min(Math.max(MARGIN, t), view.h - card.h - MARGIN);
    const clampLeft = (l: number) => Math.min(Math.max(MARGIN, l), view.w - CARD_W - MARGIN);
    const midTop = clampTop(spot.top + spot.height / 2 - card.h / 2);
    const midLeft = clampLeft(spot.left + spot.width / 2 - CARD_W / 2);
    if (spot.left + spot.width + GAP + CARD_W <= view.w - MARGIN) place = { top: midTop, left: spot.left + spot.width + GAP, width: CARD_W };
    else if (spot.left - GAP - CARD_W >= MARGIN) place = { top: midTop, left: spot.left - GAP - CARD_W, width: CARD_W };
    else if (spot.top + spot.height + GAP + card.h <= view.h - MARGIN) place = { top: spot.top + spot.height + GAP, left: midLeft, width: CARD_W };
    else if (spot.top - GAP - card.h >= MARGIN) place = { top: spot.top - GAP - card.h, left: midLeft, width: CARD_W };
    else place = { top: view.h - card.h - MARGIN, left: view.w - CARD_W - MARGIN, width: CARD_W };
  }

  // On a phone the card covers the bottom, so keep the lit-up thing above it.
  useEffect(() => {
    if (!phone || !spot) return;
    const free = view.h - card.h - 24;
    if (spot.top + spot.height > free) window.scrollBy({ top: spot.top + spot.height - free + 8 });
    // Only once per step and when the card first has its height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, index, card.h, spot === null]);

  const goto = (i: number) => onIndex(Math.min(Math.max(0, i), tutorial.steps.length - 1));

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={tutorial.title}>
      {/* Blocks clicks on the page behind, so nothing is pressed by accident while reading. */}
      <div className="absolute inset-0" aria-hidden />
      {spot ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl ring-2 ring-accent transition-[top,left,width,height] duration-200"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, boxShadow: "0 0 0 100vmax rgba(8, 10, 20, 0.62)" }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 bg-[rgba(8,10,20,0.62)]" />
      )}

      <div
        ref={cardRef}
        className="fixed z-10 rounded-xl border border-line bg-background p-4 text-foreground shadow-2xl"
        style={{ ...place, maxWidth: phone ? undefined : "calc(100vw - 24px)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-muted">
            {tutorial.title} · Step {index + 1} of {tutorial.steps.length}
          </p>
          <button type="button" onClick={onEnd} className="btn btn-quiet btn-icon -mr-1.5 -mt-1.5" aria-label="End tutorial" title="End tutorial (Esc)">
            <span aria-hidden className="text-base leading-none">×</span>
          </button>
        </div>

        <h2 className="mt-1 text-base font-semibold tracking-tight" aria-live="polite">
          {step.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
        {step.target && !spot && measured === index && (
          <p className="mt-2 rounded-md bg-hover px-2.5 py-1.5 text-xs text-muted">This isn&apos;t on screen right now, so it can&apos;t be pointed out.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Steps">
          {tutorial.steps.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => goto(i)}
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              aria-current={i === index ? "step" : undefined}
              className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-accent" : i < index ? "w-2 bg-foreground/40 hover:bg-foreground/60" : "w-2 bg-line hover:bg-foreground/40"}`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onEnd} className="text-sm text-muted underline hover:text-foreground">
            End
          </button>
          {step.optional && !last && (
            <button type="button" onClick={() => goto(index + 1)} className="text-sm text-muted underline hover:text-foreground">
              Skip step
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className="btn" onClick={() => goto(index - 1)} disabled={index === 0}>
            Back
          </button>
          <button ref={nextRef} type="button" className="btn btn-primary" onClick={() => (last ? onFinish() : goto(index + 1))}>
            {last ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
