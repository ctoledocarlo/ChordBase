import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MembersView } from "@/components/members-view";
import { ListPageSkeleton } from "@/components/skeletons";
import { getCurrentChurch } from "@/lib/church";
import { listMembers, listRequests } from "@/lib/members";
import { can } from "@/lib/roles";

export default function MembersPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <Members />
    </Suspense>
  );
}

async function Members() {
  const [church, members, requests] = await Promise.all([getCurrentChurch(), listMembers(), listRequests()]);
  // Only the church's own account runs its people (the database refuses anyone else too).
  if (!church || !can(church.role, "manage-members")) redirect("/");
  return <MembersView members={members} requests={requests} actor={church.role} />;
}
