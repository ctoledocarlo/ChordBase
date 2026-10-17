// Database benchmark: runs ChordBase's real migrations and queries against an in-process
// Postgres (PGlite, the real Postgres compiled to WebAssembly) with row level security on,
// the way Supabase runs them, filled with a library of made-up songs.
//
//   node bench/db/run.mjs --label baseline --rows 10000 --skip 20261025000000_performance.sql,20261026000000_songs_page.sql
//   node bench/db/run.mjs --label optimized --rows 10000
//
// PGlite is slower than native Postgres and has no network between the app and the database,
// so read the numbers as comparisons between runs, not as what Supabase will report.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createBenchDb, root } from "./setup.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const label = args.label ?? "run";
const rows = Number(args.rows ?? 1400);
const runs = Number(args.runs ?? 25);
const skip = new Set((args.skip ?? "").split(",").filter(Boolean));
const only = args.only ? new Set(args.only.split(",")) : null;
const queriesFile = args.queries ?? "bench/db/queries.mjs";
const NL = String.fromCharCode(10);

async function main() {
  const env = await createBenchDb({ rows, skip });
  const { db, counts, sizes } = env;

  const { queries } = await import(new URL(`file:///${resolve(root, queriesFile).replaceAll("\\", "/")}`));
  const all = queries(env);

  // Run them as the signed-in user, with row level security applied.
  await env.signIn();

  const results = [];
  for (const q of all) {
    if (only && !only.has(q.name)) continue;
    const sqls = Array.isArray(q.sql) ? q.sql : [q.sql];
    try {
      const timings = [];
      let rowsOut = 0;
      for (let i = 0; i < runs + 3; i++) {
        const t = performance.now();
        for (const s of sqls) {
          if (q.tx) await db.exec(`begin; ${s}; rollback;`);
          else rowsOut = (await db.query(s)).rows.length;
        }
        if (i >= 3) timings.push(performance.now() - t);
      }
      timings.sort((a, b) => a - b);
      const median = timings[Math.floor(timings.length / 2)];
      const p95 = timings[Math.floor(timings.length * 0.95)];
      // The plan of the main statement: which scans it uses.
      let plan = "";
      if (!q.tx && /^\s*(select|with)/i.test(sqls[0])) {
        const explain = (await db.query(`explain (format json) ${sqls[0]}`)).rows[0]["QUERY PLAN"];
        const kinds = new Set();
        const walk = (n) => {
          kinds.add(n["Node Type"] + (n["Index Name"] ? `(${n["Index Name"]})` : ""));
          (n.Plans ?? []).forEach(walk);
        };
        walk(explain[0].Plan);
        plan = [...kinds].filter((k) => /Scan/.test(k)).join(", ");
      }
      results.push({ name: q.name, what: q.what, median: +median.toFixed(2), p95: +p95.toFixed(2), rows: rowsOut, plan });
    } catch (e) {
      results.push({ name: q.name, what: q.what, error: String(e.message).slice(0, 200) });
    }
  }

  // `--raw "select ..."`: explain any statement as the table owner (no row level security).
  if (args.raw) {
    await env.signOut();
    if (args.noseq) await db.exec("set enable_seqscan = off");
    const plan = (await db.query(`explain (analyze, costs on, timing off) ${args.raw}`)).rows.map((r) => r["QUERY PLAN"]).join(NL);
    console.log(plan.slice(0, 3500));
  }

  const report = { label, rows: counts.songs, setlists: counts.setlists, songsTableSize: sizes.songs, seedMs: Math.round(env.seedMs), results };
  mkdirSync(join(root, "bench/results"), { recursive: true });
  writeFileSync(join(root, `bench/results/db-${label}-${rows}.json`), JSON.stringify(report, null, 2));

  console.log(`${NL}${label}: ${counts.songs} songs (${sizes.songs}), ${counts.setlists} setlists, median of ${runs} runs${NL}`);
  for (const r of results) {
    console.log(
      r.error
        ? `  ${r.name.padEnd(28)} ERROR ${r.error}`
        : `  ${r.name.padEnd(28)} ${String(r.median).padStart(8)} ms   p95 ${String(r.p95).padStart(8)} ms   ${r.plan}`,
    );
  }
  await db.close();
}

main().catch((e) => {
  console.error(String(e.message ?? e).slice(0, 1500));
  process.exit(1);
});
