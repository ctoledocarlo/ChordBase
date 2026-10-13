import { Suspense } from "react";
import { ImportSongs } from "@/components/import-songs";
import { listSongNames } from "@/lib/songs";
import { importSongs } from "./actions";

export default function ImportPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Import />
    </Suspense>
  );
}

async function Import() {
  const existing = await listSongNames();
  return <ImportSongs existing={existing} onImport={importSongs} />;
}
