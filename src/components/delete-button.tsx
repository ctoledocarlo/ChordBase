"use client";

import { useState } from "react";
import { Modal } from "./modal";

/** A red Delete button that asks first. `action` is the server action that does the deleting. */
export function DeleteButton({
  action,
  id,
  title,
  message,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  /** The dialog's title, e.g. "Delete this setlist?" */
  title: string;
  message: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn w-full border-[#dc2626] bg-[#dc2626] font-medium text-white hover:!bg-[#b91c1c]"
      >
        Delete
      </button>
      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <form action={action} className="space-y-5">
          <input type="hidden" name="id" value={id} />
          <p>{message}</p>
          <div className="flex items-center gap-2 border-t border-line pt-4">
            <button type="button" className="btn ml-auto" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn border-[#dc2626] bg-[#dc2626] font-medium text-white hover:!bg-[#b91c1c]">
              Delete
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
