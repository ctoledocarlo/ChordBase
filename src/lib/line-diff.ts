export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** Songs are a few hundred lines; beyond this the comparison is skipped rather than slowing the page down. */
const MAX_LINES = 3000;

const lines = (text: string) => (text === "" ? [] : text.replace(/\r\n?/g, "\n").split("\n"));

/**
 * The lines that differ between two texts, in reading order: "removed" lines are in `before` only, "added" lines
 * in `after` only. It finds the longest run of lines the two share and marks everything else, so one changed word
 * shows as one removed line and one added line rather than the whole song. Returns null when a text is too long to compare.
 */
export function diffLines(before: string, after: string): DiffLine[] | null {
  const a = lines(before);
  const b = lines(after);
  if (a.length > MAX_LINES || b.length > MAX_LINES) return null;

  // Trim the lines both texts start and end with: most edits are in the middle, and this keeps the table small.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - start;
  const m = endB - start;
  // common[i][j]: how many lines the tails a[start+i..] and b[start+j..] have in common.
  const common = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i][j] = a[start + i] === b[start + j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }

  const out: DiffLine[] = a.slice(0, start).map((text) => ({ kind: "same", text }));
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      out.push({ kind: "same", text: a[start + i] });
      i++;
      j++;
    } else if (i < n && (j === m || common[i + 1][j] >= common[i][j + 1])) {
      // Taking out comes before putting in, so a changed line reads as the old one then the new one.
      out.push({ kind: "removed", text: a[start + i] });
      i++;
    } else {
      out.push({ kind: "added", text: b[start + j] });
      j++;
    }
  }
  for (const text of a.slice(endA)) out.push({ kind: "same", text });
  return out;
}

/** How many lines were added and removed. */
export function diffCounts(diff: DiffLine[]): { added: number; removed: number } {
  return {
    added: diff.filter((l) => l.kind === "added").length,
    removed: diff.filter((l) => l.kind === "removed").length,
  };
}

export type DiffRow = DiffLine | { kind: "gap"; hidden: number };

/** The changed lines with a little of what surrounds them; long stretches of unchanged lines become one "gap". */
export function withContext(diff: DiffLine[], context = 2): DiffRow[] {
  const keep = new Array<boolean>(diff.length).fill(false);
  diff.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k++) keep[k] = true;
  });
  const rows: DiffRow[] = [];
  let hidden = 0;
  diff.forEach((line, i) => {
    if (keep[i]) {
      if (hidden > 0) rows.push({ kind: "gap", hidden });
      hidden = 0;
      rows.push(line);
    } else {
      hidden++;
    }
  });
  if (hidden > 0) rows.push({ kind: "gap", hidden });
  return rows;
}
