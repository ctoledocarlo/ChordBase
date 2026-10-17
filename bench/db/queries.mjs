// The queries ChordBase sends to the database, written out as the SQL they become.
// Names ending in "_new" are the replacements for slower ones; the rest are unchanged.

const LIST = "id, title, artist, original_key, tempo";
const SETLIST_COUNT = "(select json_agg(json_build_object('count', c.count)) from (select count(*) from public.setlist_items i where i.setlist_id = s.id) c)";

/** A page of songs and the count of all that match, the way the song list asks for them. */
const page = (where, order, offset = 0, columns = LIST) => [
  `select ${columns} from public.songs ${where} order by ${order} limit 25 offset ${offset}`,
  `select count(*) from public.songs ${where}`,
];

export function queries({ ids, words, term, common }) {
  const t = term.toLowerCase().replace(/[^a-z0-9]/g, "");
  const phrase = `${words.a} ${words.b} ${words.c}`;
  const c = common.toLowerCase().replace(/[^a-z0-9]/g, "");
  const searchTitle = `where (title ilike '%${t}%' or artist ilike '%${t}%' or (lyrics ilike '%${t}%'))`;
  const searchCommon = `where (title ilike '%${c}%' or artist ilike '%${c}%' or (lyrics ilike '%${c}%'))`;
  const searchLyrics = `where (title ilike '%${phrase}%' or artist ilike '%${phrase}%' or (lyrics ilike '%${words.a}%' and lyrics ilike '%${words.b}%' and lyrics ilike '%${words.c}%'))`;
  const byTitle = "title asc, id asc";

  return [
    { name: "list_default", what: "Songs page, first 25 by title", sql: page("", byTitle) },
    { name: "list_deep_page", what: "Songs page 40", sql: page("", byTitle, 975) },
    { name: "search_rare_word", what: "Search a word in ~2% of songs", sql: page(searchTitle, byTitle, 0, `${LIST}, body`) },
    { name: "search_common_word", what: "Search a word in ~40% of songs", sql: page(searchCommon, byTitle, 0, `${LIST}, body`) },
    { name: "search_lyrics", what: "Search three lyric words", sql: page(searchLyrics, byTitle, 0, `${LIST}, body`) },
    { name: "filter_keys_tempo", what: "Filter: keys G/D/Em, tempo 60-100", sql: page("where original_key in ('G','D','Em') and tempo >= 60 and tempo <= 100", byTitle) },
    { name: "filter_minor", what: "Filter: minor keys", sql: page("where original_key ~ '^[A-G][#b]?m($|[^a])'", byTitle) },
    { name: "sort_tempo", what: "Sort by tempo", sql: page("", "tempo asc nulls last, title asc, id asc") },
    { name: "sort_recent", what: "Sort by recently changed", sql: page("", "updated_at desc, id asc") },
    { name: "facets", what: "Filter choices (keys, artists, ...)", sql: "select public.song_facets()" },

    // The same lists and searches through the songs_page function (needs the 20261025 and 20261026 migrations).
    { name: "list_default_new", what: "Songs page, first 25 by title (function)", sql: "select * from public.songs_page()" },
    { name: "list_deep_page_new", what: "Songs page 40 (function)", sql: "select * from public.songs_page(p_offset => 975)" },
    { name: "search_rare_word_new", what: "Search a word in ~2% of songs (function)", sql: `select * from public.songs_page(p_q => '${t}', p_tokens => array['${t}'], p_with_body => true)` },
    { name: "search_common_word_new", what: "Search a word in ~40% of songs (function)", sql: `select * from public.songs_page(p_q => '${c}', p_tokens => array['${c}'], p_with_body => true)` },
    { name: "search_lyrics_new", what: "Search three lyric words (function)", sql: `select * from public.songs_page(p_q => '${phrase}', p_tokens => array['${words.a}','${words.b}','${words.c}'], p_with_body => true)` },
    { name: "filter_keys_tempo_new", what: "Filter: keys G/D/Em, tempo 60-100 (function)", sql: "select * from public.songs_page(p_keys => array['G','D','Em'], p_tempo_min => 60, p_tempo_max => 100)" },
    { name: "filter_minor_new", what: "Filter: minor keys (function)", sql: "select * from public.songs_page(p_mode => 'minor')" },
    { name: "sort_tempo_new", what: "Sort by tempo (function)", sql: "select * from public.songs_page(p_sort => 'tempo')" },
    { name: "sort_recent_new", what: "Sort by recently changed (function)", sql: "select * from public.songs_page(p_sort => 'recent')" },
    { name: "facets_new", what: "Filter choices, one pass", sql: "select public.song_facets()" },

    {
      name: "home_setlists",
      what: "Home page: all setlists with counts + purge (old)",
      sql: [
        "delete from public.setlists where expires_at < now()",
        `select s.id, s.name, s.service_date, s.expires_at, ${SETLIST_COUNT} as setlist_items from public.setlists s order by s.service_date desc nulls last, s.created_at desc limit 1000`,
      ],
    },
    {
      name: "home_next_setlist_new",
      what: "Home page: just the next setlist",
      sql: `select s.id, s.name, s.service_date, s.expires_at, ${SETLIST_COUNT} as setlist_items from public.setlists s where s.expires_at > now() and (s.service_date is null or s.service_date >= current_date) order by s.service_date asc nulls last, s.created_at asc limit 1`,
    },
    {
      name: "song_page_setlists_new",
      what: "Song page: setlists to add to (names only)",
      sql: "select id, name, service_date from public.setlists where expires_at > now() order by service_date desc nulls last, created_at desc limit 200",
    },
    {
      name: "setlist_open",
      what: "Open a setlist: its songs with their text",
      sql: `select i.id, i.song_id, i.position, i.settings, i.body_override, i.transition_mode, i.transition_chords, row_to_json(s) as songs from public.setlist_items i join public.songs s on s.id = i.song_id where i.setlist_id = '${ids.setlist}' order by i.position asc, i.created_at asc`,
    },
    {
      name: "setlist_messages",
      what: "Chat: last 100 messages",
      sql: `select id, sender_role, sender, body, created_at from public.setlist_messages where setlist_id = '${ids.setlist}' order by created_at desc limit 100`,
    },
    {
      name: "delete_song",
      what: "Delete a song that is in setlists (rolled back)",
      tx: true,
      sql: `delete from public.songs where id = '${ids.songInSetlist}'`,
    },
    {
      name: "delete_setlist_item",
      what: "Remove a song from a setlist (rolled back)",
      tx: true,
      sql: `delete from public.setlist_items where id = (select id from public.setlist_items where setlist_id = '${ids.setlist}' limit 1)`,
    },
  ];
}
