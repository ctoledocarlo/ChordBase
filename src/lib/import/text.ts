// Special characters are built from their codes so the source stays plain ASCII.
const ch = (code: number) => String.fromCharCode(code);

const NBSP = ch(0xa0);
const REPLACEMENT = ch(0xfffd);
const ZERO_WIDTH = [ch(0x200b), ch(0xfeff)];
const LINE_BREAK = new RegExp(["\\r\\n", "\\r", "\\n", ch(0x0b), ch(0x2028), ch(0x2029)].join("|"));
const CONTROL = /[\x00-\x08\x0e-\x1f\x7f]/g;

/** Turns raw text from a slide into clean text: no stray control characters, tabs as spaces. */
export function cleanText(raw: string): string {
  let text = raw.split(NBSP).join(" ");
  // A replacement character between two letters is almost always a lost apostrophe.
  text = text.replace(new RegExp("(\\p{L})" + REPLACEMENT + "(\\p{L})", "gu"), "$1'$2");
  text = text.split(REPLACEMENT).join("");
  for (const z of ZERO_WIDTH) text = text.split(z).join("");
  return text.replace(/\t/g, "    ").replace(CONTROL, "");
}

/** Splits text on every kind of line break PowerPoint uses (paragraph, soft break, CR/LF). */
export function splitLines(raw: string): string[] {
  return cleanText(raw)
    .split(LINE_BREAK)
    .map((line) => line.replace(/\s+$/, ""));
}

/** Text that is only a bullet, an asterisk or similar is not worth keeping as a box. */
export function hasContent(lines: string[]): boolean {
  return lines.some((l) => /[\p{L}\p{N}]/u.test(l));
}
