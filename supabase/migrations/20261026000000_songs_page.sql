-- ChordBase: one call that finds a page of songs, with the total, for the song list and the
-- "add a song" boxes.
--
-- Why a function: with row level security on, the database refuses to use a search index for
-- ILIKE ("contains") searches, because ILIKE isn't marked safe to run before the security check.
-- That makes every search read every song. This function runs as its owner and checks the church
-- itself (my_church_id), so the trigram indexes on title, artist and lyrics can be used. It also
-- counts the matches in the same call instead of a second request.
--
-- It only ever returns the signed-in login's own church's songs: with no login, my_church_id() is
-- null and nothing matches.

create or replace function public.songs_page(
  p_q           text    default '',
  p_tokens      text[]  default '{}',
  p_keys        text[]  default '{}',
  p_artist      text    default '',
  p_mode        text    default '',
  p_tempo_min   integer default null,
  p_tempo_max   integer default null,
  p_ts          text    default '',
  p_capo        integer default null,
  p_sort        text    default 'title',
  p_limit       integer default 25,
  p_offset      integer default 0,
  p_with_body   boolean default false
)
returns table (
  id           uuid,
  title        text,
  artist       text,
  original_key text,
  tempo        smallint,
  body         text,
  total        bigint
)
language plpgsql
stable
security definer
set search_path = ''
-- The database assumes reading an index page is as slow as a spinning disk. Telling it otherwise
-- here (Supabase runs on SSDs) is what makes it pick the search indexes over reading every song.
set random_page_cost = 1.1
as $fn$
declare
  minor_key constant text := '^[A-G][#b]?m($|[^a])';
  -- Stands in for the table's name while the conditions are built, so the same conditions can be
  -- used for the page and for the count. Anything a person typed has it stripped out first.
  a constant text := chr(1);
  conds  text[] := array[a || '.church_id = ' || quote_nullable(public.my_church_id())];
  q      text := replace(btrim(coalesce(p_q, '')), chr(1), '');
  like_q text;
  arms   text[];
  tok    text;
  lyric  text[] := '{}';
  sorted text;
  where_sql text;
  sql_text text;
  text_search boolean := q <> '';
begin
  -- Words to look for: in the title or artist as typed, or every word somewhere in the lyrics.
  if text_search then
    like_q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    arms := array[a || '.title ilike ' || quote_literal(like_q), a || '.artist ilike ' || quote_literal(like_q)];
    foreach tok in array coalesce(p_tokens, '{}') loop
      lyric := lyric || (a || '.lyrics ilike ' || quote_literal('%' || replace(replace(replace(replace(tok, chr(1), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'));
    end loop;
    if cardinality(lyric) > 0 then
      arms := arms || ('(' || array_to_string(lyric, ' and ') || ')');
    end if;
    conds := conds || ('(' || array_to_string(arms, ' or ') || ')');
  end if;

  if cardinality(coalesce(p_keys, '{}')) > 0 then
    conds := conds || (a || '.original_key = any (' || quote_literal(replace(p_keys::text, chr(1), '')) || '::text[])');
  end if;
  if coalesce(p_artist, '') <> '' then
    conds := conds || (a || '.artist = ' || quote_literal(replace(p_artist, chr(1), '')));
  end if;
  if p_mode = 'minor' then
    conds := conds || (a || '.original_key ~ ' || quote_literal(minor_key));
  elsif p_mode = 'major' then
    conds := conds || ('(' || a || '.original_key <> '''' and ' || a || '.original_key !~ ' || quote_literal(minor_key) || ')');
  end if;
  if p_tempo_min is not null then
    conds := conds || (a || '.tempo >= ' || p_tempo_min::int);
  end if;
  if p_tempo_max is not null then
    conds := conds || (a || '.tempo <= ' || p_tempo_max::int);
  end if;
  if coalesce(p_ts, '') <> '' then
    conds := conds || (a || '.time_signature = ' || quote_literal(replace(p_ts, chr(1), '')));
  end if;
  if p_capo is not null then
    conds := conds || (a || '.default_capo = ' || p_capo::int);
  end if;
  where_sql := array_to_string(conds, ' and ');

  -- The id keeps the order steady between pages when titles match.
  sorted := case p_sort
    when 'artist' then a || '.artist, ' || a || '.title, ' || a || '.id'
    when 'key'    then a || '.original_key, ' || a || '.title, ' || a || '.id'
    when 'tempo'  then a || '.tempo asc nulls last, ' || a || '.title, ' || a || '.id'
    when 'recent' then a || '.updated_at desc, ' || a || '.id'
    else               a || '.title, ' || a || '.id'
  end;

  sql_text :=
    'select ' || a || '.id, ' || a || '.title, ' || a || '.artist, ' || a || '.original_key, ' || a || '.tempo, '
    || case when p_with_body then a || '.body' else 'null::text' end || ', '
    -- A search finds its matches once and counts them as it goes. Without a search the page can be read
    -- straight off the title index and stop after 25 rows, so the total is counted on its own.
    || case
         when text_search then 'count(*) over () '
         else '(select count(*) from public.songs ' || chr(2) || ' where ' || replace(where_sql, a, chr(2)) || ') '
       end
    || 'from public.songs ' || a || ' where ' || where_sql || ' order by ' || sorted
    || ' limit ' || least(greatest(coalesce(p_limit, 25), 1), 100) || ' offset ' || greatest(coalesce(p_offset, 0), 0);

  -- The page's table is "s" and the count's is "c".
  return query execute replace(replace(sql_text, a, 's'), chr(2), 'c');
end
$fn$;

revoke all on function public.songs_page(text, text[], text[], text, text, integer, integer, text, integer, text, integer, integer, boolean) from public, anon;
grant execute on function public.songs_page(text, text[], text[], text, text, integer, integer, text, integer, text, integer, integer, boolean) to authenticated;
