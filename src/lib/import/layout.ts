import type { DeckSlide, TextBox } from "./types";

interface Placed {
  box: TextBox;
  /** Position in the file, to keep boxes with identical positions in order. */
  order: number;
}

const right = (b: TextBox) => b.x + b.width;

/** How much two boxes overlap sideways, as a share of the narrower box. */
function sidewaysOverlap(a: { left: number; right: number }, b: TextBox): number {
  const narrow = Math.min(a.right - a.left, b.width);
  if (narrow <= 0) return 1; // size unknown: treat as the same column
  return (Math.min(a.right, right(b)) - Math.max(a.left, b.x)) / narrow;
}

/**
 * The slide's text in the order a person reads it: columns from left to right,
 * and top to bottom inside each column. A chord chart that runs onto a second
 * text box beside the first reads straight on from one to the other.
 */
export function readingLines(slide: DeckSlide): string[] {
  const placed: Placed[] = slide.boxes.map((box, order) => ({ box, order }));
  placed.sort((a, b) => a.box.x - b.box.x || a.order - b.order);

  const columns: { left: number; right: number; items: Placed[] }[] = [];
  for (const item of placed) {
    const column = columns.find((c) => sidewaysOverlap(c, item.box) > 0.4);
    if (column) {
      column.items.push(item);
      column.left = Math.min(column.left, item.box.x);
      column.right = Math.max(column.right, right(item.box));
    } else {
      columns.push({ left: item.box.x, right: right(item.box), items: [item] });
    }
  }

  columns.sort((a, b) => a.left - b.left);
  const lines: string[] = [];
  for (const column of columns) {
    column.items.sort((a, b) => a.box.y - b.box.y || a.order - b.order);
    for (const { box } of column.items) {
      // A blank line between boxes keeps a chord line at the end of one from pairing with the next.
      if (lines.length > 0) lines.push("");
      lines.push(...box.lines);
    }
  }
  return lines;
}
