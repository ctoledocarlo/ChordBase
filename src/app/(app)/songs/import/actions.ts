"use server";

import { revalidatePath } from "next/cache";
import { isValidChord } from "@/lib/chords";
import { getCurrentChurch } from "@/lib/church";
import { MAX_BATCH } from "@/lib/import/limits";
import { createClient } from "@/lib/supabase/server";

/** One song ready to save, as the Import page sends it. */
export type ImportItem = {
  title: string;
  artist: string;
  key: string;
  tempo: number | null;
  timeSignature: string;
  capo: number;
  body: string;
};

export type ImportResult = {
  created: number;
  /** Songs that were not saved, by their position in the batch that was sent. */
  failed: { index: number; error: string }[];
};

function problemWith(item: ImportItem): string | null {
  if (typeof item.title !== "string" || item.title.trim() === "") return "It needs a title.";
  if (item.title.length > 200 || item.artist.length > 200) return "The title or artist is too long.";
  if (item.key !== "" && !isValidChord(item.key)) return `“${item.key}” isn't a key.`;
  if (item.tempo !== null && (!Number.isInteger(item.tempo) || item.tempo < 20 || item.tempo > 300)) {
    return "The tempo should be a whole number from 20 to 300.";
  }
  if (!/^\d{1,2}\/\d{1,2}$/.test(item.timeSignature)) return "The time signature isn't valid.";
  if (!Number.isInteger(item.capo) || item.capo < 0 || item.capo > 12) return "The capo should be from 0 to 12.";
  if (typeof item.body !== "string" || item.body.length > 200_000) return "The song text is too long.";
  // Chords we can't transpose are still imported as they are; they just stay put when the key changes.
  return null;
}

/** Saves a batch of imported songs to the church's library. Songs that fail a check are skipped and reported. */
export async function importSongs(items: ImportItem[]): Promise<ImportResult> {
  const church = await getCurrentChurch();
  const all = (error: string): ImportResult => ({ created: 0, failed: items.map((_, index) => ({ index, error })) });
  if (!church) return all("You're not signed in to a church.");
  if (!Array.isArray(items) || items.length === 0) return { created: 0, failed: [] };
  if (items.length > MAX_BATCH) return all("Too many songs at once.");

  const failed: ImportResult["failed"] = [];
  const rows: Record<string, unknown>[] = [];
  const rowIndex: number[] = [];
  items.forEach((item, index) => {
    const problem = problemWith(item);
    if (problem) {
      failed.push({ index, error: problem });
      return;
    }
    rows.push({
      church_id: church.id,
      title: item.title.trim(),
      artist: item.artist.trim(),
      original_key: item.key,
      default_capo: item.capo,
      tempo: item.tempo,
      time_signature: item.timeSignature,
      tags: [],
      body: item.body.replace(/\r\n?/g, "\n"),
    });
    rowIndex.push(index);
  });

  if (rows.length === 0) return { created: 0, failed };

  const supabase = await createClient();
  const { error } = await supabase.from("songs").insert(rows);
  if (error) {
    rowIndex.forEach((index) => failed.push({ index, error: "Couldn't save this song. Please try again." }));
    return { created: 0, failed };
  }
  revalidatePath("/", "layout");
  return { created: rows.length, failed };
}
