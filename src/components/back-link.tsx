"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackIcon } from "./icons";

/**
 * Goes back to the page the person came from. If there is no earlier page
 * (a bookmark, a fresh tab), it goes to `fallback` instead.
 */
export function BackLink({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="btn btn-quiet -ml-2 mb-3 inline-flex"
    >
      <BackIcon /> {label}
    </Link>
  );
}
