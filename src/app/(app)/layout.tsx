import { Suspense } from "react";
import { signOut } from "./actions";
import { AppShell } from "@/components/app-shell";
import { LogoutButton } from "@/components/logout-button";
import { SongSkeleton } from "@/components/skeletons";
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
      <Suspense fallback={null}>
        <ChurchNotice />
      </Suspense>
      <Suspense fallback={<SongSkeleton />}>{children}</Suspense>
    </AppShell>
  );
}

async function ChurchBar() {
  const church = await getCurrentChurch();
  return (
    <div className="flex items-center gap-3 text-sm">
      {church && <span className="hidden font-medium text-muted sm:inline">{church.name}</span>}
      <LogoutButton action={signOut} />
    </div>
  );
}

// A login that isn't linked to a church sees a message. The check runs beside the page rather than in
// front of it, so the page's own data is already on its way while the check is made; row level security
// shows an unlinked login nothing, so the page is empty for them either way.
async function ChurchNotice() {
  const church = await getCurrentChurch();
  if (church) return null;
  return (
    <p role="alert">
      This login isn&apos;t linked to a church yet. Ask the ChordBase admin to
      finish setting it up.
    </p>
  );
}
