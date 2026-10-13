import { Suspense } from "react";
import { SongEditor } from "@/components/song-editor";
import { listChordShortcuts } from "@/lib/songs";

export default function NewSongPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Editor />
    </Suspense>
  );
}

async function Editor() {
  const shortcuts = await listChordShortcuts();
  return <SongEditor shortcuts={shortcuts} />;
}
