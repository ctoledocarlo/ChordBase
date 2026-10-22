import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/skeletons";
import { ProfileForm } from "@/components/profile-form";
import { getCurrentChurch } from "@/lib/church";
import { getMyProfile } from "@/lib/members";

export default function ProfilePage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const [church, profile] = await Promise.all([getCurrentChurch(), getMyProfile()]);
  if (!church || !profile) redirect("/");
  return <ProfileForm profile={profile} churchName={church.name} />;
}
