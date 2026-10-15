-- ChordBase: a chat for the screens showing a setlist during a session (Media, Stage and Viewer).
-- Messages belong to the setlist and go when it does. Church-owned, like everything else.

create table public.setlist_messages (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  setlist_id  uuid not null references public.setlists (id) on delete cascade,
  -- Everyone shares one login, so a message says what kind of screen sent it, and which tab (to mark "mine").
  sender_role text not null check (sender_role in ('stage', 'media', 'viewer')),
  sender      text not null check (char_length(sender) between 1 and 64),
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);

create index setlist_messages_setlist_idx on public.setlist_messages (setlist_id, created_at);

alter table public.setlist_messages enable row level security;

create policy "church members can read their setlist messages"
  on public.setlist_messages for select to authenticated
  using (church_id in (select public.current_church_ids()));

create policy "church members can send setlist messages"
  on public.setlist_messages for insert to authenticated
  with check (church_id in (select public.current_church_ids()));

revoke all on public.setlist_messages from anon;
grant select, insert on public.setlist_messages to authenticated;

-- Publish new messages through Realtime so every screen sees them at once.
alter publication supabase_realtime add table public.setlist_messages;
