/** A block of text on a slide, with where it sits (in inches from the top-left corner). */
export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** One entry per line of text, in the order they appear in the box. */
  lines: string[];
  /** True when the file marks this as the slide's title placeholder. */
  isTitle?: boolean;
}

export interface DeckSlide {
  /** Position in the presentation, starting at 1. */
  number: number;
  boxes: TextBox[];
}

/** The text of a whole presentation, whatever file format it came from. */
export interface Deck {
  slides: DeckSlide[];
}

/** A file the user picked: its name and raw bytes. */
export interface InputFile {
  name: string;
  data: Uint8Array;
}
