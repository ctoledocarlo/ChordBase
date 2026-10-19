"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { isBlack, keyName } from "@/lib/theory/notes";

/** How a key is shown: the colour says what the note is for, the label and finger sit on the key. */
export type KeyMark = {
  /** root: the note the thing is built on. note: a note that belongs. soft: a quieter note. good: right. bad: wrong. */
  tone: "root" | "note" | "soft" | "good" | "bad";
  /** Words under the key: a note name, or a number like 3 for "the third note". */
  label?: string;
  /** Which finger plays it, 1 (thumb) to 5 (little finger). */
  finger?: number;
};

const WHITE_W = 24;
const WHITE_H = 120;
const BLACK_W = 14;
const BLACK_H = 74;

const FILL: Record<KeyMark["tone"], string> = {
  root: "#ea580c",
  note: "#2563eb",
  soft: "#93c5fd",
  good: "#16a34a",
  bad: "#dc2626",
};
/** Text that reads on each fill. */
const INK: Record<KeyMark["tone"], string> = { root: "#fff", note: "#fff", soft: "#172554", good: "#fff", bad: "#fff" };

const nextWhite = (m: number) => (isBlack(m) ? m + 1 : m);
const prevWhite = (m: number) => (isBlack(m) ? m - 1 : m);

/**
 * A piano keyboard drawn to scale. Press a key (or tab to it and press Enter) to hear it. Keys can be coloured
 * and given finger numbers and labels, to show scales, chords and where the hands go. On a narrow screen the
 * keyboard scrolls sideways instead of squashing the keys.
 */
export function Keyboard({
  from = 60,
  to = 83,
  marks = {},
  names = "none",
  flats = false,
  onPress,
  ariaLabel = "Piano keyboard",
  minKeyWidth = 22,
  className = "",
}: {
  /** The lowest and highest key, by number (60 is middle C). Widened to whole white keys. */
  from?: number;
  to?: number;
  marks?: Record<number, KeyMark>;
  /** Show note names on the keys: none, only on white keys, or on all of them. */
  names?: "none" | "white" | "all";
  /** Name black keys with flats (Db) instead of sharps (C#). */
  flats?: boolean;
  onPress?: (midi: number) => void;
  ariaLabel?: string;
  minKeyWidth?: number;
  className?: string;
}) {
  const low = prevWhite(from);
  const high = nextWhite(to);
  const keys = useMemo(() => Array.from({ length: high - low + 1 }, (_, i) => low + i), [low, high]);
  const whites = keys.filter((m) => !isBlack(m));
  const whiteIndex = new Map(whites.map((m, i) => [m, i]));
  const width = whites.length * WHITE_W;

  const [pressed, setPressed] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const flash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(flash.current), []);

  const press = (midi: number) => {
    setPressed(midi);
    clearTimeout(flash.current);
    flash.current = setTimeout(() => setPressed(null), 220);
    onPress?.(midi);
  };

  // Keep the marked keys in view when the keyboard has to scroll (a narrow phone).
  const scroller = useRef<HTMLDivElement>(null);
  const markedKey = Object.keys(marks).join(",");
  useEffect(() => {
    const box = scroller.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const marked = Object.keys(marks).map(Number).filter((m) => whiteIndex.has(prevWhite(m)));
    if (marked.length === 0) return;
    const first = whiteIndex.get(prevWhite(Math.min(...marked))) ?? 0;
    box.scrollTo({ left: Math.max(0, (first * WHITE_W * box.scrollWidth) / width - 24), behavior: "smooth" });
    // marks changes identity every render; what matters is which keys are marked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markedKey, width]);

  function onKeyDown(e: KeyboardEvent<SVGGElement>, midi: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      press(midi);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = Math.min(high, Math.max(low, midi + (e.key === "ArrowRight" ? 1 : -1)));
      setFocus(next);
      (e.currentTarget.ownerSVGElement?.querySelector(`[data-midi="${next}"]`) as SVGGElement | null)?.focus();
    }
  }

  function draw(midi: number, black: boolean) {
    const mark = marks[midi];
    const wi = black ? (whiteIndex.get(midi - 1) ?? 0) : (whiteIndex.get(midi) ?? 0);
    const x = black ? (wi + 1) * WHITE_W - BLACK_W / 2 : wi * WHITE_W;
    const w = black ? BLACK_W : WHITE_W;
    const h = black ? BLACK_H : WHITE_H;
    const down = pressed === midi;
    const fill = down ? FILL.good : mark ? FILL[mark.tone] : black ? "#18181b" : "#fafafa";
    const ink = down ? "#fff" : mark ? INK[mark.tone] : black ? "#fafafa" : "#3f3f46";
    const cx = x + w / 2;
    const text = mark?.label ?? (names === "all" || (names === "white" && !black) ? keyName(midi, flats).replace(/\d+$/, "") : undefined);
    const name = `${keyName(midi, flats)}${mark?.label ? `, ${mark.label}` : ""}${mark?.finger ? `, finger ${mark.finger}` : ""}`;
    const middleC = midi === 60 && !text;

    return (
      <g
        key={midi}
        data-midi={midi}
        role="button"
        aria-label={name}
        tabIndex={(focus ?? low) === midi ? 0 : -1}
        onFocus={() => setFocus(midi)}
        onKeyDown={(e) => onKeyDown(e, midi)}
        onPointerDown={(e) => {
          e.preventDefault();
          press(midi);
        }}
        className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[#2563eb] [&:focus-visible>rect]:stroke-[2.5]"
      >
        <rect x={x} y={0} width={w} height={h} rx={3} fill={fill} stroke={black ? "#09090b" : "#a1a1aa"} strokeWidth={1} style={{ transition: "fill 120ms" }} />
        {mark?.finger !== undefined && (
          <>
            <circle cx={cx} cy={h - (black ? 30 : 42)} r={black ? 7 : 8.5} fill="#fff" />
            <text x={cx} y={h - (black ? 30 : 42)} textAnchor="middle" dominantBaseline="central" fontSize={black ? 9.5 : 11} fontWeight={700} fill="#111827">
              {mark.finger}
            </text>
          </>
        )}
        {text && (
          <text x={cx} y={h - (black ? 11 : 12)} textAnchor="middle" fontSize={text.length > 2 ? 8 : 9.5} fontWeight={600} fill={ink} pointerEvents="none">
            {text.replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭")}
          </text>
        )}
        {middleC && <circle cx={cx} cy={h - 12} r={2.6} fill="#a1a1aa" />}
      </g>
    );
  }

  return (
    <div ref={scroller} className={`overflow-x-auto overscroll-x-contain rounded-lg ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${WHITE_H}`}
        role="group"
        aria-label={ariaLabel}
        className="block w-full select-none touch-manipulation"
        style={{ minWidth: whites.length * minKeyWidth }}
      >
        {keys.filter((m) => !isBlack(m)).map((m) => draw(m, false))}
        {keys.filter((m) => isBlack(m)).map((m) => draw(m, true))}
      </svg>
    </div>
  );
}

/** Builds marks for a list of keys: the first is the root, the rest are notes of the shape. */
export function marksFor(
  midis: number[],
  options: { labels?: string[]; fingers?: number[]; rootFirst?: boolean; tone?: KeyMark["tone"] } = {},
): Record<number, KeyMark> {
  const out: Record<number, KeyMark> = {};
  midis.forEach((m, i) => {
    out[m] = {
      tone: options.rootFirst && i === 0 ? "root" : (options.tone ?? "note"),
      label: options.labels?.[i],
      finger: options.fingers?.[i],
    };
  });
  return out;
}
