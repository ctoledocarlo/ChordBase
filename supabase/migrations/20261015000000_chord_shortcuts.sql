-- ChordBase: a church's saved chord shortcuts, shown as tap-to-place buttons
-- in the song editor. Church-owned, so it carries church_id and uses
-- public.current_church_ids().

create table public.chord_shortcuts (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  chord      text not null check (char_length(btrim(chord)) between 1 and 20),
  created_at timestamptz not null default now(),
  unique (church_id, chord)
);

alter table public.chord_shortcuts enable row level security;

create policy "church members can read their chord shortcuts"
  on public.chord_shortcuts for select to authenticated
  using (church_id in (select public.current_church_ids()));

create policy "church members can add chord shortcuts"
  on public.chord_shortcuts for insert to authenticated
  with check (church_id in (select public.current_church_ids()));

create policy "church members can delete their chord shortcuts"
  on public.chord_shortcuts for delete to authenticated
  using (church_id in (select public.current_church_ids()));

revoke all on public.chord_shortcuts from anon;
grant select, insert, delete on public.chord_shortcuts to authenticated;
