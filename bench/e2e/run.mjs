// End-to-end benchmark of the real Next.js production server.
//
//   node bench/e2e/run.mjs --label baseline --latency 30
//
// It copies the app to a temp folder, builds it pointing at a stand-in for Supabase
// (bench/e2e/stub-supabase.mjs, which answers after a fixed delay like a database a few
// milliseconds away would), signs in with a made-up session, and loads each page a number of times.
// For every page it reports how long the page took, how many database requests it made, and how
// many "waves" of them (requests that had to wait for an earlier one to finish).

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, parse } from "node:path";
import { IDS, startStub } from "./stub-supabase.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? "true"]] : acc), []),
);
const label = args.label ?? "run";
const fromGit = args["from-git"] ?? null; // measure an earlier commit instead of the working tree
const latency = Number(args.latency ?? 30);
const runs = Number(args.runs ?? 15);
const STUB_PORT = 54399;
const APP_PORT = 3999;

const repo = resolve(import.meta.dirname, "../..");
const work = join(tmpdir(), `chordbase-bench-${label}`);

function prepare() {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const files = ["src", "public", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "next-env.d.ts"];
  if (fromGit) {
    const paths = files.filter((f) => spawnSync("git", ["cat-file", "-e", `${fromGit}:${f}`], { cwd: repo }).status === 0);
    const res = spawnSync(`git archive --format=tar ${fromGit} ${paths.join(" ")} | tar -x -C "${work}"`, { cwd: repo, shell: true, encoding: "utf8" });
    if (res.status !== 0) throw new Error(`couldn't read ${fromGit}: ${res.stderr}`);
  } else {
    for (const f of files) {
      if (existsSync(join(repo, f))) cpSync(join(repo, f), join(work, f), { recursive: true });
    }
  }
  // The copy shares this project's installed packages instead of reinstalling them.
  symlinkSync(join(repo, "node_modules"), join(work, "node_modules"), "junction");

  // Turbopack must be allowed to read the shared packages, which live outside the copy.
  const root = parse(repo).root === parse(work).root ? commonAncestor(repo, work) : repo;
  const config = readFileSync(join(work, "next.config.ts"), "utf8").replace("turbopack: {", `turbopack: {\n    root: ${JSON.stringify(root)},`);
  writeFileSync(join(work, "next.config.ts"), config);
}

function commonAncestor(a, b) {
  const pa = a.split(/[\\/]/);
  const pb = b.split(/[\\/]/);
  const out = [];
  for (let i = 0; i < Math.min(pa.length, pb.length) && pa[i] === pb[i]; i++) out.push(pa[i]);
  return out.join("\\") || parse(a).root;
}

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "bench-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "bench-service-key",
  NEXT_TELEMETRY_DISABLED: "1",
};
const nextBin = join(repo, "node_modules/next/dist/bin/next");

async function main() {
  console.log(`preparing ${work}`);
  prepare();

  console.log("building…");
  const build = spawnSync(process.execPath, [nextBin, "build"], { cwd: work, env, encoding: "utf8" });
  if (build.status !== 0) {
    console.error((build.stdout + build.stderr).slice(-2500));
    process.exit(1);
  }

  const stub = await startStub({ port: STUB_PORT, latencyMs: latency });
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(APP_PORT)], { cwd: work, env, stdio: "ignore" });

  const base = `http://127.0.0.1:${APP_PORT}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/welcome`);
      if (r.ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // `--serve`: don't measure, just keep the signed-in app running so it can be looked at by hand. Open
  // http://127.0.0.1:3999 and, in the page, run:
  //   fetch("http://127.0.0.1:54399/__session").then(r => r.json()).then(s => { document.cookie = s.cookie + "; path=/"; location.reload(); })
  if (args.serve) {
    console.log("serving on http://127.0.0.1:3999 (stand-in database on :54399); Ctrl+C to stop");
    await new Promise(() => {});
  }

  const cookie = stub.sessionCookie();
  const pages = [
    ["home (songs list)", "/"],
    ["search a word", "/?q=grace"],
    ["filter + sort", "/?key=G&key=D&sort=tempo"],
    ["song page", `/songs/${IDS.song}`],
    ["setlists list", "/setlists"],
    ["open a setlist", `/setlists/${IDS.setlist}`],
  ];

  // Server actions are posted to the page that uses them, by the id the build gave them.
  const manifest = JSON.parse(readFileSync(join(work, ".next/server/server-reference-manifest.json"), "utf8")).node;
  const actionId = (name) => Object.keys(manifest).find((id) => manifest[id].exportedName === name);
  const items = Array.from({ length: 14 }, (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`);
  const settings = { semitones: 2, capo: 0, spelling: "auto", showChords: true, fontSize: 0, style: "original" };
  const actions = [
    ["action: put song on stage", "setActiveItem", `/setlists/${IDS.setlist}`, [IDS.setlist, items[3], "tab-1"]],
    ["action: change a key", "saveItemSettings", `/setlists/${IDS.setlist}`, [items[3], settings, "tab-1"]],
    ["action: send a chat message", "sendMessage", `/setlists/${IDS.setlist}`, [IDS.setlist, "hello", "media", "tab-1"]],
    ["action: add a song", "addSetlistItem", `/setlists/${IDS.setlist}`, [IDS.setlist, IDS.song, null, "tab-1"]],
    ["action: reorder (14 songs)", "reorderSetlistItems", `/setlists/${IDS.setlist}`, [IDS.setlist, items, "tab-1"]],
    ["action: catch up (refetch)", "getSetlistState", `/setlists/${IDS.setlist}`, [IDS.setlist]],
    ["action: search to add", "findSongs", `/`, ["grace"]],
  ];

  const results = [];
  const summarise = (name, path, samples) => {
    const med = (key) => samples.map((s) => s[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    results.push({
      page: name,
      path,
      status: samples[0].status,
      ttfbMs: +med("ttfb").toFixed(1),
      totalMs: +med("total").toFixed(1),
      dbCalls: med("calls"),
      dbWaves: med("waves"),
      htmlKB: +(med("bytes") / 1024).toFixed(1),
    });
  };
  const waveCount = (calls) => {
    // Requests that overlap in time are one wave; a new wave starts when everything before has finished.
    const sorted = [...calls].sort((a, b) => a.start - b.start);
    let waves = 0;
    let until = -1;
    for (const c of sorted) {
      if (c.start >= until) waves++;
      until = Math.max(until, c.end);
    }
    return waves;
  };
  try {
    for (const [name, exported, path, body] of actions) {
      const id = actionId(exported);
      if (!id) continue;
      const samples = [];
      for (let i = 0; i < runs + 3; i++) {
        const from = stub.log.length;
        const t0 = performance.now();
        const res = await fetch(base + path, {
          method: "POST",
          headers: { cookie, "next-action": id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: base },
          body: JSON.stringify(body),
        });
        const ttfb = performance.now() - t0;
        const text = await res.text();
        const total = performance.now() - t0;
        const calls = stub.log.slice(from).filter((c) => !c.path.includes("well-known"));
        if (i < 3) continue;
        samples.push({ ttfb, total, calls: calls.length, waves: waveCount(calls), bytes: text.length, status: res.status });
      }
      summarise(name, path, samples);
    }
    for (const [name, path] of pages) {
      const samples = [];
      for (let i = 0; i < runs + 3; i++) {
        const from = stub.log.length;
        const t0 = performance.now();
        const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
        const ttfb = performance.now() - t0;
        const text = await res.text();
        const total = performance.now() - t0;
        const calls = stub.log.slice(from).filter((c) => !c.path.includes("well-known"));
        if (i < 3) continue; // warm-up
        samples.push({ ttfb, total, calls: calls.length, waves: waveCount(calls), bytes: text.length, status: res.status });
      }
      summarise(name, path, samples);
    }
  } finally {
    server.kill();
    await stub.close();
  }

  const report = { label, latencyMs: latency, runs, results };
  mkdirSync(join(repo, "bench/results"), { recursive: true });
  writeFileSync(join(repo, `bench/results/e2e-${label}.json`), JSON.stringify(report, null, 2));

  console.log(`\n${label}: each database request takes ${latency} ms; median of ${runs} loads\n`);
  console.log("  page".padEnd(32) + "status   first byte      total   db calls   waves   size");
  for (const r of results) {
    console.log(
      `  ${r.page.padEnd(30)} ${String(r.status).padStart(5)} ${String(r.ttfbMs).padStart(9)} ms ${String(r.totalMs).padStart(8)} ms ${String(r.dbCalls).padStart(9)} ${String(r.dbWaves).padStart(7)} ${String(r.htmlKB).padStart(7)} KB`,
    );
  }
  if (!args.keep) rmSync(work, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(String(e.stack ?? e).slice(0, 2000));
  process.exit(1);
});
