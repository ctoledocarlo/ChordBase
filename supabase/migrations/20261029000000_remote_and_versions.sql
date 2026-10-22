-- ChordBase: the phone remote's PIN, and a history of each song's earlier versions.
--
-- Run 20261028000000_team_tools.sql first (the versions below keep the melody range and links it added).
-- Safe to run again: everything checks whether it is already there.

-- ---- The phone remote ---------------------------------------------------------------------------------

-- While a setlist's remote is on, it has a six-digit PIN. A phone that types it (no login) can control that one setlist.
-- Switching the remote off clears the PIN. The PIN is read and written by logged-in Media screens through the usual
-- row level security; phones without a login never touch this table directly (the server checks the PIN for them).
alter table public.setlists
  add column if not exists remote_pin        text check (remote_pin is null or remote_pin ~ '^[0-9]{6}$'),
  add column if not exists remote_started_at timestamptz;

-- ---- Earlier versions of each song --------------------------------------------------------------------

create table if not exists public.song_versions (
  id             uuid primary key default gen_random_uuid(),
  church_id      uuid not null references public.churches (id) on delete cascade,
  song_id        uuid not null references public.songs (id) on delete cascade,
  -- The song as it was just before a save changed it.
  title          text not null,
  artist         text not null default '',
  original_key   text not null default '',
  default_capo   smallint not null default 0,
  tempo          smallint,
  time_signature text not null default '4/4',
  ccli_number    text not null default '',
  tags           text[] not null default '{}',
  melody_low     text not null default '',
  melody_high    text not null default '',
  links          jsonb not null default '[]'::jsonb,
  body           text not null default '',
  saved_at       timestamptz not null default now()
);
create index if not exists song_versions_song_idx on public.song_versions (song_id, saved_at desc);

alter table public.song_versions enable row level security;

drop policy if exists "church members can read their song versions" on public.song_versions;
create policy "church members can read their song versions"
  on public.song_versions for select to authenticated
  using (church_id in (select public.current_church_ids()));

-- Versions are written only by the trigger below; nobody edits them by hand.
revoke all on public.song_versions from anon;
revoke all on public.song_versions from authenticated;
grant select on public.song_versions to authenticated;

-- Before a song is changed, keep how it was. A save that changes nothing keeps nothing. The latest 60 are kept per song.
create or replace function public.keep_song_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.title, old.artist, old.original_key, old.default_capo, old.tempo, old.time_signature, old.ccli_number,
      old.tags, old.melody_low, old.melody_high, old.links, old.body)
     is distinct from
     (new.title, new.artist, new.original_key, new.default_capo, new.tempo, new.time_signature, new.ccli_number,
      new.tags, new.melody_low, new.melody_high, new.links, new.body) then

    insert into public.song_versions
      (church_id, song_id, title, artist, original_key, default_capo, tempo, time_signature, ccli_number,
       tags, melody_low, melody_high, links, body)
    values
      (old.church_id, old.id, old.title, old.artist, old.original_key, old.default_capo, old.tempo, old.time_signature,
       old.ccli_number, old.tags, old.melody_low, old.melody_high, old.links, old.body);

    delete from public.song_versions
    where song_id = old.id
      and id not in (select id from public.song_versions where song_id = old.id order by saved_at desc, id limit 60);
  end if;
  return new;
end;
$$;

drop trigger if exists songs_keep_version on public.songs;
create trigger songs_keep_version
  before update on public.songs
  for each row execute function public.keep_song_version();
