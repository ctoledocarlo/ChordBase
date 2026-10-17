// Builds the database the benchmarks and checks run against: ChordBase's real migrations, applied
// to an in-process Postgres (PGlite) with stand-ins for the parts of Supabase they lean on, then
// filled with a church's library of made-up songs, setlists and chat messages.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

export const root = resolve(import.meta.dirname, "../..");
export const CHURCH = "00000000-0000-4000-8000-000000000001";
export const OTHER_CHURCH = "00000000-0000-4000-8000-000000000002";
export const USER = "00000000-0000-4000-8000-0000000000aa";

const esc = (s) => s.replaceAll("'", "''");

/**
 * @param {{ rows?: number, skip?: Set<string> }} options  `skip` names migration files to leave out
 */
export async function createBenchDb({ rows = 1400, skip = new Set() } = {}) {
  // A small seeded random generator, so every run sees the same library.
  let seed = 20261017;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = (list) => list[Math.floor(rand() * list.length)];

  // A vocabulary of about 3,000 words where a few are used all the time and most are rare, like real lyrics.
  const COMMON = "the and you my your me we our to of in is for with all i be on that his he she it a will your from".split(" ");
  const SYLLABLES = "ba be bi bo bu ca ce co cu da de di do du fa fe fi fo ga ge gi go la le li lo lu ma me mi mo mu na ne ni no nu pa pe pi po ra re ri ro ru sa se si so su ta te ti to tu va ve vi vo wa we wi wo".split(" ");
  const RARE = Array.from({ length: 3000 }, () => Array.from({ length: 2 + Math.floor(rand() * 2) }, () => SYLLABLES[Math.floor(rand() * SYLLABLES.length)]).join(""));
  const word = () => (rand() < 0.45 ? COMMON[Math.floor(rand() ** 2 * COMMON.length)] : RARE[Math.floor(rand() ** 2.2 * RARE.length)]);
  const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B", "Am", "Em", "Dm", "Bm", "F#m", "Gm", "Cm"];
  const CHORDS = ["G", "C", "D", "Em", "Am", "F", "Bm", "A", "E", "D/F#", "Cmaj7", "G/B"];
  const phrase = (n) => Array.from({ length: n }, word).join(" ");
  const artists = Array.from({ length: Math.max(40, Math.round(rows / 12)) }, () => `${phrase(1)} ${phrase(1)} ${pick(["band", "worship", "collective", "choir"])}`);

  const docFrequency = new Map(); // how many songs each word is in
  function songBody() {
    const seen = new Set();
    const sections = [];
    const count = 3 + Math.floor(rand() * 4);
    for (let s = 0; s < count; s++) {
      const lines = [`{start_of_${s === 1 ? "chorus" : "verse"}: ${s === 1 ? "Chorus" : `Verse ${s}`}}`];
      for (let l = 0; l < 4 + Math.floor(rand() * 3); l++) {
        const words = phrase(5 + Math.floor(rand() * 4)).split(" ");
        words.forEach((w) => seen.add(w));
        lines.push(words.map((w, i) => (i % 3 === 0 ? `[${pick(CHORDS)}]${w}` : w)).join(" "));
      }
      lines.push(`{end_of_${s === 1 ? "chorus" : "verse"}}`);
      sections.push(lines.join("\n"));
    }
    seen.forEach((w) => docFrequency.set(w, (docFrequency.get(w) ?? 0) + 1));
    return sections.join("\n\n");
  }

  const db = new PGlite({ extensions: { pg_trgm } });

  // Stand-ins for the parts of Supabase the migrations lean on.
  await db.exec(`
    create schema if not exists extensions;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, extensions, auth to anon, authenticated;
    create publication supabase_realtime;
  `);

  const dir = join(root, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql") && !skip.has(f)).sort()) {
    try {
      await db.exec(readFileSync(join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`${f}: ${e.message}`);
    }
  }

  await db.exec(`
    insert into auth.users (id) values ('${USER}');
    insert into public.churches (id, name, slug) values ('${CHURCH}', 'Bench church', 'bench');
    insert into public.church_accounts (user_id, church_id) values ('${USER}', '${CHURCH}');
    -- Another church, so row level security has something to keep out.
    insert into public.churches (id, name, slug) values ('${OTHER_CHURCH}', 'Other church', 'other');
  `);

  const t0 = performance.now();
  const BATCH = 200;
  for (let start = 0; start < rows; start += BATCH) {
    const values = [];
    for (let i = start; i < Math.min(rows, start + BATCH); i++) {
      const church = i % 10 === 9 ? OTHER_CHURCH : CHURCH;
      const title = `${phrase(2)} ${i}`;
      values.push(
        `('${church}', '${esc(title)}', '${esc(pick(artists))}', '${pick(KEYS)}', ${Math.floor(rand() * 4)}, ${rand() < 0.1 ? "null" : 60 + Math.floor(rand() * 90)}, '${rand() < 0.15 ? "6/8" : "4/4"}', '${esc(songBody())}')`,
      );
    }
    await db.exec(`insert into public.songs (church_id, title, artist, original_key, default_capo, tempo, time_signature, body) values ${values.join(",")};`);
  }
  const seedMs = performance.now() - t0;

  await db.exec(`
    insert into public.setlists (church_id, name, service_date, expires_at)
    select '${CHURCH}', 'Sunday ' || g, current_date + (g - 40), now() + interval '20 days' from generate_series(1, 60) g;
    insert into public.setlist_items (church_id, setlist_id, song_id, position, settings)
    select '${CHURCH}', s.id, x.id, x.n, '{"semitones":0,"capo":0,"spelling":"auto","showChords":true,"fontSize":0}'::jsonb
    from public.setlists s
    cross join lateral (
      select id, row_number() over () as n from public.songs where church_id = '${CHURCH}' order by random() limit 14
    ) x;
    insert into public.setlist_messages (church_id, setlist_id, sender_role, sender, body)
    select '${CHURCH}', (select id from public.setlists order by name limit 1), 'media', 'tab-1', 'message ' || g from generate_series(1, 150) g;
    analyze;
  `);

  const sizes = (await db.query("select pg_size_pretty(pg_total_relation_size('public.songs')) as songs")).rows[0];
  const counts = (await db.query("select (select count(*) from public.songs) songs, (select count(*) from public.setlists) setlists")).rows[0];
  const ids = (
    await db.query(
      `select (select id from public.setlists order by name limit 1) as setlist, (select id from public.songs where church_id = '${CHURCH}' limit 1 offset 5) as song, (select song_id from public.setlist_items limit 1) as "songInSetlist"`,
    )
  ).rows[0];

  // Search terms of known popularity: a word in about 2% of songs, one in about 40%, and three words from one song.
  const target = (share) => {
    const goal = rows * share;
    return [...docFrequency.entries()].filter(([w]) => w.length >= 4).sort((a, b) => Math.abs(a[1] - goal) - Math.abs(b[1] - goal))[0][0];
  };
  const picked = (await db.query(`select lyrics from public.songs where church_id='${CHURCH}' limit 1 offset 20`)).rows[0].lyrics.split(" ").filter((w) => w.length >= 4);

  return {
    db,
    ids,
    term: target(0.02),
    common: target(0.4),
    words: { a: picked[2], b: picked[8], c: picked[14] },
    seedMs,
    counts,
    sizes,
    /** Switch to the signed-in church login, with row level security applied (as the app's queries run). */
    signIn: () => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER}', false);`),
    /** Back to the table owner. */
    signOut: () => db.exec("reset role"),
  };
}
