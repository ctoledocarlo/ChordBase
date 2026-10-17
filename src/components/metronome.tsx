"use client";

import { useEffect, useRef, useState } from "react";

const MIN_BPM = 30;
const MAX_BPM = 300;
const DEFAULT_BPM = 100;
/** Schedule clicks this far ahead, so they stay on time even if the page is busy. */
const LOOKAHEAD_S = 0.12;

const clampBpm = (n: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));

/** The beats in a bar from a time signature like "4/4" or "6/8" (the top number). */
function beatsOf(signature?: string): number {
  const n = parseInt(signature ?? "", 10);
  return Number.isFinite(n) ? Math.min(12, Math.max(1, n)) : 4;
}

type AudioContextCtor = typeof AudioContext;

/** The clock the beats are counted on, in seconds. The page's own clock, so the light keeps time even if a browser holds the audio back. */
const clock = () => performance.now() / 1000;

/** A short click: higher and louder on the first beat of the bar. */
function click(ctx: AudioContext, at: number, strong: boolean) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = strong ? 1568 : 1046;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(strong ? 0.9 : 0.55, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.06);
}

/**
 * A quiet metronome for the setlist panel: a row of dots, one per beat of the bar, and the one that is
 * sounding lights up (orange on the first beat, blue on the others). Start and the tempo sit beside it;
 * tap tempo, the bar length and the click sound are under "More". Each click is placed ahead of time on the audio timeline at the moment
 * its beat falls due, and the light follows the same beat times, so what you see and what you hear stay
 * together. It starts at the song's tempo, and silent: the click is switched on if wanted.
 */
export function Metronome({ tempo, timeSignature }: { tempo: number | null; timeSignature?: string }) {
  const songBpm = tempo ? clampBpm(tempo) : null;
  const [bpm, setBpm] = useState(songBpm ?? DEFAULT_BPM);
  const [beats, setBeats] = useState(beatsOf(timeSignature));
  // Silent by default: just the light. The click is there for whoever turns it on.
  const [sound, setSound] = useState(false);
  const [running, setRunning] = useState(false);
  // The beat showing now (0 is the first of the bar), or -1 when stopped.
  const [beat, setBeat] = useState(-1);

  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const frame = useRef(0);
  const nextTime = useRef(0);
  const nextBeat = useRef(0);
  const queue = useRef<{ time: number; beat: number }[]>([]);
  // The latest settings, for the timer, which keeps running between renders.
  const live = useRef({ bpm, beats, sound });
  useEffect(() => {
    live.current = { bpm, beats, sound };
  });
  const taps = useRef<number[]>([]);

  function schedule() {
    const c = ctx.current;
    if (!c) return;
    while (nextTime.current < clock() + LOOKAHEAD_S) {
      const b = nextBeat.current;
      // Skipped (the light carries on) if the browser hasn't let the audio start.
      if (live.current.sound && c.state === "running") click(c, c.currentTime + Math.max(0, nextTime.current - clock()), b === 0);
      queue.current.push({ time: nextTime.current, beat: b });
      nextTime.current += 60 / live.current.bpm;
      nextBeat.current = (b + 1) % live.current.beats;
    }
  }

  function draw() {
    if (!ctx.current) return;
    const now = clock();
    // Show the beat whose time has come, and fade the light from it.
    while (queue.current.length > 0 && queue.current[0].time <= now) {
      const next = queue.current.shift()!;
      setBeat(next.beat);
    }
    frame.current = requestAnimationFrame(draw);
  }

  function stop() {
    clearInterval(timer.current);
    cancelAnimationFrame(frame.current);
    queue.current = [];
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    setRunning(false);
    setBeat(-1);
  }

  async function start() {
    const Ctor: AudioContextCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return;
    const c = new Ctor();
    await c.resume().catch(() => {});
    ctx.current = c;
    nextTime.current = clock() + 0.06;
    nextBeat.current = 0;
    queue.current = [];
    schedule();
    timer.current = setInterval(schedule, 25);
    frame.current = requestAnimationFrame(draw);
    setRunning(true);
  }

  // Stop when the metronome leaves the page.
  useEffect(
    () => () => {
      clearInterval(timer.current);
      cancelAnimationFrame(frame.current);
      void ctx.current?.close().catch(() => {});
    },
    [],
  );

  function tap() {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    // A long gap means a new count.
    if (last !== undefined && now - last > 2000) taps.current = [];
    taps.current = [...taps.current.slice(-7), now];
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      setBpm(clampBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)));
    }
  }

  const on = running && beat >= 0;

  return (
    <div className="py-1.5">
      {/* One quiet row: start, the beats of the bar (the current one lights up), and the tempo. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-icon h-7 w-7 flex-none text-xs"
          onClick={() => (running ? stop() : void start())}
          aria-label={running ? "Stop metronome" : "Start metronome"}
          title={running ? "Stop" : "Start"}
        >
          {running ? "■" : "▶"}
        </button>
        <div
          role="img"
          aria-label={on ? `Beat ${beat + 1} of ${beats}` : "Metronome stopped"}
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5"
        >
          {Array.from({ length: beats }, (_, i) => (
            <span
              key={i}
              className={`h-3.5 min-w-0 max-w-5 flex-1 rounded-full transition-[background-color,transform] duration-75 ${
                on && beat === i ? `${i === 0 ? "bg-[#ea580c]" : "bg-[#2563eb]"} scale-110` : "bg-line"
              }`}
            />
          ))}
        </div>
        <div className="flex flex-none items-center gap-0.5">
          <button type="button" className="btn btn-icon h-6 w-6 text-sm" onClick={() => setBpm((b) => clampBpm(b - 1))} aria-label="Slower by one">
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            aria-label="Beats per minute"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) setBpm(Math.min(MAX_BPM, Math.round(n)));
            }}
            onBlur={() => setBpm((b) => clampBpm(b))}
            className="w-10 bg-transparent text-center text-sm font-semibold tabular-nums outline-none [appearance:textfield] focus-visible:underline [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button type="button" className="btn btn-icon h-6 w-6 text-sm" onClick={() => setBpm((b) => clampBpm(b + 1))} aria-label="Faster by one">
            +
          </button>
        </div>
      </div>

      <details className="group mt-1 text-xs text-muted">
        <summary className="cursor-pointer select-none list-none hover:text-foreground">
          <span className="group-open:hidden">More</span>
          <span className="hidden group-open:inline">Less</span>
        </summary>
        <div className="mt-1.5 space-y-1.5">
          <div className="grid grid-cols-2 gap-1">
            <button type="button" className="btn px-2 py-0.5 text-xs" onClick={tap} title="Tap along to the beat to set the tempo">
              Tap tempo
            </button>
            <button
              type="button"
              className="btn px-2 py-0.5 text-xs"
              disabled={songBpm === null || songBpm === bpm}
              onClick={() => songBpm !== null && setBpm(songBpm)}
              title="Go back to the tempo saved with the song"
            >
              {songBpm === null ? "No song tempo" : `Song: ${songBpm}`}
            </button>
          </div>
          <label className="flex items-center justify-between gap-2">
            Beats in a bar
            <select value={beats} onChange={(e) => setBeats(Number(e.target.value))} className="field field-sm w-auto py-0" aria-label="Beats per bar">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
            Click sound (off: light only)
          </label>
        </div>
      </details>
    </div>
  );
}
