"use client";

import { useRef, useState } from "react";
import { addTap, MAX_BPM, MIN_BPM, tempoFromTaps } from "@/lib/tempo";
import { Modal } from "./modal";

/** Set the tempo by typing a number, or by tapping along (click the pad or press the spacebar). */
export function TempoModal({
  open,
  current,
  onClose,
  onSave,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onSave: (tempo: string) => void;
}) {
  return (
    <Modal open={open} title="Tempo" onClose={onClose}>
      <TempoForm current={current} onClose={onClose} onSave={onSave} />
    </Modal>
  );
}

function TempoForm({
  current,
  onClose,
  onSave,
}: {
  current: string;
  onClose: () => void;
  onSave: (tempo: string) => void;
}) {
  const [draft, setDraft] = useState(current);
  const [taps, setTaps] = useState<number[]>([]);
  const tapsRef = useRef<number[]>([]);

  const tapped = tempoFromTaps(taps);
  const value = Number(draft);
  const valid = Number.isInteger(value) && value >= MIN_BPM && value <= MAX_BPM;

  function tap(timeStamp: number) {
    tapsRef.current = addTap(tapsRef.current, timeStamp);
    setTaps(tapsRef.current);
    const bpm = tempoFromTaps(tapsRef.current);
    if (bpm) setDraft(String(bpm));
  }

  function startOver() {
    tapsRef.current = [];
    setTaps([]);
  }

  return (
    <div
      className="space-y-5"
      onKeyDown={(e) => {
        // The spacebar taps the beat, except while typing a number.
        if (e.code !== "Space" || (e.target as HTMLElement).tagName === "INPUT") return;
        e.preventDefault();
        if (!e.repeat) tap(e.timeStamp);
      }}
      onKeyUp={(e) => {
        if (e.code === "Space" && (e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
      }}
    >
      <label className="block">
        <span className="label">Beats per minute (BPM)</span>
        <input
          type="number"
          min={MIN_BPM}
          max={MAX_BPM}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (valid) onSave(String(value));
            }
          }}
          className="field"
        />
      </label>

      <div>
        <p className="label">Or tap the beat</p>
        <button
          type="button"
          autoFocus
          onClick={(e) => {
            // Keyboard presses are handled above; this is for the mouse and touch.
            if (e.detail > 0) tap(e.timeStamp);
          }}
          className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line hover:bg-hover"
        >
          <span className="text-3xl font-semibold tabular-nums">{tapped ?? "–"}</span>
          <span className="text-sm text-muted">
            {taps.length < 2 ? "Tap here or press the spacebar to the beat" : `BPM from ${taps.length} taps`}
          </span>
        </button>
        {taps.length > 0 && (
          <button type="button" onClick={startOver} className="mt-2 text-sm text-muted underline hover:text-foreground">
            Start over
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-4">
        {current && (
          <button type="button" className="btn btn-quiet" onClick={() => onSave("")}>
            Clear tempo
          </button>
        )}
        <button type="button" className="btn ml-auto" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSave(String(value))}>
          Set tempo
        </button>
      </div>
    </div>
  );
}
