"use client";

import { useActionState, useMemo, useState } from "react";
import { saveSong, type SongFormState } from "@/app/(app)/songs/actions";
import { parseChordPro } from "@/lib/chords";
import type { Song } from "@/lib/songs";
import { ChordSheet } from "./chord-sheet";

const initial: SongFormState = {};

const inputCls =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
        className={inputCls}
      />
    </label>
  );
}

export function SongEditor({ song }: { song?: Song }) {
  const [state, action, pending] = useActionState(saveSong, initial);
  const [body, setBody] = useState(song?.body ?? "");
  const parsed = useMemo(() => parseChordPro(body), [body]);

  return (
    <form action={action} className="space-y-6">
      {song && <input type="hidden" name="id" value={song.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" name="title" defaultValue={song?.title} required />
        <Field label="Artist" name="artist" defaultValue={song?.artist} />
        <Field label="Original key" name="original_key" defaultValue={song?.original_key} placeholder="G, Bb, F#m" />
        <Field label="Default capo" name="default_capo" type="number" defaultValue={song?.default_capo ?? 0} />
        <Field label="Tempo (BPM)" name="tempo" type="number" defaultValue={song?.tempo} />
        <Field label="Time signature" name="time_signature" defaultValue={song?.time_signature ?? "4/4"} />
        <Field label="CCLI number" name="ccli_number" defaultValue={song?.ccli_number} />
        <Field label="Tags (comma separated)" name="tags" defaultValue={song?.tags.join(", ")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm font-medium">
          Lyrics and chords
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={20}
            spellCheck={false}
            placeholder={"{start_of_verse}\n[G]Amazing [C]grace how [G]sweet the [D]sound\n{end_of_verse}"}
            className={`${inputCls} font-mono text-sm`}
          />
          <span className="mt-1 block text-xs font-normal text-zinc-500">
            Put chords in square brackets right before the syllable they fall on.
          </span>
        </label>
        <div>
          <p className="text-sm font-medium">Preview</p>
          <div className="mt-1 min-h-40 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <ChordSheet song={parsed} fontSize={16} />
          </div>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save song"}
      </button>
    </form>
  );
}
