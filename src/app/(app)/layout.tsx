import { Suspense } from "react";
import { signOut } from "./actions";
import { getCurrentChurch } from "@/lib/church";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="font-semibold tracking-tight">ChordBase</span>
        <Suspense fallback={null}>
          <ChurchBar />
        </Suspense>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
          <ChurchGate>{children}</ChurchGate>
        </Suspense>
      </main>
    </div>
  );
}

async function ChurchBar() {
  const church = await getCurrentChurch();
  return (
    <div className="flex items-center gap-4 text-sm">
      {church && <span className="text-zinc-600 dark:text-zinc-400">{church.name}</span>}
      <form action={signOut}>
        <button type="submit" className="underline">
          Log out
        </button>
      </form>
    </div>
  );
}

// Server-side check, in addition to proxy.ts: a signed-in login that isn't
// linked to a church sees a message instead of the app.
async function ChurchGate({ children }: { children: React.ReactNode }) {
  const church = await getCurrentChurch();
  if (!church) {
    return (
      <p role="alert">
        This login isn&apos;t linked to a church yet. Ask the ChordBase admin to
        finish setting it up.
      </p>
    );
  }
  return children;
}
