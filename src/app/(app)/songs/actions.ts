"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentChurch } from "@/lib/church";
import { createClient } from "@/lib/supabase/server";

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
    body: text(formData, "body").replace(/\r\n?/g, "\n"),
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
