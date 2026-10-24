/**
 * The columns of a church's schedule. Each church shapes its own: people columns say who serves ("Drums", "Audio"),
 * choice columns pick one value from a list the church writes ("Type of Sunday"), and text columns hold anything typed.
 * A new church starts with the vocals, band and sound booth (the same set the database seeds); admins change it from there.
 */

export type ColumnKind = "people" | "choice" | "text";

export type ScheduleColumn = {
  id: string;
  /** What assignments and event values refer to. It never changes, even if the label does. */
  key: string;
  label: string;
  kind: ColumnKind;
  /** The heading it sits under ("Sound booth"); empty for none. */
  section: string;
  options: string[];
  /** For people columns: the ministries (see lib/ministries.ts) whose people are the likely ones. */
  ministries: string[];
  /** Left out of a day's card until someone is on it or it is asked for. */
  optional: boolean;
  position: number;
  archived: boolean;
};

export const KIND_LABEL: Record<ColumnKind, string> = { people: "People", choice: "Choice", text: "Text" };
export const KIND_HELP: Record<ColumnKind, string> = {
  people: "Who serves: one or more people, like Drums or Dancers.",
  choice: "One pick from a list you write, like the type of Sunday.",
  text: "Anything you type, like the sermon title or a theme.",
};

export const MAX_COLUMNS = 40;
export const MAX_OPTIONS = 40;

type Starter = Pick<ScheduleColumn, "key" | "label" | "section" | "ministries" | "optional">;

/** The starting set, in order. The same columns the database gives a new church. */
export const STARTER_COLUMNS: Starter[] = [
  { key: "song-leader", label: "Song leader", section: "Vocals", ministries: ["stage:vocals"], optional: false },
  { key: "keys", label: "Keys", section: "Band", ministries: ["stage:keys"], optional: false },
  { key: "drums", label: "Drums", section: "Band", ministries: ["stage:drums"], optional: false },
  { key: "bass", label: "Bass", section: "Band", ministries: ["stage:bass"], optional: false },
  { key: "electric-guitar", label: "Electric guitar", section: "Band", ministries: ["stage:electric-guitar"], optional: false },
  { key: "acoustic-guitar", label: "Acoustic guitar", section: "Band", ministries: ["stage:acoustic-guitar"], optional: false },
  { key: "audio", label: "Audio", section: "Sound booth", ministries: ["media:audio"], optional: false },
  { key: "projection", label: "Projection", section: "Sound booth", ministries: ["media:sound-booth"], optional: false },
  { key: "camera", label: "Camera", section: "Sound booth", ministries: ["media:camera"], optional: false },
];

/** Used only when the database has no columns to show yet (the update hasn't been run). */
export const STARTER_AS_COLUMNS: ScheduleColumn[] = STARTER_COLUMNS.map((s, i) => ({ ...s, id: `starter:${s.key}`, kind: "people", options: [], position: (i + 1) * 10, archived: false }));

/** Ideas for the "Add a column" screen. Nothing here is added unless someone picks it. */
export type ColumnIdea = { label: string; kind: ColumnKind; section: string; options?: string[]; ministries?: string[]; hint: string };
export const COLUMN_IDEAS: ColumnIdea[] = [
  { label: "Type of Sunday", kind: "choice", section: "", options: ["Communion Sunday", "Fifth Sunday"], hint: "Communion, missions, anniversary… whatever your church calls them" },
  { label: "Dancers", kind: "people", section: "Other", hint: "Dance team" },
  { label: "Camera 2", kind: "people", section: "Sound booth", ministries: ["media:camera"], hint: "A second camera" },
  { label: "Livestream", kind: "people", section: "Sound booth", ministries: ["media:audio", "media:camera"], hint: "Online service" },
  { label: "Speaker", kind: "people", section: "Other", hint: "Who preaches" },
  { label: "Sermon title", kind: "text", section: "", hint: "Typed in each week" },
  { label: "Ushers", kind: "people", section: "Other", hint: "Welcome and seating" },
  { label: "Greeters", kind: "people", section: "Other", hint: "At the door" },
  { label: "Kids ministry", kind: "people", section: "Other", hint: "Sunday school teachers" },
  { label: "Prayer team", kind: "people", section: "Other", hint: "Prayer ministry" },
  { label: "Saxophone", kind: "people", section: "Band", ministries: ["stage:other"], hint: "Another instrument" },
  { label: "Trumpet", kind: "people", section: "Band", ministries: ["stage:other"], hint: "Another instrument" },
];

export const slugKey = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "column";

export const isActive = (c: ScheduleColumn): boolean => !c.archived;

export const byPosition = (a: ScheduleColumn, b: ScheduleColumn): number => a.position - b.position || a.label.localeCompare(b.label);

/** The columns in use, in order. */
export const activeColumns = (columns: ScheduleColumn[]): ScheduleColumn[] => columns.filter(isActive).sort(byPosition);

export const columnByKey = (columns: ScheduleColumn[]): Map<string, ScheduleColumn> => new Map(columns.map((c) => [c.key, c]));

/** What to call a column in a sentence when it isn't there any more. */
export const labelFor = (columns: Map<string, ScheduleColumn>, key: string): string => columns.get(key)?.label ?? key;

/** The columns grouped under their headings, in the order the headings first appear. "" is shown as "Other". */
export function sectionsOf(columns: ScheduleColumn[]): { title: string; columns: ScheduleColumn[] }[] {
  const out: { title: string; columns: ScheduleColumn[] }[] = [];
  for (const c of activeColumns(columns)) {
    const found = out.find((s) => s.title === c.section);
    if (found) found.columns.push(c);
    else out.push({ title: c.section, columns: [c] });
  }
  return out;
}

/** Whether someone's ministries make them a likely choice for a people column. */
export const suitsColumn = (column: Pick<ScheduleColumn, "ministries">, ministries: readonly string[]): boolean => column.ministries.some((m) => ministries.includes(m));

/** The sections already in use, for suggestions when adding a column. */
export const sectionNames = (columns: ScheduleColumn[]): string[] => [...new Set(activeColumns(columns).map((c) => c.section).filter(Boolean))];
