"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteSinger, saveSinger } from "@/app/(app)/songs/tools-actions";
import { RANGE_NOTES, adviseKey, octaveWords, shiftWords } from "@/lib/key-finder";
import { deriveSong } from "@/lib/setlist-derive";
import type { Singer } from "@/lib/setlist-team";
import type { PresetSettings } from "@/lib/songs";
import { Modal } from "./modal";

/** Typical comfortable ranges to start from; adjust them to the actual person. */
const VOICES = [
  { label: "Soprano", low: "C4", high: "G5" },
  { label: "Alto", low: "G3", high: "D5" },
  { label: "Tenor", low: "C3", high: "G4" },
  { label: "Bass", low: "E2", high: "C4" },
];

const rangeText = (s: Pick<Singer, "range_low" | "range_high">) => `${s.range_low} to ${s.range_high}`;

/** Adding, changing and removing singers, and the range each one sings comfortably. */
export function SingersModal({
  open,
  onClose,
  singers,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  singers: Singer[];
  onChange: (singers: Singer[]) => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [low, setLow] = useState("A2");
  const [high, setHigh] = useState("E4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start(singer?: Singer) {
    setEditing(singer?.id ?? "new");
    setName(singer?.name ?? "");
    setLow(singer?.range_low ?? "A2");
    setHigh(singer?.range_high ?? "E4");
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveSinger(editing === "new" ? null : editing, name, low, high);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    onChange(editing === "new" ? [...singers, res.singer].sort((a, b) => a.name.localeCompare(b.name)) : singers.map((s) => (s.id === res.singer.id ? res.singer : s)));
    setEditing(null);
  }

  async function remove(singer: Singer) {
    setBusy(true);
    const res = await deleteSinger(singer.id);
    setBusy(false);
    if (res.error) return setError(res.error);
    onChange(singers.filter((s) => s.id !== singer.id));
    if (editing === singer.id) setEditing(null);
  }

  return (
    <Modal open={open} title="Singers" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Add each singer and the lowest and highest notes they sing comfortably (C4 is middle C). Then ChordBase can suggest a key for each song that suits them.
        </p>

        {singers.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line">
            {singers.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block text-xs text-muted">{rangeText(s)}</span>
                </span>
                <button type="button" className="btn" onClick={() => start(s)} disabled={busy}>
                  Edit
                </button>
                <button type="button" className="btn btn-quiet hover:!text-[#dc2626]" onClick={() => void remove(s)} disabled={busy} aria-label={`Remove ${s.name}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {editing === null ? (
          <button type="button" className="btn btn-primary" onClick={() => start()}>
            Add a singer
          </button>
        ) : (
          <form
            className="space-y-3 rounded-md border border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="block">
              <span className="label">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus className="field" autoComplete="off" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">Lowest note</span>
                <select value={low} onChange={(e) => setLow(e.target.value)} className="field">
                  {RANGE_NOTES.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Highest note</span>
                <select value={high} onChange={(e) => setHigh(e.target.value)} className="field">
                  {RANGE_NOTES.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <p className="label">Start from a typical voice</p>
              <div className="flex flex-wrap gap-1.5">
                {VOICES.map((v) => (
                  <button
                    key={v.label}
                    type="button"
                    className="btn px-2.5 py-1 text-[0.8125rem]"
                    onClick={() => {
                      setLow(v.low);
                      setHigh(v.high);
                    }}
                    title={`${v.low} to ${v.high}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
                {busy ? "Saving…" : "Save singer"}
              </button>
            </div>
          </form>
        )}
        {editing === null && error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Picks a singer for a song and suggests the keys that keep the whole melody inside their range. Press a key to
 * use it. It needs the song's lowest and highest melody notes (set in the song's editor).
 */
export function KeyForSinger({
  originalKey,
  melodyLow,
  melodyHigh,
  singers,
  onSingers,
  singerId,
  onSinger,
  settings,
  onChange,
  editHref,
}: {
  originalKey: string;
  melodyLow: string;
  melodyHigh: string;
  singers: Singer[];
  onSingers: (singers: Singer[]) => void;
  singerId: string | null;
  onSinger: (id: string | null) => void;
  settings: PresetSettings;
  onChange: (settings: PresetSettings) => void;
  /** Where to add the melody range to the song. */
  editHref?: string;
}) {
  const [managing, setManaging] = useState(false);
  const singer = singers.find((s) => s.id === singerId) ?? null;
  const advice = singer ? adviseKey({ low: melodyLow, high: melodyHigh }, { low: singer.range_low, high: singer.range_high }) : null;
  const keyName = (semitones: number) => deriveSong(originalKey, { ...settings, semitones }).soundingKey || shiftWords(semitones);

  return (
    <div data-tour="singer-key" className="space-y-2.5">
      <select
        className="field field-sm"
        aria-label="Singer"
        value={singerId ?? ""}
        onChange={(e) => (e.target.value === "__manage" ? setManaging(true) : onSinger(e.target.value || null))}
      >
        <option value="">Nobody chosen</option>
        {singers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({rangeText(s)})
          </option>
        ))}
        <option value="__manage">Add or change singers…</option>
      </select>

      {singers.length === 0 && (
        <p className="text-sm text-muted">
          Add your singers and their ranges, and ChordBase will suggest a key that suits each.{" "}
          <button type="button" className="underline hover:text-foreground" onClick={() => setManaging(true)}>
            Add a singer
          </button>
        </p>
      )}

      {singer && advice?.status === "unknown" && (
        <p className="text-sm text-muted">
          To find a key for {singer.name}, this song needs its melody&apos;s lowest and highest notes.{" "}
          {editHref && (
            <Link href={editHref} className="underline hover:text-foreground">
              Add them in the editor
            </Link>
          )}
        </p>
      )}

      {singer && advice?.status === "fits" && (
        <div className="space-y-2 text-sm">
          {(() => {
            const now = advice.options.find((o) => o.semitones === settings.semitones);
            return (
              <p className={now ? "text-[#15803d] dark:text-[#4ade80]" : "text-danger"}>
                {now
                  ? now.octaves === 0
                    ? `In ${keyName(settings.semitones)} the whole melody is in ${singer.name}'s range.`
                    : `In ${keyName(settings.semitones)} the melody fits ${singer.name}'s range if sung ${octaveWords(now.octaves)} than the recording.`
                  : `In ${keyName(settings.semitones)} the melody goes outside ${singer.name}'s range.`}
              </p>
            );
          })()}
          <p className="text-muted">Keys that suit {singer.name}, nearest the usual key first:</p>
          <div className="flex flex-wrap gap-1.5">
            {advice.options.slice(0, 6).map((o) => (
              <button
                key={o.semitones}
                type="button"
                aria-pressed={o.semitones === settings.semitones}
                onClick={() => onChange({ ...settings, semitones: o.semitones })}
                title={`${shiftWords(o.keyShift)}${o.octaves !== 0 ? `, sung ${octaveWords(o.octaves)}` : ""}${o.semitones === advice.comfortable.semitones ? " · most comfortable" : ""}`}
                className={`btn px-2.5 py-1 text-[0.8125rem] ${o.semitones === settings.semitones ? "btn-primary" : ""}`}
              >
                {keyName(o.semitones)}
                {o.octaves !== 0 && <span aria-hidden>{o.octaves > 0 ? " ↑" : " ↓"}</span>}
                {o.semitones === advice.comfortable.semitones && <span aria-hidden> ★</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            ★ is the most comfortable: the most room at both ends of {singer.name}&apos;s range.
            {advice.options.some((o) => o.octaves !== 0) && " ↑ or ↓ means the melody is sung an octave higher or lower than on the recording."}
          </p>
        </div>
      )}

      {singer && advice?.status === "narrow" && (
        <div className="space-y-2 text-sm">
          <p className="text-danger">
            This melody spans {advice.span} half steps and {singer.name}&apos;s range is {advice.room}, so it doesn&apos;t fit in any key.
          </p>
          <p className="text-muted">
            The closest is {keyName(advice.closest.semitones)} ({shiftWords(advice.closest.keyShift)}{advice.closest.octaves !== 0 ? `, sung ${octaveWords(advice.closest.octaves)}` : ""}), which still goes
            {advice.aboveBy > 0 ? ` ${advice.aboveBy} half step${advice.aboveBy === 1 ? "" : "s"} above` : ""}
            {advice.aboveBy > 0 && advice.belowBy > 0 ? " and" : ""}
            {advice.belowBy > 0 ? ` ${advice.belowBy} half step${advice.belowBy === 1 ? "" : "s"} below` : ""} their range. Another singer, or an octave change on the hard notes, may suit better.
          </p>
          <button type="button" className="btn px-2.5 py-1 text-[0.8125rem]" onClick={() => onChange({ ...settings, semitones: advice.closest.semitones })}>
            Use {keyName(advice.closest.semitones)}
          </button>
        </div>
      )}

      <SingersModal open={managing} onClose={() => setManaging(false)} singers={singers} onChange={onSingers} />
    </div>
  );
}
