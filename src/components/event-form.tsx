"use client";

import { useState } from "react";
import type { Slot } from "@/lib/schedule";
import { Modal } from "./modal";
import { useScheduleApi } from "./schedule-store";

function EventFields({ editing, defaultDate, onClose }: { editing: Slot | null; defaultDate: string; onClose: () => void }) {
  const api = useScheduleApi();
  const sunday = editing?.kind === "sunday";
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const [time, setTime] = useState(editing?.time ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [removing, setRemoving] = useState(false);

  // Shown at once; the server is asked in the background.
  function remove() {
    if (!editing?.id) return;
    api.deleteEvent(editing.id, editing.title);
    onClose();
  }

  function save() {
    const input = { title: title.trim(), date, time, location: location.trim(), notes: notes.trim() };
    if (editing?.id) api.updateEvent(editing.id, input);
    else if (sunday) api.updateSunday(editing!.date, input);
    else api.addEvent(input);
    onClose();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing?.id && editing.kind === "event" && (
          <span className="mr-auto flex items-center gap-2">
            {removing ? (
              <>
                <span className="text-sm text-muted">Remove it and everyone on it?</span>
                <button type="button" className="btn border-[#dc2626] bg-[#dc2626] text-white hover:!bg-[#b91c1c]" onClick={remove}>
                  Yes, remove
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-quiet hover:!text-[#dc2626]" onClick={() => setRemoving(true)}>
                Remove event
              </button>
            )}
          </span>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!title.trim() || !date}>
          {editing ? "Save" : "Add event"}
        </button>
      </div>
    </form>
  );
}

/** Adding an event in between the Sundays, or changing one. */
export function EventForm({ open, editing, defaultDate, onClose }: { open: boolean; editing: Slot | null; defaultDate: string; onClose: () => void }) {
  return (
    <Modal open={open} title={editing ? "Change event" : "Add an event"} onClose={onClose}>
      <EventFields editing={editing} defaultDate={defaultDate} onClose={onClose} />
    </Modal>
  );
}
