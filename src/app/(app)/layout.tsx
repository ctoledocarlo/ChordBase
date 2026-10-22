import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "./actions";
import { AppShell } from "@/components/app-shell";
import { LogoutButton } from "@/components/logout-button";
import { SongSkeleton } from "@/components/skeletons";
import { AccountMenu } from "@/components/account-menu";
import { JoinChurch } from "@/components/join-church";
import { getMembership } from "@/lib/church";
import { countRequests, getMyApplication } from "@/lib/members";
import { ROLE_LABELS, can } from "@/lib/roles";

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
  const { church } = await getMembership();
  // The church's own account is told how many people are waiting to join.
  const manages = !!church && can(church.role, "manage-members");
  const waiting = manages ? await countRequests() : 0;
  const links = (
    <>
      {manages && (
        <Link href="/members" className="whitespace-nowrap hover:underline">
          Team
          {waiting > 0 && (
            <span aria-label={`${waiting} waiting`} className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[0.6875rem] font-medium text-white">
              {waiting}
            </span>
          )}
        </Link>
      )}
      {church && (
        <Link href="/profile" className="whitespace-nowrap hover:underline">
          Profile
        </Link>
      )}
      <LogoutButton action={signOut} />
    </>
  );
  return (
    <div className="flex items-center gap-3 text-sm">
      {church && (
        <span className="hidden font-medium text-muted lg:inline">
          {church.name}
          {church.role !== "church" && ` · ${ROLE_LABELS[church.role]}`}
        </span>
      )}
      <div className="hidden items-center gap-3 md:flex">{links}</div>
      <AccountMenu badge={waiting}>{links}</AccountMenu>
    </div>
  );
}

// A login that isn't in a church yet is asked to join one: find it, apply, and wait for the church's own account to
// answer. The check runs beside the page rather than in front of it, so the page's own data is already on its way
// while the check is made; row level security shows an unlinked login nothing, so the page is empty for them either
// way, and this covers the screen.
async function ChurchNotice() {
  const { church, failed } = await getMembership();
  if (church) return null;
  if (failed) {
    return (
      <p role="alert">
        Couldn&apos;t load your church just now. Refresh the page in a moment.
      </p>
    );
  }
  // Signed out visitors never get here (the proxy sends them to log in), but a stale session shouldn't show a join screen.
  const application = await getMyApplication();
  return <JoinChurch application={application} signOut={<LogoutButton action={signOut} />} />;
}
