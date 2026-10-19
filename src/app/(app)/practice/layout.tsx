import type { Metadata } from "next";
import { Suspense } from "react";
import { PracticeSidebar } from "@/components/practice/practice-sidebar";

export const metadata: Metadata = { title: "Practice · ChordBase" };

export default function PracticeLayout({ children }: LayoutProps<"/practice">) {
  return (
    <>
      <Suspense fallback={null}>
        <PracticeSidebar />
      </Suspense>
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </>
  );
}
