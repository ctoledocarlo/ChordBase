import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASKS,
  INSTRUMENT_PRESETS,
  everyoneView,
  noteFor,
  notesToShow,
  taskOwner,
  taskProgress,
  tasksFor,
  type SetlistNote,
  type SetlistTask,
  type SetlistView,
} from "./setlist-team";

const views: SetlistView[] = [
  { id: "all", name: "Everyone", kind: "all", show_chords: true, position: 0 },
  { id: "drums", name: "Drums", kind: "instrument", show_chords: false, position: 1 },
  { id: "keys", name: "Keys", kind: "instrument", show_chords: true, position: 2 },
];
const note = (id: string, item_id: string, view_id: string, body: string): SetlistNote => ({ id, item_id, view_id, body, updated_at: "" });
const task = (id: string, view_id: string | null, done = false, position = 0): SetlistTask => ({ id, view_id, label: id, done, done_by: null, position });

describe("notes per song and instrument", () => {
  const notes = [note("n1", "song1", "all", "Start on the 2nd verse"), note("n2", "song1", "drums", "Come in at the chorus"), note("n3", "song1", "keys", "   "), note("n4", "song2", "drums", "Brushes")];

  it("finds a view's note for a song", () => {
    expect(noteFor(notes, "song1", "drums")?.body).toBe("Come in at the chorus");
    expect(noteFor(notes, "song2", "all")).toBeUndefined();
  });

  it("shows everyone's notes first, then the instrument's own", () => {
    expect(notesToShow(notes, views, "song1", "drums").map((n) => n.body)).toEqual(["Start on the 2nd verse", "Come in at the chorus"]);
  });

  it("leaves out empty notes and other instruments' notes", () => {
    expect(notesToShow(notes, views, "song1", "keys").map((n) => n.body)).toEqual(["Start on the 2nd verse"]);
    expect(notesToShow(notes, views, "song2", "keys")).toEqual([]);
  });

  it("shows only the shared notes on the shared view, or with no view chosen", () => {
    expect(notesToShow(notes, views, "song1", "all").map((n) => n.body)).toEqual(["Start on the 2nd verse"]);
    expect(notesToShow(notes, views, "song1", null).map((n) => n.body)).toEqual(["Start on the 2nd verse"]);
  });

  it("finds the shared view", () => {
    expect(everyoneView(views)?.id).toBe("all");
    expect(everyoneView([])).toBeUndefined();
  });
});

describe("the pre-service checklist", () => {
  const tasks = [task("a", null, true, 2), task("b", "drums", false, 1), task("c", "keys", true, 0), task("d", null, false, 3)];

  it("gives each instrument everyone's tasks and its own", () => {
    expect(tasksFor(tasks, views, "drums").map((t) => t.id)).toEqual(["b", "a", "d"]);
    expect(tasksFor(tasks, views, "keys").map((t) => t.id)).toEqual(["c", "a", "d"]);
  });

  it("gives the shared view, or no view, only everyone's tasks", () => {
    expect(tasksFor(tasks, views, "all").map((t) => t.id)).toEqual(["a", "d"]);
    expect(tasksFor(tasks, views, null).map((t) => t.id)).toEqual(["a", "d"]);
  });

  it("gives the person running things all of it, in order", () => {
    expect(tasksFor(tasks, views, null, true).map((t) => t.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("counts what is done, and names who a task is for", () => {
    expect(taskProgress(tasks)).toEqual({ done: 2, total: 4 });
    expect(taskProgress([])).toEqual({ done: 0, total: 0 });
    expect(taskOwner(tasks[1], views)).toBe("Drums");
    expect(taskOwner(tasks[0], views)).toBe("Everyone");
  });
});

describe("starting points", () => {
  it("offers common instruments, with chords off for the ones that don't read them", () => {
    expect(INSTRUMENT_PRESETS.find((p) => p.name === "Drums")?.show_chords).toBe(false);
    expect(INSTRUMENT_PRESETS.find((p) => p.name === "Keys")?.show_chords).toBe(true);
    expect(new Set(INSTRUMENT_PRESETS.map((p) => p.name)).size).toBe(INSTRUMENT_PRESETS.length);
    expect(DEFAULT_TASKS.length).toBeGreaterThan(2);
  });
});
