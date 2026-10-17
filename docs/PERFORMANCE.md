# Performance

How fast ChordBase is, what was slowing it down, what was changed, and how to measure it again.
Everything below comes from runs of the scripts in `bench/` (the numbers are in `bench/results/`), and this
page is written by `npm run bench:report`, so it can't drift from them.

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
| Page loads and server actions | The real production build of the app, run locally, talking to a stand-in for Supabase (`bench/e2e`) that answers after a fixed 30 ms delay, like a database a short hop away. It signs in with a made-up session, loads each page 12 times and counts the database requests the server makes and how many had to wait for another to finish. | Time the server spends, and how many round trips a page costs. Real round trips to Supabase are often longer than 30 ms, so real savings are bigger. |
| The database | ChordBase's real migrations and queries, run with row level security on, in an in-process Postgres (PGlite) filled with made-up songs that use a realistic spread of common and rare words (`bench/db`). | Which indexes get used and how the queries scale. PGlite is slower than Supabase's Postgres, so compare the "before" and "after" columns rather than reading the milliseconds as what Supabase will report. |
| Download size | The JavaScript each page loads, from the build, compressed (`npm run bench:bundle`). | What a phone on the venue's Wi-Fi has to fetch. |
| Everyday code | Micro-benchmarks of the chord, search and sync code (`npm run bench`). | That none of that code is the bottleneck. |

Not measured: how long pages take on a real device with a real Supabase project (needs your project and
sign-in), and the redraw cost of the live screen in a browser. Both are described under "Still to check".

## Page loads

Median of 12 loads, each database request taking 30 ms.

|  | Before | After | Faster | Database requests | Waits in a row |
| --- | ---: | ---: | ---: | ---: | ---: |
| home (songs list) | 173 ms | 79.5 ms | 2.2× | 5 → 3 | 3 → 1 |
| search a word | 164 ms | 69.4 ms | 2.4× | 5 → 2 | 3 → 1 |
| filter + sort | 159 ms | 76.6 ms | 2.1× | 5 → 2 | 3 → 1 |
| song page | 125 ms | 70.9 ms | 1.8× | 4 → 3 | 2 → 1 |
| setlists list | 178 ms | 95.2 ms | 1.9× | 3 → 3 | 3 → 1 |
| open a setlist | 122 ms | 77.6 ms | 1.6× | 5 → 5 | 2 → 1 |

## Server actions (what happens when you press a button)

|  | Before | After | Faster | Database requests | Waits in a row |
| --- | ---: | ---: | ---: | ---: | ---: |
| put song on stage | 98.3 ms | 60.4 ms | 1.6× | 2 → 1 | 2 → 1 |
| change a key | 93.4 ms | 46.6 ms | 2.0× | 2 → 1 | 2 → 1 |
| send a chat message | 93.4 ms | 46.8 ms | 2.0× | 2 → 1 | 2 → 1 |
| add a song | 186 ms | 94.5 ms | 2.0× | 5 → 4 | 4 → 2 |
| reorder (14 songs) | 94.7 ms | 61.4 ms | 1.5× | 15 → 14 | 2 → 1 |
| catch up (refetch) | 141 ms | 54.5 ms | 2.6× | 4 → 3 | 3 → 1 |
| search to add | 108 ms | 62.1 ms | 1.7× | 2 → 1 | 2 → 1 |

## Database

The "before" column is the old queries on the old tables; "after" is the new queries and indexes (see
"What changed"). All run with row level security on, as the app's queries do.

### 1,400 songs (about the size of the library today)

|  | Before | After | Faster |
| --- | ---: | ---: | ---: |
| Songs page, first 25 | 4.73 ms | 2.29 ms | 2.1× |
| Songs page, page 40 | 4.80 ms | 2.68 ms | 1.8× |
| Search: a word in 2% of songs | 31.0 ms | 16.1 ms | 1.9× |
| Search: a word in 40% of songs | 30.9 ms | 15.1 ms | 2.0× |
| Search: three lyric words | 33.1 ms | 17.7 ms | 1.9× |
| Filter: keys and tempo | 3.38 ms | 2.16 ms | 1.6× |
| Filter: minor keys | 4.59 ms | 2.39 ms | 1.9× |
| Sort by tempo | 3.57 ms | 1.93 ms | 1.8× |
| Sort by recently changed | 4.12 ms | 1.62 ms | 2.5× |
| Filter choices (keys, artists…) | 4.19 ms | 3.32 ms | 1.3× |
| Home page: the next setlist | 4.00 ms | 0.93 ms | 4.3× |
| Song page: setlists to add to | 4.00 ms | 1.19 ms | 3.4× |
| Open a setlist | 2.26 ms | 2.10 ms | 1.1× |
| Chat: last 100 messages | 2.71 ms | 1.77 ms | 1.5× |
| Delete a song that is in setlists | 2.43 ms | 1.70 ms | 1.4× |

*1400 songs (7744 kB with indexes before, 9344 kB after), 60 setlists.*

### 10,000 songs (where it is heading)

|  | Before | After | Faster |
| --- | ---: | ---: | ---: |
| Songs page, first 25 | 15.2 ms | 4.53 ms | 3.4× |
| Songs page, page 40 | 17.1 ms | 5.08 ms | 3.4× |
| Search: a word in 2% of songs | 182 ms | 20.2 ms | 9.0× |
| Search: a word in 40% of songs | 178 ms | 91.5 ms | 1.9× |
| Search: three lyric words | 238 ms | 39.1 ms | 6.1× |
| Filter: keys and tempo | 12.6 ms | 3.52 ms | 3.6× |
| Filter: minor keys | 17.3 ms | 8.19 ms | 2.1× |
| Sort by tempo | 11.6 ms | 4.65 ms | 2.5× |
| Sort by recently changed | 14.0 ms | 4.88 ms | 2.9× |
| Filter choices (keys, artists…) | 22.9 ms | 16.6 ms | 1.4× |
| Home page: the next setlist | 2.81 ms | 0.97 ms | 2.9× |
| Song page: setlists to add to | 2.81 ms | 1.30 ms | 2.2× |
| Open a setlist | 2.02 ms | 2.03 ms | 1.0× |
| Chat: last 100 messages | 1.78 ms | 2.13 ms | 0.8× |
| Delete a song that is in setlists | 1.66 ms | 2.02 ms | 0.8× |

*10000 songs (35 MB with indexes before, 46 MB after), 60 setlists.*

Rows where "Before" and "After" are the same query (opening a setlist, the chat) differ only by noise of a few
tenths of a millisecond. The extra indexes do make writes a little more expensive: deleting a song is slightly
slower at 10,000 songs (1.7 ms to 2.0 ms). Songs are written rarely compared with how often they are read, so
that is a good trade.

## Download size

JavaScript each page loads, compressed.

| Page | Before | After | Saved |
| --- | ---: | ---: | ---: |
| `/setlists/[id]` | 228 KB | 161 KB | −66.3 KB |
| `/songs/import` | 180 KB | 148 KB | −31.8 KB |
| `/songs/[id]/edit` | 152 KB | 152 KB | – |
| `/songs/new` | 152 KB | 152 KB | – |
| `/songs/[id]` | 149 KB | 149 KB | – |
| `/` | 146 KB | 146 KB | – |
| `/setlists` | 141 KB | 141 KB | – |
| `/forgot-password` | 138 KB | 138 KB | – |
| `/reset-password` | 138 KB | 138 KB | – |
| `/login` | 138 KB | 138 KB | – |
| `/welcome` | 136 KB | 136 KB | – |
| `/_not-found` | 133 KB | 133 KB | – |

The first ~130 KB of every page is React and Next.js themselves.

## Everyday code

Time for one run of the code that works on a song, a search or a setlist. All of it is small next to a
database round trip, which is why it wasn't changed.

|  | Mean time | Runs per second |
| --- | ---: | ---: |
| parse a song (5 verses) | 0.03 ms | 34,953 |
| write a song back out | 0.01 ms | 78,206 |
| move a song to another key | 0.04 ms | 28,317 |
| dress the chords as jazzy | 0.04 ms | 28,162 |
| what the screen does per change: parse + move + dress | 0.15 ms | 6,714 |
| work out key, capo and spelling | 0.00 ms | 654,369 |
| chords in a key | 0.00 ms | 964,508 |
| turn a typed search into words | 0.00 ms | 423,873 |
| flatten a song's text (the database does this too) | 0.04 ms | 22,460 |
| find the matching line in 25 results | 1.50 ms | 668 |
| fold in changes from another screen (nothing changed) | 0.24 ms | 4,112 |
| fold in changes from another screen (one song changed) | 0.21 ms | 4,807 |
| suggest a transition between two songs | 0.19 ms | 5,356 |
| the bridge line, as the right-hand panel works it out | 0.18 ms | 5,508 |
| pick the text a song shows (own chords or the song's) | 0.00 ms | 3,539,545 |
| read Alive.pptx | 3.80 ms | 263 |
| read The Blood.ppt | 4.51 ms | 222 |
| read A King is Born.ppt | 2.05 ms | 489 |

## What changed

**Fewer waits in a row (the biggest win)**

- The check that a login belongs to a church used to sit in front of every page, so the page's own queries
  couldn't start until it finished. It now runs beside the page (`app/(app)/layout.tsx`).
- The pages no longer look the church up before their data (`page.tsx` files).
- Buttons that only change or read a row by id check that someone is signed in from the session token, which
  needs no database round trip (`isSignedIn` in `lib/church.ts`). Row level security still limits every change to the login's own church.
- Rows that need a church id (a chat message, a song added to a setlist) get it from a column default in the
  database instead of looking it up first (`my_church_id()`).
- Adding a song to a setlist reads its three things at once, and a setlist and its songs are read together.

**Less asked for**

- The home page asked for every setlist, and deleted expired ones, just to show the next one. It now asks for
  the next one only, and not at all while searching or paging.
- The song page asks for setlist names, not names and song counts.
- Expired setlists are cleared by the database once an hour (when `pg_cron` is available) or by the setlist list as before, beside its read instead of in front of it.
- The filter choices (keys, artists…) are kept for a minute on the server instead of being gathered on every search and page turn.
- While the live connection is up, a screen checks in with the database a quarter as often (the connection already brings changes).

**A faster database**

- Searching for words used to read every song in full. Row level security stops Postgres from using an index
  for "contains" searches, so the search now runs in a database function (`songs_page`) that checks the church
  itself and can use new trigram indexes on title, artist and lyrics. It also counts the matches in the same
  pass rather than a second one. A test (`npm run bench:verify`) checks it returns exactly what the plain
  queries do and never another church's songs.
- Indexes for the orders the song list offers (title, artist, key, tempo, recently changed), and for the
  setlist list. The old index was on `lower(title)`, which the list never used.
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
   `20261025000000_performance.sql`, then `20261026000000_songs_page.sql`. (The earlier ones from this week
   too, if you haven't: realtime, active song, messages, lyric search, transitions.)
   The app now depends on them: saving a chat message or adding a song to a setlist needs the new column
   defaults, and the song list needs `songs_page`.
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
  import of hundreds of songs while screens are open sends hundreds of messages. If that ever matters, take `songs` out of the realtime publication and let screens pick up song edits when they check in.

## Looked at and left alone

- **Chord, search and sync code** takes a fraction of a millisecond to a couple of milliseconds; the database and
  the network are what matter.
- **Importing PowerPoint files** takes 2–5 ms per file.
- **The first ~130 KB of JavaScript** is React and Next.js.
- **Fonts and images**: the app has no images, and fonts are loaded the way Next.js recommends.

## Running it again

```bash
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
```
