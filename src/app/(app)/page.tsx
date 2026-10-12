import { Suspense } from "react";
import { getCurrentChurch } from "@/lib/church";

export default function HomePage() {
  return (
    <Suspense>
      <Welcome />
    </Suspense>
  );
}

async function Welcome() {
  const church = await getCurrentChurch();
  if (!church) return null;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{church.name}</h1>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Songs</h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          No songs yet. The song library is coming next.
        </p>
      </section>
    </>
  );
}
