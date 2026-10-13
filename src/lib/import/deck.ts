import { readPpt } from "./ppt";
import { readPptx } from "./pptx";
import type { Deck } from "./types";

/** Reads a PowerPoint file in either format, deciding by what is inside rather than the file name. */
export function readDeck(data: Uint8Array): Deck {
  // .pptx is a zip ("PK"); .ppt is an old-style compound file (D0 CF 11 E0).
  if (data[0] === 0x50 && data[1] === 0x4b) return readPptx(data);
  if (data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0) return readPpt(data);
  throw new Error("This isn't a PowerPoint file (.ppt or .pptx).");
}
