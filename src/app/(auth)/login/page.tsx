import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthEntrance } from "@/components/auth-entrance";

export const metadata: Metadata = { title: "Log in · ChordBase" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthEntrance />
    </Suspense>
  );
}
