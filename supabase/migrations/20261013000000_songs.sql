-- ChordBase: songs. Church-owned, so it carries church_id and is guarded by
-- public.current_church_ids() like every future church table.
-- `body` is ChordPro text with inline chords, e.g. "[G]Amazing [C]grace".

create table public.songs (
  id             uuid primary key default gen_random_uuid(),
  church_id      uuid not null references public.churches (id) on delete cascade,
  title          text not null check (char_length(btrim(title)) > 0),
  artist         text not null default '',
  original_key   text not null default '',
  default_capo   smallint not null default 0 check (default_capo between 0 and 12),
  tempo          smallint check (tempo is null or tempo between 20 and 300),
  time_signature text not null default '4/4' check (time_signature ~ '^[0-9]{1,2}/[0-9]{1,2}$'),
  ccli_number    text not null default '',
  tags           text[] not null default '{}',
  body           text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index songs_church_title_idx on public.songs (church_id, lower(title));

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger songs_set_updated_at
  before update on public.songs
  for each row execute function public.set_updated_at();

alter table public.songs enable row level security;

create policy "church members can read their songs"
  on public.songs for select to authenticated
  using (church_id in (select public.current_church_ids()));

create policy "church members can add songs"
  on public.songs for insert to authenticated
  with check (church_id in (select public.current_church_ids()));

create policy "church members can edit their songs"
  on public.songs for update to authenticated
  using (church_id in (select public.current_church_ids()))
  with check (church_id in (select public.current_church_ids()));

create policy "church members can delete their songs"
  on public.songs for delete to authenticated
  using (church_id in (select public.current_church_ids()));

revoke all on public.songs from anon;
grant select, insert, update, delete on public.songs to authenticated;
