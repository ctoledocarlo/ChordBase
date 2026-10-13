import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Log in · ChordBase" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-8 mt-2 text-muted">Log in to your church&apos;s songs and setlists.</p>
      <LoginForm />
    </>
  );
}
