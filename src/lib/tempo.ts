/** Taps further apart than this start a fresh count. */
export const TAP_RESET_MS = 2500;
/** Only the most recent taps count, so the result follows the player if the speed drifts. */
export const MAX_TAPS = 8;
export const MIN_BPM = 20;
export const MAX_BPM = 300;

/** Adds a tap (a timestamp in ms), starting over if the last one was too long ago. */
export function addTap(taps: number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const base = last !== undefined && now - last > TAP_RESET_MS ? [] : taps;
  return [...base, now].slice(-MAX_TAPS);
}

/** Beats per minute from the average gap between taps; null until there are two usable taps. */
export function tempoFromTaps(taps: number[]): number | null {
  if (taps.length < 2) return null;
  const average = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
  const bpm = Math.round(60000 / average);
  return Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM ? bpm : null;
}
