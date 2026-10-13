import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Reset password · ChordBase" };

export default function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Reset your password</h1>
      <p className="mb-4 text-sm text-muted">
        We&apos;ll email a link to choose a new password.
      </p>
      <Suspense>
        <ExpiredLinkNotice searchParams={searchParams} />
      </Suspense>
      <ForgotPasswordForm />
    </>
  );
}

async function ExpiredLinkNotice({
  searchParams,
}: {
  searchParams: PageProps<"/forgot-password">["searchParams"];
}) {
  const { error } = await searchParams;
  if (error !== "expired") return null;
  return (
    <p role="alert" className="mb-4 text-sm text-danger">
      That reset link is invalid or has expired. Request a new one below.
    </p>
  );
}
