"use client";

import { useState } from "react";
import { addEvent, updateEvent } from "@/app/(app)/schedule/actions";
import type { Slot } from "@/lib/schedule";
import { Modal } from "./modal";

function EventFields({ editing, defaultDate, onClose, onSaved }: { editing: Slot | null; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const sunday = editing?.kind === "sunday";
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const [time, setTime] = useState(editing?.time ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = editing?.id ? await updateEvent(editing.id, title, date, time, location, notes) : await addEvent(title, date, time, location, notes);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    onSaved();
    onClose();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="block">
        <span className="label">Name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" maxLength={80} placeholder="Youth night, Easter service, Wedding rehearsal…" required disabled={sunday} autoFocus={!sunday} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" required disabled={sunday} />
        </label>
        <label className="block">
          <span className="label">Time (optional)</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field" />
        </label>
      </div>
      <label className="block">
        <span className="label">Where (optional)</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} className="field" maxLength={120} />
      </label>
      <label className="block">
        <span className="label">Notes (optional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="field" rows={3} maxLength={1000} />
      </label>
      {sunday && <p className="text-sm text-muted">This is the weekly Sunday service, so its name and date stay as they are.</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !date}>
          {busy ? "Saving…" : editing ? "Save" : "Add event"}
        </button>
      </div>
    </form>
  );
}

/** Adding an event in between the Sundays, or changing one. */
export function EventForm({ open, editing, defaultDate, onClose, onSaved }: { open: boolean; editing: Slot | null; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal open={open} title={editing ? "Change event" : "Add an event"} onClose={onClose}>
      <EventFields editing={editing} defaultDate={defaultDate} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}
