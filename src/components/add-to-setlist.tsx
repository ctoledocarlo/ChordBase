"use client";

import Link from "next/link";
import { useState } from "react";
import { addSongToSetlist, createSetlistWithSong } from "@/app/(app)/setlists/actions";
import { DEFAULT_KEEP_MONTHS, KEEP_OPTIONS, formatDay } from "@/lib/setlist-expiry";
import { Modal } from "./modal";

const DEFAULT_NAME = "Sunday Service";

export type SetlistChoice = { id: string; name: string; service_date: string | null };

/** "Add to setlist": put this song in a setlist that exists, or make a new one for it. */
export function AddToSetlist({
  songId,
  songTitle,
  setlists,
  bar = false,
  tourId,
}: {
  songId: string;
  songTitle: string;
  setlists: SetlistChoice[];
  /** The copy in the phone's bottom bar: sized to sit beside other buttons. */
  bar?: boolean;
  /** Marks the button for the tutorials (only one copy on the page should have it). */
  tourId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Setlists this song was added to since the page opened, by id.
  const [added, setAdded] = useState<Record<string, string>>({});
  const [name, setName] = useState(DEFAULT_NAME);
  const [date, setDate] = useState("");
  const [keep, setKeep] = useState(String(DEFAULT_KEEP_MONTHS));

  async function addTo(choice: SetlistChoice) {
    setBusy(true);
    setError(null);
    const res = await addSongToSetlist(choice.id, songId);
    setBusy(false);
    if (res.error) setError(res.error);
    else setAdded((a) => ({ ...a, [choice.id]: choice.name }));
  }

  async function createAndAdd() {
    setBusy(true);
    setError(null);
    const res = await createSetlistWithSong(name, date, songId, Number(keep));
    setBusy(false);
    const id = res.setlistId;
    if (res.error || !id) {
      setError(res.error ?? "Couldn't create the setlist.");
      return;
    }
    setAdded((a) => ({ ...a, [id]: name.trim() }));
    setName(DEFAULT_NAME);
    setDate("");
  }

  // Setlists made here aren't in the list the page loaded with.
  const created = Object.entries(added).filter(([id]) => !setlists.some((s) => s.id === id));

  return (
    <>
      <button
        data-tour={tourId}
        type="button"
        className={bar ? "btn" : "btn w-full"}
        onClick={() => setOpen(true)}
      >
        Add to setlist
      </button>
      <Modal open={open} title="Add to setlist" onClose={() => setOpen(false)}>
        <div className="space-y-6">
          <p className="text-sm text-muted">
            Add “{songTitle}” to a setlist. It starts out in its original key, and you can change that inside the setlist.
          </p>

          {setlists.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium">Your setlists</h3>
              <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {setlists.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      {s.service_date && <span className="block text-xs text-muted">{formatDay(s.service_date)}</span>}
                    </span>
                    {added[s.id] ? (
                      <Link href={`/setlists/${s.id}`} className="text-sm text-muted underline hover:text-foreground">
                        Added · open
                      </Link>
                    ) : (
                      <button type="button" className="btn" disabled={busy} onClick={() => void addTo(s)}>
                        Add
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-medium">Or start a new setlist</h3>
            <div className="grid gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                aria-label="New setlist name"
                className="field"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Service date (optional)"
                className="field"
              />
              <label className="block">
                <span className="label">Keep for (then it is deleted; you can change this later)</span>
                <select value={keep} onChange={(e) => setKeep(e.target.value)} className="field">
                  {KEEP_OPTIONS.map((o) => (
                    <option key={o.months} value={o.months}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void createAndAdd()}>
                Create and add song
              </button>
            </div>
          </section>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {created.length > 0 && (
            <p role="status" className="text-sm text-muted">
              Added to {created.map(([, n]) => `“${n}”`).join(", ")}. Find it under Setlists.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
