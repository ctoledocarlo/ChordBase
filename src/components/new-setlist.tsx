"use client";

import { useState } from "react";
import { createSetlist } from "@/app/(app)/setlists/actions";
import { Modal } from "./modal";

/** The "New setlist" button and the little form it opens. */
export function NewSetlist() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        New setlist
      </button>
      <Modal open={open} title="New setlist" onClose={() => setOpen(false)}>
        <form action={createSetlist} className="space-y-5">
          <label className="block">
            <span className="label">Name</span>
            <input name="name" required maxLength={80} autoFocus placeholder="Sunday service" className="field" />
          </label>
          <label className="block">
            <span className="label">Date (optional)</span>
            <input name="service_date" type="date" className="field" />
          </label>
          <div className="flex items-center gap-2 border-t border-line pt-4">
            <button type="button" className="btn ml-auto" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
