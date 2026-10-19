"use client";

import { useCallback, useEffect, useRef } from "react";
import { frequencyOf } from "@/lib/theory/notes";
import { useStoredFlag } from "../use-stored-flag";

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

/** One shared audio context, made the first time someone presses a key (browsers only allow sound after a tap or click). */
function audio(): AudioContext | null {
  if (context) return context;
  const Ctor: AudioContextCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** A soft, piano-ish note: a triangle wave with a quiet octave on top, struck quickly and fading away. */
function tone(c: AudioContext, midi: number, at: number, seconds: number, volume: number) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(volume * 0.35, at + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  gain.connect(c.destination);
  for (const [type, multiple, level] of [["triangle", 1, 1], ["sine", 2, 0.25]] as const) {
    const osc = c.createOscillator();
    const part = c.createGain();
    part.gain.value = level;
    osc.type = type;
    osc.frequency.value = frequencyOf(midi) * multiple;
    osc.connect(part).connect(gain);
    osc.start(at);
    osc.stop(at + seconds + 0.05);
  }
}

export type PlayOptions = {
  /** How long each note rings, in seconds. */
  seconds?: number;
  /** Gap between notes, in seconds: 0 plays them together as a chord, more spreads them out like a harp. */
  spread?: number;
};

export type Step = { midis: number[]; /** When to play it, in milliseconds from the start. */ at: number; spread?: number; seconds?: number };

/**
 * Sound for the Practice section. Sound is on by default (the point of a keyboard lesson is to hear it) and only
 * ever starts from something a person pressed. The choice is remembered on the device.
 */
export function useSound() {
  const [sound, setSound] = useStoredFlag("chordbase.practiceSound", true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopSequence = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => stopSequence, [stopSequence]);

  const play = useCallback(
    (midis: number[], options: PlayOptions = {}) => {
      if (!sound) return;
      const c = audio();
      if (!c) return;
      void c.resume();
      const seconds = options.seconds ?? 1.6;
      const spread = options.spread ?? 0;
      const volume = 0.5 / Math.sqrt(Math.max(1, midis.length));
      const start = c.currentTime + 0.02;
      midis.forEach((midi, i) => tone(c, midi, start + i * spread, seconds, volume));
    },
    [sound],
  );

  /** Plays several steps, one after another (a scale, a chord progression). Starting again stops the last one. */
  const sequence = useCallback(
    (steps: Step[], onStep?: (index: number) => void, onDone?: () => void) => {
      stopSequence();
      steps.forEach((step, i) => {
        timers.current.push(
          setTimeout(() => {
            onStep?.(i);
            play(step.midis, { spread: step.spread, seconds: step.seconds });
          }, step.at),
        );
      });
      const end = steps.length ? steps[steps.length - 1].at + 700 : 0;
      timers.current.push(setTimeout(() => onDone?.(), end));
    },
    [play, stopSequence],
  );

  return { sound, setSound, play, sequence, stop: stopSequence };
}
