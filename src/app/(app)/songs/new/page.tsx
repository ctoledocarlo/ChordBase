import Link from "next/link";
import { SongEditor } from "@/components/song-editor";

export default function NewSongPage() {
  return (
    <>
      <Link href="/" className="text-sm underline">
        ← Songs
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Add song</h1>
      <SongEditor />
    </>
  );
}
