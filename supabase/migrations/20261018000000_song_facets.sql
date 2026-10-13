-- ChordBase: the values that exist across a church's songs, so the song list can offer
-- them as filters without loading every song. Runs as the signed-in user, so row level
-- security still limits it to their own church.

create or replace function public.song_facets()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'keys', coalesce((
      select jsonb_agg(v order by v)
      from (select distinct original_key as v from public.songs where original_key <> '') s
    ), '[]'::jsonb),
    'artists', coalesce((
      select jsonb_agg(v order by lower(v))
      from (select distinct artist as v from public.songs where artist <> '') s
    ), '[]'::jsonb),
    'time_signatures', coalesce((
      select jsonb_agg(v order by v)
      from (select distinct time_signature as v from public.songs where time_signature <> '') s
    ), '[]'::jsonb),
    'capos', coalesce((
      select jsonb_agg(v order by v)
      from (select distinct default_capo as v from public.songs) s
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.song_facets() from public, anon;
grant execute on function public.song_facets() to authenticated;
