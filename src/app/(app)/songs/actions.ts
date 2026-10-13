"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidChord } from "@/lib/chords";
import { getCurrentChurch } from "@/lib/church";
import { createClient } from "@/lib/supabase/server";
import { getSong, type PresetSettings } from "@/lib/songs";

export type SongFormState = { error?: string };

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

const intOrNull = (value: string) => {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
};

/** Creates a song, or updates it when the form carries an `id`. */
export async function saveSong(
  _prev: SongFormState,
  formData: FormData,
): Promise<SongFormState> {
  const church = await getCurrentChurch();
  if (!church) return { error: "You're not signed in to a church." };

  const id = text(formData, "id");
  const title = text(formData, "title").trim();
  if (!title) return { error: "Give the song a title." };

  const capo = intOrNull(text(formData, "default_capo")) ?? 0;
  if (Number.isNaN(capo) || capo < 0 || capo > 12) {
    return { error: "Capo must be a whole number from 0 to 12." };
  }
  const tempo = intOrNull(text(formData, "tempo"));
  if (tempo !== null && (Number.isNaN(tempo) || tempo < 20 || tempo > 300)) {
    return { error: "Tempo must be a whole number from 20 to 300 BPM." };
  }
  const timeSignature = text(formData, "time_signature").trim() || "4/4";
  if (!/^\d{1,2}\/\d{1,2}$/.test(timeSignature)) {
    return { error: "Time signature should look like 4/4 or 6/8." };
  }

  const body = text(formData, "body").replace(/\r\n?/g, "\n");
  const badChords = [
    ...new Set([...body.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim()).filter((c) => !isValidChord(c))),
  ];
  if (badChords.length > 0) {
    return { error: `These chords aren't recognised, so the song couldn't be transposed: ${badChords.join(", ")}.` };
  }

  const fields = {
    title,
    artist: text(formData, "artist").trim(),
    original_key: text(formData, "original_key").trim(),
    default_capo: capo,
    tempo,
    time_signature: timeSignature,
    ccli_number: text(formData, "ccli_number").trim(),
    tags: text(formData, "tags")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    body,
  };

  const supabase = await createClient();
  let songId = id;
  if (id) {
    const { error } = await supabase.from("songs").update(fields).eq("id", id);
    if (error) return { error: "Couldn't save the song. Please try again." };
  } else {
    const { data, error } = await supabase
      .from("songs")
      .insert({ ...fields, church_id: church.id })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { error: "Couldn't save the song. Please try again." };
    songId = data.id;
  }

  revalidatePath("/", "layout");
  redirect(`/songs/${songId}`);
}

export async function deleteSong(formData: FormData) {
  const church = await getCurrentChurch();
  if (!church) redirect("/login");
  const id = text(formData, "id");
  if (id) {
    const supabase = await createClient();
    await supabase.from("songs").delete().eq("id", id);
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export type PresetResult = { error?: string };

function validSettings(s: PresetSettings): boolean {
  return (
    Number.isInteger(s.semitones) && s.semitones >= 0 && s.semitones < 12 &&
    Number.isInteger(s.capo) && s.capo >= 0 && s.capo <= 12 &&
    ["auto", "sharp", "flat"].includes(s.spelling) &&
    typeof s.showChords === "boolean" &&
    Number.isInteger(s.fontSize) && (s.fontSize === 0 || (s.fontSize >= 12 && s.fontSize <= 40))
  );
}

/** Saves the current view settings under a name; reusing a name replaces that preset. */
export async function savePreset(
  songId: string,
  name: string,
  settings: PresetSettings,
): Promise<PresetResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: "You're not signed in to a church." };
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) return { error: "Give the preset a short name." };
  if (!validSettings(settings)) return { error: "Those settings aren't valid." };

  const supabase = await createClient();
  // RLS hides songs from other churches, so this also proves the song is theirs.
  const song = await getSong(songId);
  if (!song) return { error: "Song not found." };

  const { error } = await supabase
    .from("song_presets")
    .upsert(
      { church_id: church.id, song_id: songId, name: trimmed, settings },
      { onConflict: "song_id,name" },
    );
  if (error) return { error: "Couldn't save the preset. Please try again." };
  revalidatePath(`/songs/${songId}`);
  return {};
}

export async function deletePreset(songId: string, presetId: string): Promise<PresetResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: "You're not signed in to a church." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("song_presets")
    .delete()
    .eq("id", presetId)
    .eq("song_id", songId);
  if (error) return { error: "Couldn't delete the preset." };
  revalidatePath(`/songs/${songId}`);
  return {};
}

export type ShortcutResult = { id?: string; error?: string };

/** Saves a chord as a shortcut for the whole church. Adding one that exists is a no-op. */
export async function addChordShortcut(chord: string): Promise<ShortcutResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: "You're not signed in to a church." };
  const value = chord.replace(/[[\]{}]/g, "").trim();
  if (!isValidChord(value)) return { error: `“${value}” isn't a chord we can transpose.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chord_shortcuts")
    .upsert({ church_id: church.id, chord: value }, { onConflict: "church_id,chord" })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { error: "Couldn't save that chord. Please try again." };
  return { id: data.id };
}

export async function removeChordShortcut(id: string): Promise<ShortcutResult> {
  const church = await getCurrentChurch();
  if (!church) return { error: "You're not signed in to a church." };
  const supabase = await createClient();
  const { error } = await supabase.from("chord_shortcuts").delete().eq("id", id);
  return error ? { error: "Couldn't remove that chord." } : {};
}
