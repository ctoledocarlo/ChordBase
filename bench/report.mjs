// Turns the saved benchmark results into docs/PERFORMANCE.md:
//   npm run bench:report
// Run the benchmarks first (see the "Running it again" part of the report); this only reads
// bench/results and writes the document, so the numbers in it always come from a real run.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (f) => (existsSync(join(root, "bench/results", f)) ? JSON.parse(readFileSync(join(root, "bench/results", f), "utf8")) : null);
const NL = "\n";

const fmt = (n) => (n === undefined || n === null ? "–" : n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
const ratio = (a, b) => (a && b ? `${(a / b).toFixed(1)}×` : "–");
const table = (head, rows) => [`| ${head.join(" | ")} |`, `| ${head.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join(NL);

// ---- page loads and server actions (the real Next.js server, a stand-in database) ----
const e2eBefore = read("e2e-baseline.json");
const e2eAfter = read("e2e-optimized.json");
function e2eTable(filter) {
  const rows = [];
  for (const a of e2eBefore.results.filter(filter)) {
    const b = e2eAfter.results.find((r) => r.page === a.page);
    if (!b) continue;
    rows.push([a.page.replace("action: ", ""), `${fmt(a.totalMs)} ms`, `${fmt(b.totalMs)} ms`, ratio(a.totalMs, b.totalMs), `${a.dbCalls} → ${b.dbCalls}`, `${a.dbWaves} → ${b.dbWaves}`]);
  }
  return table(["", "Before", "After", "Faster", "Database requests", "Waits in a row"], rows);
}

// ---- database ----
function dbTable(rows) {
  const before = read(`db-baseline-${rows}.json`);
  const after = read(`db-optimized-${rows}.json`);
  const find = (r, n) => r.results.find((x) => x.name === n);
  const pairs = [
    ["Songs page, first 25", "list_default", "list_default_new"],
    ["Songs page, page 40", "list_deep_page", "list_deep_page_new"],
    ["Search: a word in 2% of songs", "search_rare_word", "search_rare_word_new"],
    ["Search: a word in 40% of songs", "search_common_word", "search_common_word_new"],
    ["Search: three lyric words", "search_lyrics", "search_lyrics_new"],
    ["Filter: keys and tempo", "filter_keys_tempo", "filter_keys_tempo_new"],
    ["Filter: minor keys", "filter_minor", "filter_minor_new"],
    ["Sort by tempo", "sort_tempo", "sort_tempo_new"],
    ["Sort by recently changed", "sort_recent", "sort_recent_new"],
    ["Filter choices (keys, artists…)", "facets", "facets_new"],
    ["Home page: the next setlist", "home_setlists", "home_next_setlist_new"],
    ["Song page: setlists to add to", "home_setlists", "song_page_setlists_new"],
    ["Open a setlist", "setlist_open", "setlist_open"],
    ["Chat: last 100 messages", "setlist_messages", "setlist_messages"],
    ["Delete a song that is in setlists", "delete_song", "delete_song"],
  ];
  const out = pairs.map(([label, b, a]) => {
    const x = find(before, b);
    const y = find(after, a);
    return [label, `${fmt(x?.median)} ms`, `${fmt(y?.median)} ms`, ratio(x?.median, y?.median)];
  });
  return `${table(["", "Before", "After", "Faster"], out)}${NL}${NL}*${before.rows} songs (${before.songsTableSize} with indexes before, ${after.songsTableSize} after), ${before.setlists} setlists.*`;
}

// ---- bundle ----
const bundleBefore = read("bundle-baseline.json");
const bundleAfter = read("bundle-optimized.json");
const bundleRows = bundleBefore
  .map((a) => {
    const b = bundleAfter.find((r) => r.route === a.route);
    return [`\`${a.route}\``, `${fmt(a.gzipKB)} KB`, `${fmt(b.gzipKB)} KB`, a.gzipKB === b.gzipKB ? "–" : `−${fmt(a.gzipKB - b.gzipKB)} KB`];
  })
  .sort((x, y) => parseFloat(y[3].replace(/[^\d.]/g, "") || 0) - parseFloat(x[3].replace(/[^\d.]/g, "") || 0));

// ---- compute ----
const compute = read("compute.json");
const computeRows = compute ? compute.files[0].groups.flatMap((g) => g.benchmarks.map((b) => [b.name, `${fmt(b.mean)} ms`, `${Math.round(b.hz).toLocaleString("en-US")}`])) : [];

const e2e = e2eBefore ? `${e2eBefore.latencyMs} ms` : "";

const doc = `# Performance

How fast ChordBase is, what was slowing it down, what was changed, and how to measure it again.
Everything below comes from runs of the scripts in \`bench/\` (the numbers are in \`bench/results/\`), and this
page is written by \`npm run bench:report\`, so it can't drift from them.

## The short version

- **A page load used to wait on the database three times in a row; now it waits once.** The song list, a
  song, the setlist list and a setlist all asked for who was signed in, then the church, then their data, one
  after another. They now ask for everything at the same time. With a database 30 ms away, the song list went
  from about 170 ms to about 80 ms, and the other pages by 35% to 55%.
- **Live actions are 1.6 to 2.6 times as fast.** Putting a song on stage, changing a key, sending a chat message and
  searching for a song each took two waits in a row (find the church, then do it). They take one.
  Adding a song to a setlist is twice as fast, and catching up after a dropped connection is about two and a half times as fast.
- **Searching is much faster as the library grows**, and the work is no longer done twice. At 10,000 songs a
  search for a rarer word went from about 180 ms to about 20 ms of database time. At today's 1,400 songs
  the database was already quick, so the gain there is smaller (see the tables).
- **The setlist page downloads almost a third less JavaScript**, and the import page about a fifth less, because
  code that is only needed a moment later (the live connection, the PowerPoint reader) is now fetched later.

## How it was measured

| What | How | What it shows |
| --- | --- | --- |
| Page loads and server actions | The real production build of the app, run locally, talking to a stand-in for Supabase (\`bench/e2e\`) that answers after a fixed ${e2e} delay, like a database a short hop away. It signs in with a made-up session, loads each page 12 times and counts the database requests the server makes and how many had to wait for another to finish. | Time the server spends, and how many round trips a page costs. Real round trips to Supabase are often longer than ${e2e}, so real savings are bigger. |
| The database | ChordBase's real migrations and queries, run with row level security on, in an in-process Postgres (PGlite) filled with made-up songs that use a realistic spread of common and rare words (\`bench/db\`). | Which indexes get used and how the queries scale. PGlite is slower than Supabase's Postgres, so compare the "before" and "after" columns rather than reading the milliseconds as what Supabase will report. |
| Download size | The JavaScript each page loads, from the build, compressed (\`npm run bench:bundle\`). | What a phone on the venue's Wi-Fi has to fetch. |
| Everyday code | Micro-benchmarks of the chord, search and sync code (\`npm run bench\`). | That none of that code is the bottleneck. |

Not measured: how long pages take on a real device with a real Supabase project (needs your project and
sign-in), and the redraw cost of the live screen in a browser. Both are described under "Still to check".

## Page loads

Median of 12 loads, each database request taking ${e2e}.

${e2eTable((r) => !r.page.startsWith("action:"))}

## Server actions (what happens when you press a button)

${e2eTable((r) => r.page.startsWith("action:"))}

## Database

The "before" column is the old queries on the old tables; "after" is the new queries and indexes (see
"What changed"). All run with row level security on, as the app's queries do.

### 1,400 songs (about the size of the library today)

${dbTable(1400)}

### 10,000 songs (where it is heading)

${dbTable(10000)}

Rows where "Before" and "After" are the same query (opening a setlist, the chat) differ only by noise of a few
tenths of a millisecond. The extra indexes do make writes a little more expensive: deleting a song is slightly
slower at 10,000 songs (1.7 ms to 2.0 ms). Songs are written rarely compared with how often they are read, so
that is a good trade.

## Download size

JavaScript each page loads, compressed.

${table(["Page", "Before", "After", "Saved"], bundleRows)}

The first ~130 KB of every page is React and Next.js themselves.

## Everyday code

Time for one run of the code that works on a song, a search or a setlist. All of it is small next to a
database round trip, which is why it wasn't changed.

${table(["", "Mean time", "Runs per second"], computeRows)}

## What changed

**Fewer waits in a row (the biggest win)**

- The check that a login belongs to a church used to sit in front of every page, so the page's own queries
  couldn't start until it finished. It now runs beside the page (\`app/(app)/layout.tsx\`).
- The pages no longer look the church up before their data (\`page.tsx\` files).
- Buttons that only change or read a row by id check that someone is signed in from the session token, which
  needs no database round trip (\`isSignedIn\` in \`lib/church.ts\`). Row level security still limits every change to the login's own church.
- Rows that need a church id (a chat message, a song added to a setlist) get it from a column default in the
  database instead of looking it up first (\`my_church_id()\`).
- Adding a song to a setlist reads its three things at once, and a setlist and its songs are read together.

**Less asked for**

- The home page asked for every setlist, and deleted expired ones, just to show the next one. It now asks for
  the next one only, and not at all while searching or paging.
- The song page asks for setlist names, not names and song counts.
- Expired setlists are cleared by the database once an hour (when \`pg_cron\` is available) or by the setlist list as before, beside its read instead of in front of it.
- The filter choices (keys, artists…) are kept for a minute on the server instead of being gathered on every search and page turn.
- While the live connection is up, a screen checks in with the database a quarter as often (the connection already brings changes).

**A faster database**

- Searching for words used to read every song in full. Row level security stops Postgres from using an index
  for "contains" searches, so the search now runs in a database function (\`songs_page\`) that checks the church
  itself and can use new trigram indexes on title, artist and lyrics. It also counts the matches in the same
  pass rather than a second one. A test (\`npm run bench:verify\`) checks it returns exactly what the plain
  queries do and never another church's songs.
- Indexes for the orders the song list offers (title, artist, key, tempo, recently changed), and for the
  setlist list. The old index was on \`lower(title)\`, which the list never used.
- Row level security now compares a church with one value instead of joining, so those indexes can read songs in
  order and stop after 25 rather than sorting the whole library.
- Deleting a song, and removing a song from a setlist, no longer scan whole tables to find what refers to them.
- The filter choices are gathered in one pass.

**Less to download and less to redraw**

- The live-connection code (about 65 KB compressed) and the PowerPoint reader (about 30 KB) load after the
  page appears, not as part of it.
- The song on screen redraws only when its own settings or chords change, not when anything else on the page
  does (typing in a box, a chat message). Each redraw re-fits the text to the screen, which is the costly part.
- The right-hand panel and the transition box no longer redo their chord work on every redraw.

## What to do

1. **Run the new migrations in Supabase, in order, before using this version of the app:**
   \`20261025000000_performance.sql\`, then \`20261026000000_songs_page.sql\`. (The earlier ones from this week
   too, if you haven't: realtime, active song, messages, lyric search, transitions.)
   The app now depends on them: saving a chat message or adding a song to a setlist needs the new column
   defaults, and the song list needs \`songs_page\`.
2. **Put the Vercel functions in the same region as the Supabase project** (Vercel: Project Settings → Functions →
   Function Region). Each database request is a round trip between the two, and a different continent adds
   100 ms or more to every one. This is the biggest thing that can't be done in the code.
3. In Supabase, switch on **pg_cron** (Database → Extensions) if you'd like expired setlists cleared on a schedule. It's optional.

## Still to check

- Load the pages on the live site with the browser's network panel open and note the time of the first page
  and of the database requests (Supabase → Logs shows them too). The numbers above should then be close to
  what you see, scaled by the real round trip time.
- The live screen's redraw cost (typing in the chat box while a long song is on screen) was reasoned about, not
  measured; a browser performance recording would confirm it.
- Realtime messages: every song edit is sent to every open setlist screen. That's fine for editing, but a bulk
  import of hundreds of songs while screens are open sends hundreds of messages. If that ever matters, take \`songs\` out of the realtime publication and let screens pick up song edits when they check in.

## Looked at and left alone

- **Chord, search and sync code** takes a fraction of a millisecond to a couple of milliseconds; the database and
  the network are what matter.
- **Importing PowerPoint files** takes 2–5 ms per file.
- **The first ~130 KB of JavaScript** is React and Next.js.
- **Fonts and images**: the app has no images, and fonts are loaded the way Next.js recommends.

## Running it again

\`\`\`bash
npm test                  # the tests
npm run bench             # everyday code
npm run bench:verify      # the song search returns the same as the plain queries
npm run build && npm run bench:bundle -- .next after   # download size of the current build

# database, at today's size and at 10,000 songs. "baseline" leaves out the two new migrations.
node bench/db/run.mjs --label baseline  --rows 1400 --skip 20261025000000_performance.sql,20261026000000_songs_page.sql
node bench/db/run.mjs --label optimized --rows 1400

# page loads and actions. --from-git measures an earlier commit; without it the working tree is measured.
node bench/e2e/run.mjs --label baseline  --from-git <commit> --latency 30
node bench/e2e/run.mjs --label optimized --latency 30

npm run bench:report      # rewrite this page from bench/results
\`\`\`
`;

writeFileSync(join(root, "docs/PERFORMANCE.md"), doc);
console.log("wrote docs/PERFORMANCE.md");
