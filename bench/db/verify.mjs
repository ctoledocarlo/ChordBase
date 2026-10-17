// Checks that the faster song search (the songs_page function) finds exactly what the plain queries
// it replaces find, in the same order with the same totals, and never shows another church's songs.
//
//   node bench/db/verify.mjs

import { createBenchDb, OTHER_CHURCH } from "./setup.mjs";

const env = await createBenchDb({ rows: 2500 });
const { db, term, common, words } = env;
const lit = (s) => `'${s.replaceAll("'", "''")}'`;
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
};

const search = (q, tokens) =>
  `(s.title ilike '%${q}%' or s.artist ilike '%${q}%' or (${tokens.map((t) => `s.lyrics ilike '%${t}%'`).join(" and ")}))`;

// [name, function arguments, the plain query's where clause, its order]
const cases = [
  ["list", "", "true", "s.title, s.id"],
  ["page 3", "p_offset => 50", "true", "s.title, s.id", 50],
  ["rare word", `p_q => ${lit(term)}, p_tokens => array[${lit(term)}]`, search(term, [term]), "s.title, s.id"],
  ["common word", `p_q => ${lit(common)}, p_tokens => array[${lit(common)}]`, search(common, [common]), "s.title, s.id"],
  [
    "three lyric words",
    `p_q => ${lit(`${words.a} ${words.b} ${words.c}`)}, p_tokens => array[${lit(words.a)}, ${lit(words.b)}, ${lit(words.c)}]`,
    `(s.title ilike '%${words.a} ${words.b} ${words.c}%' or s.artist ilike '%${words.a} ${words.b} ${words.c}%' or (${[words.a, words.b, words.c].map((t) => `s.lyrics ilike '%${t}%'`).join(" and ")}))`,
    "s.title, s.id",
  ],
  ["keys", "p_keys => array['G','Em','F#m']", "s.original_key in ('G','Em','F#m')", "s.title, s.id"],
  ["minor", "p_mode => 'minor'", "s.original_key ~ '^[A-G][#b]?m($|[^a])'", "s.title, s.id"],
  ["major", "p_mode => 'major'", "(s.original_key <> '' and s.original_key !~ '^[A-G][#b]?m($|[^a])')", "s.title, s.id"],
  ["tempo range", "p_tempo_min => 80, p_tempo_max => 110", "s.tempo >= 80 and s.tempo <= 110", "s.title, s.id"],
  ["time signature", "p_ts => '6/8'", "s.time_signature = '6/8'", "s.title, s.id"],
  ["capo", "p_capo => 2", "s.default_capo = 2", "s.title, s.id"],
  ["sort by artist", "p_sort => 'artist'", "true", "s.artist, s.title, s.id"],
  ["sort by key", "p_sort => 'key'", "true", "s.original_key, s.title, s.id"],
  ["sort by tempo", "p_sort => 'tempo'", "true", "s.tempo asc nulls last, s.title, s.id"],
  ["sort by recently changed", "p_sort => 'recent'", "true", "s.updated_at desc, s.id"],
  [
    "filters together",
    `p_keys => array['G','D'], p_tempo_min => 70, p_mode => 'major', p_q => ${lit(common)}, p_tokens => array[${lit(common)}], p_sort => 'tempo'`,
    `s.original_key in ('G','D') and s.tempo >= 70 and (s.original_key <> '' and s.original_key !~ '^[A-G][#b]?m($|[^a])') and ${search(common, [common])}`,
    "s.tempo asc nulls last, s.title, s.id",
  ],
];

await env.signIn();
for (const [name, args, where, order, offset = 0] of cases) {
  const fn = (await db.query(`select * from public.songs_page(${args})`)).rows;
  const plain = (await db.query(`select s.id from public.songs s where ${where} order by ${order} limit 25 offset ${offset}`)).rows;
  const total = Number((await db.query(`select count(*) as n from public.songs s where ${where}`)).rows[0].n);
  const sameIds = JSON.stringify(fn.map((r) => r.id)) === JSON.stringify(plain.map((r) => r.id));
  const sameTotal = fn.length === 0 ? total <= offset : fn.every((r) => Number(r.total) === total);
  check(name, sameIds && sameTotal, `${fn.length} rows, ${total} in all`);
}

// "Best match" puts the songs closest to what was typed first: the title as typed, then titles that start
// with it, then titles with it inside, then lyrics with the words together, then the artist, then lyrics
// with the words near each other, then far apart.
await env.signOut();
const church = "00000000-0000-4000-8000-000000000001";
const far = `zzquux ${"filler ".repeat(40)}zzfoo`;
await db.exec(`
  insert into public.songs (church_id, title, artist, original_key, body) values
    ('${church}', 'Zzquux Zzfoo', '', 'G', 'a'),
    ('${church}', 'Zzquux Zzfoo Anthem', '', 'G', 'a'),
    ('${church}', 'The Zzquux Zzfoo Song', '', 'G', 'a'),
    ('${church}', 'Plain D', '', 'G', 'one two [G]zzquux zzfoo three four'),
    ('${church}', 'Plain E', 'Zzquux Zzfoo Band', 'G', 'a'),
    ('${church}', 'Plain F', '', 'G', 'zzquux and then zzfoo later'),
    ('${church}', 'Plain G', '', 'G', '${far}');
`);
await env.signIn();
const ranked = (
  await db.query(
    "select title from public.songs_page(p_q => 'zzquux zzfoo', p_tokens => array['zzquux','zzfoo'], p_phrase => 'zzquux zzfoo', p_sort => 'relevance')",
  )
).rows.map((r) => r.title);
check(
  "best match order",
  JSON.stringify(ranked) === JSON.stringify(["Zzquux Zzfoo", "Zzquux Zzfoo Anthem", "The Zzquux Zzfoo Song", "Plain D", "Plain E", "Plain F", "Plain G"]),
  ranked.join(" > "),
);
const alphabetical = (await db.query("select title from public.songs_page(p_q => 'zzquux zzfoo', p_tokens => array['zzquux','zzfoo'])")).rows.map((r) => r.title);
check("title order is still available while searching", JSON.stringify(alphabetical) === JSON.stringify(["Plain D", "Plain E", "Plain F", "Plain G", "The Zzquux Zzfoo Song", "Zzquux Zzfoo", "Zzquux Zzfoo Anthem"]), alphabetical.join(" > "));

// Characters that mean something in a search or in SQL are taken as plain text.
for (const q of ["100%", "a_b", "it's", "back\\slash", "x'; drop table public.songs; --", "\u0001s.id", "{a}"]) {
  try {
    const rows = (await db.query(`select * from public.songs_page(p_q => ${lit(q)}, p_tokens => array[${lit(q)}])`)).rows;
    check(`odd search ${JSON.stringify(q)}`, Array.isArray(rows), `${rows.length} rows`);
  } catch (e) {
    check(`odd search ${JSON.stringify(q)}`, false, e.message);
  }
}
check("the songs table is still there", Number((await db.query("select count(*) as n from public.songs")).rows[0].n) > 0);

// Only the signed-in church's songs.
const leaked = (await db.query("select count(*) as n from public.songs_page(p_limit => 100) f join public.songs s on s.id = f.id where s.church_id <> '" + "00000000-0000-4000-8000-000000000001" + "'")).rows[0].n;
check("never returns another church's songs", Number(leaked) === 0);
await env.signOut();
const otherSongs = Number((await db.query(`select count(*) as n from public.songs where church_id = '${OTHER_CHURCH}'`)).rows[0].n);
check("(the other church does have songs to leak)", otherSongs > 0, `${otherSongs}`);

// Signed out: a login with no church sees nothing.
await db.exec("set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000ff', false);");
check("a login with no church gets nothing", (await db.query("select * from public.songs_page()")).rows.length === 0);
await env.signOut();
await db.exec("set role anon");
try {
  await db.query("select * from public.songs_page()");
  check("signed out visitors can't call it", false);
} catch {
  check("signed out visitors can't call it", true);
}

await db.close();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
