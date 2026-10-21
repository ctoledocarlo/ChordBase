"use client";

import { clearOfflineData } from "./offline-support";

/** Log out. It also forgets the pages kept for offline use on this device. */
export function LogoutButton({ action }: { action: () => void | Promise<void> }) {
  return (
    <form action={action} onSubmit={() => void clearOfflineData()}>
      <button type="submit" className="whitespace-nowrap text-sm underline">
        Log out
      </button>
    </form>
  );
}
