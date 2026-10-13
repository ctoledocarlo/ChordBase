-- ChordBase: setlists. A setlist is an ordered list of songs, and each entry keeps
-- its own view settings (key, capo, text size, chords on/off...) for that setlist only.
-- Church-owned, so both tables carry church_id and use public.current_church_ids().

create table public.setlists (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  service_date date,
  created_at   timestamptz not null default now()
);

create index setlists_church_id_idx on public.setlists (church_id);

create table public.setlist_items (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  setlist_id uuid not null references public.setlists (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  position   integer not null default 0,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index setlist_items_setlist_id_idx on public.setlist_items (setlist_id, position);

alter table public.setlists enable row level security;
alter table public.setlist_items enable row level security;

create policy "church members can read their setlists"
  on public.setlists for select to authenticated
  using (church_id in (select public.current_church_ids()));

create policy "church members can add setlists"
  on public.setlists for insert to authenticated
  with check (church_id in (select public.current_church_ids()));

create policy "church members can edit their setlists"
  on public.setlists for update to authenticated
  using (church_id in (select public.current_church_ids()))
  with check (church_id in (select public.current_church_ids()));

create policy "church members can delete their setlists"
  on public.setlists for delete to authenticated
  using (church_id in (select public.current_church_ids()));

create policy "church members can read their setlist items"
  on public.setlist_items for select to authenticated
  using (church_id in (select public.current_church_ids()));

create policy "church members can add setlist items"
  on public.setlist_items for insert to authenticated
  with check (church_id in (select public.current_church_ids()));

create policy "church members can edit their setlist items"
  on public.setlist_items for update to authenticated
  using (church_id in (select public.current_church_ids()))
  with check (church_id in (select public.current_church_ids()));

create policy "church members can delete their setlist items"
  on public.setlist_items for delete to authenticated
  using (church_id in (select public.current_church_ids()));

revoke all on public.setlists from anon;
revoke all on public.setlist_items from anon;
grant select, insert, update, delete on public.setlists to authenticated;
grant select, insert, update, delete on public.setlist_items to authenticated;
