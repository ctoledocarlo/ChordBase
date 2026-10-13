/**
 * Builds tiny PowerPoint files in memory, for tests. The text is whatever the
 * test supplies, so no real songs are needed.
 */
import * as CFB from "cfb";
import { strToU8, zipSync } from "fflate";

export interface BoxSpec {
  /** Position in inches. */
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  title?: boolean;
}

export interface SlideSpec {
  boxes: BoxSpec[];
  hidden?: boolean;
}

/** A single-box slide at the top-left, for tests that only care about the text. */
export const slideOf = (...lines: string[]): SlideSpec => ({
  boxes: [{ x: 0.5, y: 0.5, width: 9, height: 6, lines }],
});

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- .pptx --------------------------------------------------------------------

const EMU = 914400;

function slideXml(slide: SlideSpec): string {
  const shapes = slide.boxes
    .map((b, i) => {
      const paragraphs = b.lines
        .map((l) => (l === "" ? "<a:p/>" : `<a:p><a:r><a:t>${escapeXml(l)}</a:t></a:r></a:p>`))
        .join("");
      const ph = b.title ? '<p:ph type="title"/>' : "";
      return (
        `<p:sp><p:nvSpPr><p:cNvPr id="${i + 2}" name="Box ${i}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
        `<p:spPr bwMode="auto"><a:xfrm><a:off x="${Math.round(b.x * EMU)}" y="${Math.round(b.y * EMU)}"/>` +
        `<a:ext cx="${Math.round(b.width * EMU)}" cy="${Math.round(b.height * EMU)}"/></a:xfrm></p:spPr>` +
        `<p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp>`
      );
    })
    .join("");
  const show = slide.hidden ? ' show="0"' : "";
  return `<?xml version="1.0"?><p:sld${show} xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;
}

/**
 * `order` lists which slide files come first in the presentation (1-based file numbers),
 * so a test can make the file order differ from the presentation order.
 */
export function buildPptx(slides: SlideSpec[], order?: number[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  slides.forEach((s, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(slideXml(s));
  });
  const sequence = order ?? slides.map((_, i) => i + 1);
  files["ppt/presentation.xml"] = strToU8(
    `<p:presentation><p:sldIdLst>${sequence.map((n, i) => `<p:sldId id="${256 + i}" r:id="rId${n}"/>`).join("")}</p:sldIdLst></p:presentation>`,
  );
  files["ppt/_rels/presentation.xml.rels"] = strToU8(
    `<Relationships>${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`,
  );
  return zipSync(files);
}

// ---- .ppt ---------------------------------------------------------------------

const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const i16 = (n: number) => u16(n < 0 ? n + 65536 : n);

function record(type: number, body: number[], opts: { container?: boolean; instance?: number } = {}): number[] {
  const verInst = ((opts.instance ?? 0) << 4) | (opts.container ? 0xf : 0);
  return [...u16(verInst), ...u16(type), ...u32(body.length), ...body];
}

function utf16(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) out.push(...u16(text.charCodeAt(i)));
  return out;
}

function slideRecord(slide: SlideSpec): number[] {
  const shapes = slide.boxes.flatMap((b) => {
    const units = (inches: number) => Math.round(inches * 576);
    const anchor = record(0xf010, [
      ...i16(units(b.y)),
      ...i16(units(b.x)),
      ...i16(units(b.x + b.width)),
      ...i16(units(b.y + b.height)),
    ]);
    const header = record(0x0f9f, u32(b.title ? 0 : 4));
    // Paragraphs are separated by a carriage return, as PowerPoint writes them.
    const text = record(0x0fa0, utf16(b.lines.join("\r")));
    const textbox = record(0xf00d, [...header, ...text], { container: true });
    return record(0xf004, [...anchor, ...textbox], { container: true });
  });
  const drawing = record(0x040c, shapes, { container: true });
  return record(0x03ee, drawing, { container: true });
}

export interface PptOptions {
  /**
   * Write the "current user" and persist-directory records, so slides are found by the
   * presentation's own slide list (the way PowerPoint does) rather than by scanning.
   */
  withDirectory?: boolean;
  /** Write the slides to the file in this order (1-based), while the presentation lists them in order. */
  fileOrder?: number[];
}

export function buildPpt(slides: SlideSpec[], options: PptOptions = {}): Uint8Array {
  const visible = slides.filter((s) => !s.hidden);
  const fileOrder = options.fileOrder ?? visible.map((_, i) => i + 1);

  const stream: number[] = [];
  const offsetOfSlide = new Map<number, number>();
  for (const n of fileOrder) {
    offsetOfSlide.set(n, stream.length);
    stream.push(...slideRecord(visible[n - 1]));
  }

  const cfb = CFB.utils.cfb_new();
  if (options.withDirectory) {
    // Persist ids: 1 is the document, 2.. are the slides in presentation order.
    const persistAtoms = visible.flatMap((_, i) => record(0x03f3, [...u32(i + 2), ...u32(0), ...u32(0), ...u32(256 + i), ...u32(0)]));
    const slideList = record(0x0ff0, persistAtoms, { container: true, instance: 0 });
    const docOffset = stream.length;
    stream.push(...record(0x03e8, slideList, { container: true }));

    const dirOffset = stream.length;
    const offsets = [docOffset, ...visible.map((_, i) => offsetOfSlide.get(i + 1) as number)];
    stream.push(...record(0x1772, [...u32(1 | (offsets.length << 20)), ...offsets.flatMap(u32)]));

    const editOffset = stream.length;
    stream.push(
      ...record(0x0ff5, [...u32(0), ...u32(0), ...u32(0), ...u32(dirOffset), ...u32(1), ...u32(visible.length + 2), ...u16(0), ...u16(0)]),
    );
    const currentUser = record(0x0ff6, [...u32(20), ...u32(0xe391c05f), ...u32(editOffset), ...u16(0), ...u16(0), 3, 0, ...u16(0)]);
    CFB.utils.cfb_add(cfb, "Current User", Uint8Array.from(currentUser));
  }
  CFB.utils.cfb_add(cfb, "PowerPoint Document", Uint8Array.from(stream));
  return Uint8Array.from(CFB.write(cfb, { type: "array" }) as ArrayLike<number>);
}
