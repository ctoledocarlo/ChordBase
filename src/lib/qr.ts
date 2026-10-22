import qrcode from "qrcode-generator";

/**
 * A QR code as a grid of dark and light squares (true = dark), made in the browser so nothing about the link
 * is sent anywhere. Level "M" repairs a few smudged squares, which suits a phone camera pointed at a screen.
 */
export function qrMatrix(text: string): boolean[][] {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => code.isDark(row, col)));
}

/** The squares as one SVG path (a unit square each), so even a big code is a few kilobytes. */
export function qrPath(matrix: boolean[][]): string {
  let d = "";
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  return d;
}
