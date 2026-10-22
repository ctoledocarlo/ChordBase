import type { Metadata } from "next";
import { ToastProvider } from "@/components/toast";

// The phone remote is for the band, not the search engines.
export const metadata: Metadata = { title: "Remote · ChordBase", robots: { index: false, follow: false } };

export default function RemoteLayout({ children }: LayoutProps<"/r">) {
  return <ToastProvider>{children}</ToastProvider>;
}
