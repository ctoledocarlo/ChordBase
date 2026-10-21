"use server";

import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/church";
import { noteNumber } from "@/lib/key-finder";
import { SINGER_COLUMNS, type Singer } from "@/lib/setlist-team";
import { forgetSongFacets } from "@/lib/songs";
import { tidyTags } from "@/lib/tags";
import { createClient } from "@/lib/supabase/server";

const NOT_SIGNED_IN = "You're not signed in to a church.";
type Failure = { error: string };
const fail = (error: string): Failure => ({ error });

// ---- Singers ---------------------------------------------------------------------------------------------

/** Adds a singer, or changes one when given its id. The range is the lowest and highest notes they sing comfortably. */
export async function saveSinger(id: string | null, name: string, low: string, high: string): Promise<{ singer: Singer } | Failure> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > 60) return fail("Give the singer a name up to 60 characters.");
  const lo = noteNumber(low);
  const hi = noteNumber(high);
  if (lo === null || hi === null) return fail("Choose the lowest and highest notes.");
  if (hi <= lo) return fail("The highest note has to be above the lowest.");

  const supabase = await createClient();
  const fields = { name: trimmed, range_low: low, range_high: high };
  const { data, error } = id
    ? await supabase.from("singers").update(fields).eq("id", id).select(SINGER_COLUMNS).single<Singer>()
    : await supabase.from("singers").insert(fields).select(SINGER_COLUMNS).single<Singer>();
  if (error || !data) return fail("Couldn't save the singer. Please try again.");
  return { singer: data };
}

export async function deleteSinger(id: string): Promise<{ error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const supabase = await createClient();
  const { error } = await supabase.from("singers").delete().eq("id", id);
  return error ? fail("Couldn't remove that singer.") : {};
}

// ---- Tags ------------------------------------------------------------------------------------------------

/** Replaces a song's tags (collections like "Easter" or "communion"). */
export async function setSongTags(songId: string, tags: string[]): Promise<{ tags?: string[]; error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const clean = tidyTags(tags);
  const supabase = await createClient();
  const { error } = await supabase.from("songs").update({ tags: clean }).eq("id", songId);
  if (error) return fail("Couldn't save the tags. Please try again.");
  forgetSongFacets();
  revalidatePath("/");
  return { tags: clean };
}

// ---- Cleaning up the library ------------------------------------------------------------------------------

/** Folds duplicate songs into one: setlists and history that used them now use `keepId`, and their tags are kept. */
export async function mergeSongs(keepId: string, dropIds: string[]): Promise<{ merged?: number; error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const drop = [...new Set((Array.isArray(dropIds) ? dropIds : []).filter((x) => typeof x === "string" && x !== keepId))];
  if (!keepId || drop.length === 0) return fail("Choose a song to keep and at least one to merge into it.");
  if (drop.length > 50) return fail("Merge fewer songs at a time.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_songs", { p_keep: keepId, p_drop: drop });
  if (error) {
    console.error("merge_songs failed", error.message);
    return fail(error.code === "PGRST202" ? "Merging isn't set up in the database yet (run migration 20261028000000_team_tools.sql)." : "Couldn't merge those songs. Nothing was changed.");
  }
  forgetSongFacets();
  revalidatePath("/", "layout");
  return { merged: drop.length };
}

/** Makes every one of these spellings of an artist the same spelling. */
export async function renameArtists(from: string[], to: string): Promise<{ changed?: number; error?: string }> {
  if (!(await isSignedIn())) return fail(NOT_SIGNED_IN);
  const target = typeof to === "string" ? to.trim() : "";
  if (!target || target.length > 120) return fail("Give the artist a name up to 120 characters.");
  const names = [...new Set((Array.isArray(from) ? from : []).filter((x): x is string => typeof x === "string" && x !== target))];
  if (names.length === 0) return { changed: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase.from("songs").update({ artist: target }).in("artist", names).select("id");
  if (error) return fail("Couldn't rename that artist. Please try again.");
  forgetSongFacets();
  revalidatePath("/", "layout");
  return { changed: data?.length ?? 0 };
}
