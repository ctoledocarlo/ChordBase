import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "New password · ChordBase" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Choose a new password</h1>
      <ResetPasswordForm />
    </>
  );
}
