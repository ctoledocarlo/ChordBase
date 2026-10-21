-- ChordBase: the team tools.
--   * song links, and each song's melody range (for finding a key a singer can sing)
--   * singers and their ranges, and who sings which song in a setlist
--   * a service timer on a setlist
--   * views for each instrument in a setlist, with notes per song and per view, and a pre-service checklist
--   * a permanent history of the songs that were played
--   * merging duplicate songs
--
-- Safe to run again: everything checks whether it is already there.

-- ---- Songs: links and the melody's range --------------------------------------------------------------

alter table public.songs
  add column if not exists melody_low  text  not null default '' check (melody_low  ~ '^([A-G][#b]?-?[0-9])?$'),
  add column if not exists melody_high text  not null default '' check (melody_high ~ '^([A-G][#b]?-?[0-9])?$'),
  -- [{ "label": "Studio recording", "url": "https://...", "kind": "recording" }, ...]
  add column if not exists links       jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array');

create index if not exists songs_tags_idx on public.songs using gin (tags);

-- ---- Singers --------------------------------------------------------------------------------------------

create table if not exists public.singers (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.my_church_id() references public.churches (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  -- The lowest and highest notes they sing comfortably, like A2 and E4 (C4 is middle C).
  range_low  text not null check (range_low  ~ '^[A-G][#b]?-?[0-9]$'),
  range_high text not null check (range_high ~ '^[A-G][#b]?-?[0-9]$'),
  created_at timestamptz not null default now()
);
create index if not exists singers_church_idx on public.singers (church_id, lower(name));

alter table public.setlist_items
  add column if not exists singer_id uuid references public.singers (id) on delete set null;

-- ---- A service timer ------------------------------------------------------------------------------------

alter table public.setlists
  add column if not exists timer_started_at timestamptz,
  add column if not exists timer_ends_at    timestamptz;

-- ---- Views for each instrument, notes, and the checklist -------------------------------------------------

create table if not exists public.setlist_views (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null default public.my_church_id() references public.churches (id) on delete cascade,
  setlist_id  uuid not null references public.setlists (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  -- "all" is the view everyone shares (one per setlist); the rest are instruments the team adds.
  kind        text not null default 'instrument' check (kind in ('all', 'instrument')),
  show_chords boolean not null default true,
  position    integer not null default 0,
  edited_by   text,
  created_at  timestamptz not null default now()
);
create unique index if not exists setlist_views_one_all on public.setlist_views (setlist_id) where kind = 'all';
create index if not exists setlist_views_setlist_idx on public.setlist_views (setlist_id, position);

create table if not exists public.setlist_notes (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.my_church_id() references public.churches (id) on delete cascade,
  setlist_id uuid not null references public.setlists (id) on delete cascade,
  item_id    uuid not null references public.setlist_items (id) on delete cascade,
  view_id    uuid not null references public.setlist_views (id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 2000),
  edited_by  text,
  updated_at timestamptz not null default now(),
  unique (item_id, view_id)
);
create index if not exists setlist_notes_setlist_idx on public.setlist_notes (setlist_id);

drop trigger if exists setlist_notes_set_updated_at on public.setlist_notes;
create trigger setlist_notes_set_updated_at
  before update on public.setlist_notes
  for each row execute function public.set_updated_at();

create table if not exists public.setlist_tasks (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null default public.my_church_id() references public.churches (id) on delete cascade,
  setlist_id uuid not null references public.setlists (id) on delete cascade,
  -- Null means everyone's; otherwise it belongs to one instrument's view.
  view_id    uuid references public.setlist_views (id) on delete cascade,
  label      text not null check (char_length(btrim(label)) between 1 and 120),
  done       boolean not null default false,
  done_by    text,
  done_at    timestamptz,
  position   integer not null default 0,
  edited_by  text,
  created_at timestamptz not null default now()
);
create index if not exists setlist_tasks_setlist_idx on public.setlist_tasks (setlist_id, position);

-- ---- What was played ------------------------------------------------------------------------------------

create table if not exists public.song_history (
  church_id    uuid not null default public.my_church_id() references public.churches (id) on delete cascade,
  song_id      uuid not null references public.songs (id) on delete cascade,
  played_on    date not null,
  setlist_name text not null default '',
  key          text not null default '',
  primary key (song_id, played_on)
);
create index if not exists song_history_church_date_idx on public.song_history (church_id, played_on desc);

-- ---- Access: each church's own rows ----------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['singers', 'setlist_views', 'setlist_notes', 'setlist_tasks', 'song_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "church members use their %1$s" on public.%1$I', t);
    execute format(
      'create policy "church members use their %1$s" on public.%1$I for all to authenticated '
      || 'using (church_id = (select public.my_church_id())) with check (church_id = (select public.my_church_id()))',
      t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- ---- Live updates for the new setlist tables --------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['setlist_views', 'setlist_notes', 'setlist_tasks'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- ---- Merging duplicate songs -------------------------------------------------------------------------------

-- Keeps one song and folds the others into it: setlists and history that used them now use the keeper,
-- their tags are added to the keeper's, and then they are removed. Row level security applies, so it
-- can only touch the signed-in church's songs.
create or replace function public.merge_songs(p_keep uuid, p_drop uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  p_drop := array_remove(p_drop, p_keep);
  if p_drop is null or cardinality(p_drop) = 0 then
    return;
  end if;
  if not exists (select 1 from public.songs where id = p_keep) then
    raise exception 'song not found';
  end if;

  update public.setlist_items set song_id = p_keep where song_id = any (p_drop);

  insert into public.song_history (song_id, played_on, setlist_name, key)
  select p_keep, played_on, setlist_name, key from public.song_history where song_id = any (p_drop)
  on conflict do nothing;

  update public.songs k
  set tags = (
    select coalesce(array_agg(distinct t order by t), '{}')
    from public.songs s, unnest(s.tags) as t
    where s.id = p_keep or s.id = any (p_drop)
  )
  where k.id = p_keep;

  delete from public.songs where id = any (p_drop);
end;
$$;

revoke execute on function public.merge_songs(uuid, uuid[]) from public, anon;
grant execute on function public.merge_songs(uuid, uuid[]) to authenticated;
