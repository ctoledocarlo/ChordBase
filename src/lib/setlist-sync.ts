import type { SetlistItem } from "./setlists";

export type MergeResult = {
  items: SetlistItem[];
  /** Songs that appeared in the setlist from somewhere else. */
  added: SetlistItem[];
  /** Songs that were taken out of the setlist somewhere else. */
  removed: SetlistItem[];
  /** Songs whose settings, chords or text changed somewhere else. */
  updated: SetlistItem[];
  /** The song being edited here had its chords changed somewhere else too; the local version was kept. */
  conflict: SetlistItem | null;
};

const same = (a: SetlistItem, b: SetlistItem) =>
  a.body_override === b.body_override &&
  (a.singer_id ?? null) === (b.singer_id ?? null) &&
  a.transition.mode === b.transition.mode &&
  a.transition.chords === b.transition.chords &&
  JSON.stringify(a.settings) === JSON.stringify(b.settings) &&
  JSON.stringify(a.song) === JSON.stringify(b.song);

/**
 * Brings this screen's copy of a setlist up to date with the one on the server. The server's
 * order wins. A song with changes still waiting to be saved from this screen (`pendingIds`)
 * keeps the local version, and a song whose chords are being edited here (`editingId`) keeps
 * the local version too and is reported as a conflict, so nothing typed here is lost.
 */
export function mergeRemote(
  local: SetlistItem[],
  remote: SetlistItem[],
  opts: { pendingIds: ReadonlySet<string>; editingId: string | null },
): MergeResult {
  const localById = new Map(local.map((i) => [i.id, i]));
  const remoteIds = new Set(remote.map((i) => i.id));
  const added: SetlistItem[] = [];
  const updated: SetlistItem[] = [];
  let conflict: SetlistItem | null = null;

  const items = remote.map((r) => {
    const l = localById.get(r.id);
    if (!l) {
      added.push(r);
      return r;
    }
    if (opts.pendingIds.has(r.id) || same(l, r)) return l;
    if (opts.editingId === r.id && l.body_override !== r.body_override) {
      conflict = r;
      return l;
    }
    updated.push(r);
    return r;
  });

  return { items, added, removed: local.filter((i) => !remoteIds.has(i.id)), updated, conflict };
}
