-- ChordBase: per-song presets (saved view settings such as key, capo, text size).
-- Church-owned, so it carries church_id and uses public.current_church_ids().

create table public.song_presets (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (song_id, name)
);

create index song_presets_song_id_idx on public.song_presets (song_id);

alter table public.song_presets enable row level security;

create policy "church members can read their presets"
  on public.song_presets for select to authenticated
  using (church_id in (select public.current_church_ids()));

create policy "church members can add presets"
  on public.song_presets for insert to authenticated
  with check (church_id in (select public.current_church_ids()));

create policy "church members can edit their presets"
  on public.song_presets for update to authenticated
  using (church_id in (select public.current_church_ids()))
  with check (church_id in (select public.current_church_ids()));

create policy "church members can delete their presets"
  on public.song_presets for delete to authenticated
  using (church_id in (select public.current_church_ids()));

revoke all on public.song_presets from anon;
grant select, insert, update, delete on public.song_presets to authenticated;
