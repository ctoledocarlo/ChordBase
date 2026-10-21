/**
 * The team side of a setlist: a view for each instrument, notes per song and per view, the pre-service
 * checklist, and singers. Types, and the small rules for what each screen gets to see.
 */

export type SetlistView = {
  id: string;
  name: string;
  /** "all" is the view everyone shares; the others are instruments the team added. */
  kind: "all" | "instrument";
  /** Whether this view shows the chords (a drummer may only want the words and the notes). */
  show_chords: boolean;
  position: number;
};

export type SetlistNote = { id: string; item_id: string; view_id: string; body: string; updated_at: string };

export type SetlistTask = {
  id: string;
  /** Null for everyone's; otherwise the view it belongs to. */
  view_id: string | null;
  label: string;
  done: boolean;
  /** Who ticked it (the name of their view), for the person running the service. */
  done_by: string | null;
  position: number;
};

export type Singer = { id: string; name: string; range_low: string; range_high: string };

export type TeamExtras = { views: SetlistView[]; notes: SetlistNote[]; tasks: SetlistTask[] };

export const VIEW_COLUMNS = "id, name, kind, show_chords, position";
export const NOTE_COLUMNS = "id, item_id, view_id, body, updated_at";
export const TASK_COLUMNS = "id, view_id, label, done, done_by, position";
export const SINGER_COLUMNS = "id, name, range_low, range_high";

export const MAX_NOTE = 2000;
export const MAX_VIEW_NAME = 40;
export const MAX_TASK = 120;

/** Instruments to add with one tap. Drums, vocals and tech don't read chords, so those views start with them off. */
export const INSTRUMENT_PRESETS: { name: string; show_chords: boolean }[] = [
  { name: "Keys", show_chords: true },
  { name: "Acoustic guitar", show_chords: true },
  { name: "Electric guitar", show_chords: true },
  { name: "Bass", show_chords: true },
  { name: "Drums", show_chords: false },
  { name: "Vocals", show_chords: false },
  { name: "Tech and media", show_chords: false },
];

/** The checklist offered to start from. */
export const DEFAULT_TASKS = [
  "Sound check done",
  "Instruments tuned",
  "Monitors and in-ears set",
  "Slides and lyrics ready",
  "Keys and capos confirmed",
];

/** The view everyone shares, if the setlist has it yet. */
export const everyoneView = (views: SetlistView[]) => views.find((v) => v.kind === "all");

export const noteFor = (notes: SetlistNote[], itemId: string, viewId: string) =>
  notes.find((n) => n.item_id === itemId && n.view_id === viewId);

/**
 * What a screen on this view should read for a song: the notes for everyone, then the ones for its own
 * instrument. Empty notes are left out.
 */
export function notesToShow(notes: SetlistNote[], views: SetlistView[], itemId: string, viewId: string | null) {
  const everyone = everyoneView(views);
  const own = views.find((v) => v.id === viewId);
  const wanted = [everyone, own && own.kind !== "all" ? own : undefined].filter((v): v is SetlistView => !!v);
  return wanted
    .map((view) => ({ view, body: noteFor(notes, itemId, view.id)?.body.trim() ?? "" }))
    .filter((n) => n.body !== "");
}

/**
 * The checklist items someone on this view should see: everyone's, and their own instrument's.
 * `null` (or the shared view) sees only everyone's. The person running the service passes `all` to see everything.
 */
export function tasksFor(tasks: SetlistTask[], views: SetlistView[], viewId: string | null, all = false): SetlistTask[] {
  const own = views.find((v) => v.id === viewId);
  return tasks
    .filter((t) => all || t.view_id === null || (own && own.kind !== "all" && t.view_id === own.id))
    .sort((a, b) => a.position - b.position);
}

export function taskProgress(tasks: SetlistTask[]): { done: number; total: number } {
  return { done: tasks.filter((t) => t.done).length, total: tasks.length };
}

/** "Sound check" or "Drums: sound check", for showing which instrument a task is for. */
export function taskOwner(task: SetlistTask, views: SetlistView[]): string {
  return views.find((v) => v.id === task.view_id)?.name ?? "Everyone";
}
