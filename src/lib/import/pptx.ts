import { strFromU8, unzipSync } from "fflate";
import { hasContent, splitLines } from "./text";
import type { Deck, DeckSlide, TextBox } from "./types";

/**
 * Reader for .pptx files. A .pptx is a zip of XML files; each slide is
 * ppt/slides/slideN.xml, and ppt/presentation.xml lists them in order.
 * The XML is scanned with patterns rather than a full parser: PowerPoint's
 * text markup is regular, and this runs the same in the browser and in tests.
 */

const EMU_PER_INCH = 914400;

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** The text of one `<a:p>` paragraph. A soft line break inside it becomes a newline. */
function paragraphText(paragraph: string): string {
  let out = "";
  for (const m of paragraph.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?>/g)) {
    out += m[1] === undefined ? "\n" : decodeEntities(m[1]);
  }
  return out;
}

/** Every line of text inside a `<p:txBody>` / `<a:txBody>` block; empty paragraphs give empty lines. */
function bodyLines(xml: string): string[] {
  const lines: string[] = [];
  for (const m of xml.matchAll(/<a:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:p>)/g)) {
    lines.push(...splitLines(paragraphText(m[1] ?? "")));
  }
  return lines;
}

function frame(xml: string) {
  const off = /<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/.exec(xml);
  const ext = /<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(xml);
  return {
    x: off ? Number(off[1]) / EMU_PER_INCH : 0,
    y: off ? Number(off[2]) / EMU_PER_INCH : 0,
    width: ext ? Number(ext[1]) / EMU_PER_INCH : 0,
    height: ext ? Number(ext[2]) / EMU_PER_INCH : 0,
  };
}

function readSlideXml(xml: string): TextBox[] {
  const boxes: TextBox[] = [];

  for (const sp of xml.matchAll(/<p:sp[ >][\s\S]*?<\/p:sp>/g)) {
    const body = /<p:txBody>[\s\S]*?<\/p:txBody>/.exec(sp[0]);
    if (!body) continue;
    const lines = bodyLines(body[0]);
    if (!hasContent(lines)) continue;
    const type = /<p:ph\b[^>]*\btype="(\w+)"/.exec(sp[0])?.[1];
    boxes.push({ ...frame(/<p:spPr[^>]*>[\s\S]*?<\/p:spPr>/.exec(sp[0])?.[0] ?? ""), lines, isTitle: type === "title" || type === "ctrTitle" });
  }

  // Tables: every cell is its own box, placed by the column widths and row heights.
  for (const gf of xml.matchAll(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g)) {
    const origin = frame(/<p:xfrm[^>]*>[\s\S]*?<\/p:xfrm>/.exec(gf[0])?.[0] ?? "");
    const widths = [...gf[0].matchAll(/<a:gridCol\b[^>]*\bw="(\d+)"/g)].map((m) => Number(m[1]) / EMU_PER_INCH);
    let y = origin.y;
    for (const row of gf[0].matchAll(/<a:tr\b([^>]*)>([\s\S]*?)<\/a:tr>/g)) {
      const height = Number(/\bh="(\d+)"/.exec(row[1])?.[1] ?? 0) / EMU_PER_INCH;
      let x = origin.x;
      let col = 0;
      for (const cell of row[2].matchAll(/<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g)) {
        const lines = bodyLines(cell[1]);
        if (hasContent(lines)) boxes.push({ x, y, width: widths[col] ?? 0, height, lines });
        x += widths[col] ?? 0;
        col++;
      }
      y += height;
    }
  }
  return boxes;
}

/** Slide file names in presentation order, falling back to numeric order. */
function slideOrder(files: Record<string, Uint8Array>): string[] {
  const all = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));

  const presentation = files["ppt/presentation.xml"];
  const rels = files["ppt/_rels/presentation.xml.rels"];
  if (!presentation || !rels) return all;

  const targets = new Map<string, string>();
  for (const tag of strFromU8(rels).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(tag[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag[0])?.[1];
    if (id && target) targets.set(id, "ppt/" + target.replace(/^\/?(ppt\/)?/, ""));
  }
  const ordered: string[] = [];
  for (const m of strFromU8(presentation).matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)) {
    const file = targets.get(m[1]);
    if (file && files[file]) ordered.push(file);
  }
  return ordered.length > 0 ? ordered : all;
}

export function readPptx(data: Uint8Array): Deck {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) => /^ppt\/(slides\/slide\d+\.xml|presentation\.xml|_rels\/presentation\.xml\.rels)$/.test(f.name),
    });
  } catch {
    throw new Error("This doesn't look like a PowerPoint file.");
  }

  const slides: DeckSlide[] = [];
  for (const name of slideOrder(files)) {
    const xml = strFromU8(files[name]);
    if (/<p:sld\b[^>]*\bshow="0"/.test(xml)) continue; // hidden slide
    slides.push({ number: slides.length + 1, boxes: readSlideXml(xml) });
  }
  return { slides };
}
