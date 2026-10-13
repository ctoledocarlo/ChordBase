import { describe, expect, it } from "vitest";
import { buildPpt, buildPptx, slideOf, type SlideSpec } from "./builders";
import { readDeck } from "./deck";
import { readingLines } from "./layout";
import { cleanText, splitLines } from "./text";

const texts = (deck: ReturnType<typeof readDeck>) => deck.slides.map((s) => s.boxes.map((b) => b.lines));

const twoSlides: SlideSpec[] = [slideOf("first slide", "second line"), slideOf("another slide")];

describe("readDeck: .pptx", () => {
  it("reads the lines of every slide, in order", () => {
    const deck = readDeck(buildPptx(twoSlides));
    expect(texts(deck)).toEqual([[["first slide", "second line"]], [["another slide"]]]);
    expect(deck.slides.map((s) => s.number)).toEqual([1, 2]);
  });

  it("keeps blank lines and positions", () => {
    const deck = readDeck(
      buildPptx([{ boxes: [{ x: 1.5, y: 2, width: 4, height: 3, lines: ["a", "", "b"] }] }]),
    );
    const box = deck.slides[0].boxes[0];
    expect(box.lines).toEqual(["a", "", "b"]);
    expect(box).toMatchObject({ x: 1.5, y: 2, width: 4, height: 3 });
  });

  it("follows the presentation's slide order, not the file order", () => {
    const deck = readDeck(buildPptx(twoSlides, [2, 1]));
    expect(texts(deck)).toEqual([[["another slide"]], [["first slide", "second line"]]]);
  });

  it("skips hidden slides", () => {
    const deck = readDeck(buildPptx([slideOf("shown"), { ...slideOf("hidden"), hidden: true }]));
    expect(texts(deck)).toEqual([[["shown"]]]);
  });

  it("decodes special characters", () => {
    const deck = readDeck(buildPptx([slideOf("Tom & Jerry <3")]));
    expect(deck.slides[0].boxes[0].lines).toEqual(["Tom & Jerry <3"]);
  });

  it("notes which box is the title", () => {
    const deck = readDeck(
      buildPptx([{ boxes: [{ x: 0, y: 0, width: 5, height: 1, lines: ["Name"], title: true }, { x: 0, y: 1, width: 5, height: 4, lines: ["words"] }] }]),
    );
    expect(deck.slides[0].boxes.map((b) => b.isTitle)).toEqual([true, false]);
  });

  it("ignores boxes with no real text", () => {
    const deck = readDeck(buildPptx([{ boxes: [{ x: 0, y: 0, width: 1, height: 1, lines: ["*", " "] }, { x: 0, y: 1, width: 1, height: 1, lines: ["real"] }] }]));
    expect(texts(deck)).toEqual([[["real"]]]);
  });

  it("rejects a file that is not a presentation", () => {
    expect(() => readDeck(new Uint8Array([1, 2, 3, 4]))).toThrow(/PowerPoint/);
    expect(() => readDeck(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).toThrow(/PowerPoint/);
  });
});

describe("readDeck: .ppt", () => {
  it("reads slides by scanning when there is no directory", () => {
    const deck = readDeck(buildPpt(twoSlides));
    expect(texts(deck)).toEqual([[["first slide", "second line"]], [["another slide"]]]);
  });

  it("reads positions in inches", () => {
    const deck = readDeck(buildPpt([{ boxes: [{ x: 1.5, y: 2, width: 4, height: 3, lines: ["a"] }] }]));
    const box = deck.slides[0].boxes[0];
    expect(box.x).toBeCloseTo(1.5, 2);
    expect(box.y).toBeCloseTo(2, 2);
    expect(box.width).toBeCloseTo(4, 2);
  });

  it("finds slides through the presentation's own list, in presentation order", () => {
    const slides = [slideOf("one"), slideOf("two"), slideOf("three")];
    // Written to the file as three, one, two; listed in the presentation as one, two, three.
    const deck = readDeck(buildPpt(slides, { withDirectory: true, fileOrder: [3, 1, 2] }));
    expect(texts(deck)).toEqual([[["one"]], [["two"]], [["three"]]]);
  });

  it("marks the title box", () => {
    const deck = readDeck(buildPpt([{ boxes: [{ x: 0, y: 0, width: 5, height: 1, lines: ["Name"], title: true }] }]));
    expect(deck.slides[0].boxes[0].isTitle).toBe(true);
  });

  it("reads several lines in one box", () => {
    const deck = readDeck(buildPpt([slideOf("a", "", "b")]));
    expect(deck.slides[0].boxes[0].lines).toEqual(["a", "", "b"]);
  });

  it("rejects a compound file that is not a presentation", () => {
    expect(() => readDeck(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))).toThrow();
  });
});

describe("readingLines", () => {
  const box = (x: number, y: number, width: number, lines: string[]) => ({ x, y, width, height: 5, lines });

  it("reads a second column after the first, top to bottom", () => {
    const slide = { number: 1, boxes: [box(5.4, 0.1, 5, ["right 1", "right 2"]), box(0.3, 0.2, 5, ["left 1", "left 2"])] };
    expect(readingLines(slide).filter(Boolean)).toEqual(["left 1", "left 2", "right 1", "right 2"]);
  });

  it("reads boxes stacked in one column from the top down", () => {
    const slide = { number: 1, boxes: [box(0.5, 4, 8, ["lower"]), box(0.5, 0.5, 8, ["upper"])] };
    expect(readingLines(slide).filter(Boolean)).toEqual(["upper", "lower"]);
  });

  it("puts a blank line between boxes", () => {
    const slide = { number: 1, boxes: [box(0.3, 0, 5, ["a"]), box(5.4, 0, 5, ["b"])] };
    expect(readingLines(slide)).toEqual(["a", "", "b"]);
  });

  it("keeps boxes with no known position in the order they were written", () => {
    const slide = { number: 1, boxes: [box(0, 0, 0, ["first"]), box(0, 0, 0, ["second"])] };
    expect(readingLines(slide).filter(Boolean)).toEqual(["first", "second"]);
  });
});

describe("text cleaning", () => {
  it("turns a lost apostrophe into one", () => {
    expect(cleanText("Saviour" + String.fromCharCode(0xfffd) + "s hands")).toBe("Saviour's hands");
    expect(cleanText("stray" + String.fromCharCode(0xfffd))).toBe("stray");
  });
  it("turns tabs and non-breaking spaces into spaces", () => {
    expect(cleanText("a\tb")).toBe("a    b");
    expect(cleanText("a" + String.fromCharCode(0xa0) + "b")).toBe("a b");
  });
  it("splits on every kind of line break and trims the ends", () => {
    expect(splitLines("a  \rb\vc\r\nd\ne")).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("keeps the spaces at the start of a line", () => {
    expect(splitLines("    G   C")).toEqual(["    G   C"]);
  });
});
