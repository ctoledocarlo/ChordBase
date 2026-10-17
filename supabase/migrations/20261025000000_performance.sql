-- ChordBase: speed. Indexes for the searches and lists the app actually runs, a church
-- default on new rows (so saving something no longer needs a lookup first), a cheaper way
-- to gather the filter choices, and a scheduled clean-up of expired setlists.

-- ---- Songs -------------------------------------------------------------------------------

-- The song list is ordered by title. The old index was on lower(title), which the list never used.
drop index if exists public.songs_church_title_idx;
create index songs_church_title_id_idx on public.songs (church_id, title, id);

-- "Recently changed" is ordered by updated_at.
create index songs_church_updated_idx on public.songs (church_id, updated_at desc, id);

-- And the other orders the list offers: by artist, by key and by tempo (slowest first, no tempo last).
create index songs_church_key_idx on public.songs (church_id, original_key, title, id);
create index songs_church_tempo_idx on public.songs (church_id, tempo, title, id);
create index songs_church_artist_idx on public.songs (church_id, artist, title, id);

-- Search matches the middle of titles and artists as well as the lyrics (which already has
-- one of these), so each needs its own trigram index for the three to be searched together.
create index songs_title_trgm_idx on public.songs using gin (title extensions.gin_trgm_ops);
create index songs_artist_trgm_idx on public.songs using gin (artist extensions.gin_trgm_ops);

-- ---- Setlists ----------------------------------------------------------------------------

-- Deleting a song looks for it in every setlist; without this it reads all of them.
create index setlist_items_song_id_idx on public.setlist_items (song_id);

-- Deleting a song from a setlist clears "on stage" if it was the one; this finds that quickly.
create index setlists_active_item_idx on public.setlists (active_item_id) where active_item_id is not null;

-- The setlist list is ordered by service date. (Expiry already has an index from when it was added.)
create index setlists_church_date_idx on public.setlists (church_id, service_date desc nulls last, created_at desc);

-- ---- No lookup before saving ---------------------------------------------------------------

-- The church of the signed-in login. Row level security still checks every row; this only lets
-- the app leave church_id out of an insert instead of reading it first.
create or replace function public.my_church_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select church_id from public.church_accounts where user_id = (select auth.uid()) limit 1
$$;

revoke all on function public.my_church_id() from public, anon;
grant execute on function public.my_church_id() to authenticated;

alter table public.songs alter column church_id set default public.my_church_id();
alter table public.setlists alter column church_id set default public.my_church_id();
alter table public.setlist_items alter column church_id set default public.my_church_id();
alter table public.setlist_messages alter column church_id set default public.my_church_id();

-- ---- Row level security the planner can use an index for ----------------------------------------

-- "church_id in (select current_church_ids())" is a join, so the database can't read the
-- (church_id, title) index in order and has to sort the whole library for every page of the list.
-- A login belongs to exactly one church (church_accounts is keyed by user), so comparing with that
-- one value gives the same rows and lets the index do the ordering. If a login ever belongs to
-- several churches, these need to go back to the join.
alter policy "church members can read their songs" on public.songs
  using (church_id = (select public.my_church_id()));
alter policy "church members can add songs" on public.songs
  with check (church_id = (select public.my_church_id()));
alter policy "church members can edit their songs" on public.songs
  using (church_id = (select public.my_church_id()))
  with check (church_id = (select public.my_church_id()));
alter policy "church members can delete their songs" on public.songs
  using (church_id = (select public.my_church_id()));

alter policy "church members can read their setlists" on public.setlists
  using (church_id = (select public.my_church_id()));
alter policy "church members can add setlists" on public.setlists
  with check (church_id = (select public.my_church_id()));
alter policy "church members can edit their setlists" on public.setlists
  using (church_id = (select public.my_church_id()))
  with check (church_id = (select public.my_church_id()));
alter policy "church members can delete their setlists" on public.setlists
  using (church_id = (select public.my_church_id()));

alter policy "church members can read their setlist items" on public.setlist_items
  using (church_id = (select public.my_church_id()));
alter policy "church members can add setlist items" on public.setlist_items
  with check (church_id = (select public.my_church_id()));
alter policy "church members can edit their setlist items" on public.setlist_items
  using (church_id = (select public.my_church_id()))
  with check (church_id = (select public.my_church_id()));
alter policy "church members can delete their setlist items" on public.setlist_items
  using (church_id = (select public.my_church_id()));

alter policy "church members can read their setlist messages" on public.setlist_messages
  using (church_id = (select public.my_church_id()));
alter policy "church members can send setlist messages" on public.setlist_messages
  with check (church_id = (select public.my_church_id()));

-- ---- Filter choices in one pass --------------------------------------------------------------

create or replace function public.song_facets()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select original_key, artist, time_signature, default_capo from public.songs
  )
  select jsonb_build_object(
    'keys', coalesce((select jsonb_agg(v order by v) from (select distinct original_key as v from s where original_key <> '') x), '[]'::jsonb),
    'artists', coalesce((select jsonb_agg(v order by lower(v)) from (select distinct artist as v from s where artist <> '') x), '[]'::jsonb),
    'time_signatures', coalesce((select jsonb_agg(v order by v) from (select distinct time_signature as v from s where time_signature <> '') x), '[]'::jsonb),
    'capos', coalesce((select jsonb_agg(v order by v) from (select distinct default_capo as v from s) x), '[]'::jsonb)
  )
$$;

-- ---- Clearing out expired setlists ------------------------------------------------------------

-- Once an hour, if the pg_cron extension can be switched on here (Supabase: Database > Extensions).
-- Without it the app removes them when the setlist list is opened, as before.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'chordbase-purge-expired-setlists';
  perform cron.schedule('chordbase-purge-expired-setlists', '17 * * * *', 'delete from public.setlists where expires_at < now()');
exception when others then
  raise notice 'pg_cron is not available, so expired setlists are removed by the app instead: %', sqlerrm;
end $$;
