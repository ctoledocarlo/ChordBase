import * as CFB from "cfb";
import { hasContent, splitLines } from "./text";
import type { Deck, DeckSlide, TextBox } from "./types";

/**
 * Reader for the old binary PowerPoint format (.ppt, PowerPoint 97-2003).
 * A .ppt is a small file system (a "compound file") whose "PowerPoint Document"
 * stream is a tree of records: an 8-byte header (version/instance, type, length)
 * followed by a body that is either data or more records.
 */

const REC = {
  Document: 0x03e8,
  Slide: 0x03ee,
  SlidePersistAtom: 0x03f3,
  SlideListWithText: 0x0ff0,
  UserEditAtom: 0x0ff5,
  PersistDirectoryAtom: 0x1772,
  SpContainer: 0xf004,
  ClientAnchor: 0xf010,
  ClientTextbox: 0xf00d,
  TextHeaderAtom: 0x0f9f,
  TextCharsAtom: 0x0fa0,
  TextBytesAtom: 0x0fa8,
} as const;

/** Positions in a .ppt are in "master units": 576 per inch. */
const UNITS_PER_INCH = 576;

interface Rec {
  type: number;
  instance: number;
  /** True when the body holds more records rather than plain data. */
  container: boolean;
  start: number;
  end: number;
}

class Reader {
  private view: DataView;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get length() {
    return this.bytes.length;
  }
  u16(at: number) {
    return this.view.getUint16(at, true);
  }
  u32(at: number) {
    return this.view.getUint32(at, true);
  }
  i16(at: number) {
    return this.view.getInt16(at, true);
  }
  i32(at: number) {
    return this.view.getInt32(at, true);
  }
  slice(start: number, end: number) {
    return this.bytes.subarray(start, end);
  }

  /** The record that starts at `at`, or null if there isn't a valid one. */
  record(at: number, limit = this.length): Rec | null {
    if (at < 0 || at + 8 > limit) return null;
    const verInst = this.u16(at);
    const len = this.u32(at + 4);
    const end = at + 8 + len;
    if (end > limit) return null;
    return { type: this.u16(at + 2), instance: verInst >> 4, container: (verInst & 0xf) === 0xf, start: at + 8, end };
  }

  /** The records directly inside [start, end). */
  children(start: number, end: number): Rec[] {
    const out: Rec[] = [];
    let at = start;
    while (at + 8 <= end) {
      const rec = this.record(at, end);
      if (!rec) break;
      out.push(rec);
      at = rec.end;
    }
    return out;
  }
}

function decodeText(r: Reader, rec: Rec): string {
  const body = r.slice(rec.start, rec.end);
  // "Chars" atoms are UTF-16; "Bytes" atoms are one byte per character in Windows-1252.
  return rec.type === REC.TextCharsAtom
    ? new TextDecoder("utf-16le").decode(body)
    : new TextDecoder("windows-1252").decode(body);
}

function readShapes(r: Reader, start: number, end: number, into: TextBox[]) {
  for (const rec of r.children(start, end)) {
    if (rec.type === REC.SpContainer) {
      const box = readShape(r, rec);
      if (box) into.push(box);
    } else if (rec.container) {
      // Slide -> drawing -> group of shapes: keep digging.
      readShapes(r, rec.start, rec.end, into);
    }
  }
}

function readShape(r: Reader, shape: Rec): TextBox | null {
  let anchor: { x: number; y: number; width: number; height: number } | null = null;
  let lines: string[] | null = null;
  let isTitle = false;

  for (const child of r.children(shape.start, shape.end)) {
    if (child.type === REC.ClientAnchor) {
      const size = child.end - child.start;
      let top: number, left: number, right: number, bottom: number;
      if (size === 8) {
        [top, left, right, bottom] = [0, 2, 4, 6].map((o) => r.i16(child.start + o));
      } else if (size >= 16) {
        [top, left, right, bottom] = [0, 4, 8, 12].map((o) => r.i32(child.start + o));
      } else continue;
      anchor = {
        x: left / UNITS_PER_INCH,
        y: top / UNITS_PER_INCH,
        width: (right - left) / UNITS_PER_INCH,
        height: (bottom - top) / UNITS_PER_INCH,
      };
    } else if (child.type === REC.ClientTextbox) {
      for (const atom of r.children(child.start, child.end)) {
        if (atom.type === REC.TextHeaderAtom) {
          const kind = r.u32(atom.start);
          isTitle = kind === 0 || kind === 6;
        } else if (atom.type === REC.TextCharsAtom || atom.type === REC.TextBytesAtom) {
          lines = splitLines(decodeText(r, atom));
        }
      }
    }
  }

  if (!lines || !hasContent(lines)) return null;
  // Shapes that inherit their position from the layout have no anchor; they keep document order.
  return { x: anchor?.x ?? 0, y: anchor?.y ?? 0, width: anchor?.width ?? 0, height: anchor?.height ?? 0, lines, isTitle };
}

/** The slides in presentation order, found the way PowerPoint itself finds them. */
function slideOffsetsInOrder(r: Reader, currentUser: Uint8Array | null): number[] | null {
  if (!currentUser || currentUser.length < 20) return null;
  const cu = new DataView(currentUser.buffer, currentUser.byteOffset, currentUser.byteLength);
  // Current User atom: header(8), size(4), headerToken(4), offsetToCurrentEdit(4), ...
  let editAt = cu.getUint32(16, true);

  // Walk the chain of edits, newest first. Newer entries win over older ones.
  const persist = new Map<number, number>();
  let docPersistId = 0;
  const seen = new Set<number>();
  while (editAt > 0 && !seen.has(editAt)) {
    seen.add(editAt);
    const edit = r.record(editAt);
    if (!edit || edit.type !== REC.UserEditAtom) return null;
    const offsetLastEdit = r.u32(edit.start + 8);
    const offsetPersistDirectory = r.u32(edit.start + 12);
    if (docPersistId === 0) docPersistId = r.u32(edit.start + 16);

    const dir = r.record(offsetPersistDirectory);
    if (!dir || dir.type !== REC.PersistDirectoryAtom) return null;
    let p = dir.start;
    while (p + 4 <= dir.end) {
      const head = r.u32(p);
      const firstId = head & 0xfffff;
      const count = head >>> 20;
      p += 4;
      for (let i = 0; i < count && p + 4 <= dir.end; i++, p += 4) {
        if (!persist.has(firstId + i)) persist.set(firstId + i, r.u32(p));
      }
    }
    editAt = offsetLastEdit;
  }

  const docOffset = persist.get(docPersistId);
  if (docOffset === undefined) return null;
  const doc = r.record(docOffset);
  if (!doc || doc.type !== REC.Document) return null;

  // The slide list (instance 0) names the slides in order; each points at a persist id.
  const list = r
    .children(doc.start, doc.end)
    .find((c) => c.type === REC.SlideListWithText && c.instance === 0);
  if (!list) return [];
  const offsets: number[] = [];
  for (const atom of r.children(list.start, list.end)) {
    if (atom.type !== REC.SlidePersistAtom) continue;
    const offset = persist.get(r.u32(atom.start));
    if (offset === undefined) return null;
    offsets.push(offset);
  }
  return offsets;
}

export function readPpt(data: Uint8Array): Deck {
  const file = CFB.read(data, { type: "array" });
  const doc = CFB.find(file, "/PowerPoint Document")?.content;
  if (!doc) throw new Error("This doesn't look like a PowerPoint file.");
  const currentUser = CFB.find(file, "/Current User")?.content;
  const r = new Reader(Uint8Array.from(doc as ArrayLike<number>));

  let offsets = slideOffsetsInOrder(r, currentUser ? Uint8Array.from(currentUser as ArrayLike<number>) : null);
  if (!offsets) {
    // Damaged or unusual file: fall back to every slide in the order they were written.
    offsets = [];
    const scan = (start: number, end: number) => {
      for (const rec of r.children(start, end)) {
        if (rec.type === REC.Slide) offsets!.push(rec.start - 8);
        else if (rec.container) scan(rec.start, rec.end);
      }
    };
    scan(0, r.length);
  }

  const slides: DeckSlide[] = [];
  for (const offset of offsets) {
    const slide = r.record(offset);
    if (!slide || slide.type !== REC.Slide) continue;
    const boxes: TextBox[] = [];
    readShapes(r, slide.start, slide.end, boxes);
    slides.push({ number: slides.length + 1, boxes });
  }
  return { slides };
}
