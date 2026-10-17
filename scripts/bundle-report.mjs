// How much JavaScript each page downloads on first load, from the last `npm run build`:
//   npm run build && npm run bench:bundle
// "Raw" is what the build writes; "gzip" is about what travels over the network.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, ".next");
const label = process.argv[3] ?? "";
const stats = JSON.parse(readFileSync(join(dist, "diagnostics/route-bundle-stats.json"), "utf8"));

const rows = stats
  .map((r) => {
    let raw = 0;
    let gz = 0;
    for (const p of r.firstLoadChunkPaths) {
      const file = readFileSync(join(dist, "..", p.replaceAll("\\", "/")));
      raw += file.length;
      gz += gzipSync(file).length;
    }
    return { route: r.route, rawKB: +(raw / 1024).toFixed(1), gzipKB: +(gz / 1024).toFixed(1), chunks: r.firstLoadChunkPaths.length };
  })
  .sort((a, b) => b.gzipKB - a.gzipKB);

console.log("route".padEnd(22) + "raw KB".padStart(10) + "gzip KB".padStart(10) + "  chunks");
for (const r of rows) console.log(r.route.padEnd(22) + String(r.rawKB).padStart(10) + String(r.gzipKB).padStart(10) + `  ${r.chunks}`);

if (label) {
  mkdirSync(join(root, "bench/results"), { recursive: true });
  writeFileSync(join(root, `bench/results/bundle-${label}.json`), JSON.stringify(rows, null, 2));
}
