import { Suspense } from "react";
import { signOut } from "./actions";
import { AppShell } from "@/components/app-shell";
import { getCurrentChurch } from "@/lib/church";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      account={
        <Suspense fallback={null}>
          <ChurchBar />
        </Suspense>
      }
    >
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <ChurchGate>{children}</ChurchGate>
      </Suspense>
    </AppShell>
  );
}

async function ChurchBar() {
  const church = await getCurrentChurch();
  return (
    <div className="flex items-center gap-3 text-sm">
      {church && <span className="hidden font-medium text-muted sm:inline">{church.name}</span>}
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
