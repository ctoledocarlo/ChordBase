-- ChordBase: the song list's search function, now also narrowed by tags (collections), and the filter
-- choices now include the tags that exist. Everything else about it is as in 20261026000000_songs_page.sql.

-- Safe to run again: an earlier version took one parameter fewer.
drop function if exists public.songs_page(text, text[], text[], text, text, integer, integer, text, integer, text, integer, integer, boolean);
drop function if exists public.songs_page(text, text[], text[], text, text, integer, integer, text, integer, text, integer, integer, boolean, text);
drop function if exists public.songs_page(text, text[], text[], text, text, integer, integer, text, integer, text, integer, integer, boolean, text, text[]);

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
  p_with_body   boolean default false,
  -- The search as one flattened phrase (lower case, no punctuation), for ranking songs that have it whole.
  p_phrase      text    default '',
  -- Only songs that have every one of these tags.
  p_tags        text[]  default '{}'
)
returns table (
  id           uuid,
  title        text,
  artist       text,
  original_key text,
  tempo        smallint,
  tags         text[],
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
  -- For "best match" ordering:
  phrase text := replace(btrim(coalesce(p_phrase, '')), chr(1), '');
  tier   text;
  span   text := '0';
  locs   text[] := '{}';
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
  if cardinality(coalesce(p_tags, '{}')) > 0 then
    conds := conds || (a || '.tags @> ' || quote_literal(replace(p_tags::text, chr(1), '')) || '::text[]');
  end if;
  where_sql := array_to_string(conds, ' and ');

  if p_sort = 'relevance' and text_search then
    -- "Best match": the closer a song is to what was typed, the nearer the top.
    --   0 the title is exactly it       1 the title starts with it     2 the title has it in it
    --   3 the lyrics have the words together, as typed
    --   4 the artist has it in it       5 the lyrics have all the words, somewhere
    -- Among the lyric matches, the words that sit closest together come first (the distance from the first
    -- of them to the last). Ties go to the title, then the id, so pages stay steady.
    tier := 'case'
      || ' when lower(' || a || '.title) = ' || quote_literal(lower(q)) || ' then 0'
      || ' when ' || a || '.title ilike ' || quote_literal(replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%') || ' then 1'
      || ' when ' || a || '.title ilike ' || quote_literal(like_q) || ' then 2'
      || case
           when phrase <> '' then ' when ' || a || '.lyrics like ' || quote_literal('%' || replace(replace(replace(phrase, '\', '\\'), '%', '\%'), '_', '\_') || '%') || ' then 3'
           else ''
         end
      || ' when ' || a || '.artist ilike ' || quote_literal(like_q) || ' then 4'
      || ' else 5 end';
    foreach tok in array coalesce(p_tokens, '{}') loop
      locs := locs || ('strpos(' || a || '.lyrics, ' || quote_literal(replace(tok, chr(1), '')) || ')');
    end loop;
    if cardinality(locs) > 1 then
      span := 'greatest(' || array_to_string(locs, ', ') || ') - least(' || array_to_string(locs, ', ') || ')';
    end if;
    sorted := tier || ', case when ' || tier || ' in (3, 5) then ' || span || ' else 0 end, ' || a || '.title, ' || a || '.id';
  else
    -- The id keeps the order steady between pages when titles match.
    sorted := case p_sort
      when 'artist' then a || '.artist, ' || a || '.title, ' || a || '.id'
      when 'key'    then a || '.original_key, ' || a || '.title, ' || a || '.id'
      when 'tempo'  then a || '.tempo asc nulls last, ' || a || '.title, ' || a || '.id'
      when 'recent' then a || '.updated_at desc, ' || a || '.id'
      else               a || '.title, ' || a || '.id'
    end;
  end if;

  sql_text :=
    'select ' || a || '.id, ' || a || '.title, ' || a || '.artist, ' || a || '.original_key, ' || a || '.tempo, ' || a || '.tags, '
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

revoke all on function public.songs_page(text, text[], text[], text, text, integer, integer, text, integer, text, integer, integer, boolean, text, text[]) from public, anon;
grant execute on function public.songs_page(text, text[], text[], text, text, integer, integer, text, integer, text, integer, integer, boolean, text, text[]) to authenticated;

-- The filter choices, with the tags that are in use.
create or replace function public.song_facets()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select original_key, artist, time_signature, default_capo, tags from public.songs
  )
  select jsonb_build_object(
    'keys', coalesce((select jsonb_agg(v order by v) from (select distinct original_key as v from s where original_key <> '') x), '[]'::jsonb),
    'artists', coalesce((select jsonb_agg(v order by lower(v)) from (select distinct artist as v from s where artist <> '') x), '[]'::jsonb),
    'time_signatures', coalesce((select jsonb_agg(v order by v) from (select distinct time_signature as v from s where time_signature <> '') x), '[]'::jsonb),
    'capos', coalesce((select jsonb_agg(v order by v) from (select distinct default_capo as v from s) x), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(v order by lower(v)) from (select distinct unnest(tags) as v from s) x where v <> ''), '[]'::jsonb)
  )
$$;
