-- ChordBase: the schedule.
--
--   * people:      everyone who can be scheduled. A person with an account is linked to it; a person without one
--                  is simply not linked yet, and the church's main account can link them when they join.
--   * schedule_events:       a service or event on a date. Every Sunday is on the schedule by default (made when something is
--                  first put on it); anyone can add an event in between.
--   * schedule_assignments:  who does what at an event (song leader, backup singers, each instrument, media).
--   * schedule_log: the change log: who changed what, and when.
--   * setlists.event_id:     the event a setlist is for, so a setlist shows the team for that service.
--
-- Everything that changes the schedule goes through the functions below, which check who is asking and write the
-- change log. The tables themselves can only be read. Run 20261101000000 and 20261102000000 first. Safe to run again.

-- ---- Roles on the schedule ---------------------------------------------------------------------------------

create or replace function public.valid_schedule_role(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p = any (array['song-leader', 'backup-singer', 'keys', 'acoustic-guitar', 'electric-guitar', 'bass', 'drums', 'other', 'media']::text[])
$$;

create or replace function public.schedule_role_label(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'song-leader' then 'song leader'
    when 'backup-singer' then 'backup singer'
    when 'keys' then 'keys'
    when 'acoustic-guitar' then 'acoustic guitar'
    when 'electric-guitar' then 'electric guitar'
    when 'bass' then 'bass'
    when 'drums' then 'drums'
    when 'other' then 'another instrument'
    when 'media' then 'media'
    else p end
$$;

-- ---- People ------------------------------------------------------------------------------------------------

create table if not exists public.people (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name  text not null default '' check (char_length(last_name) <= 60),
  ministries text[] not null default '{}' check (public.valid_ministries(ministries)),
  -- The account this person signs in with, once they have one.
  user_id    uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
-- Two people in one church can't share a full name (ignoring case and spacing), so a name always means one person.
create unique index if not exists people_church_name_unique on public.people (church_id, lower(btrim(first_name || ' ' || last_name)));

-- Everyone who already has an account is a person too.
insert into public.people (church_id, first_name, last_name, ministries, user_id)
select ca.church_id, coalesce(nullif(btrim(ca.first_name), ''), split_part(coalesce(u.email, 'member'), '@', 1)), btrim(ca.last_name), ca.ministries, ca.user_id
from public.church_accounts ca
left join auth.users u on u.id = ca.user_id
where not exists (select 1 from public.people p where p.user_id = ca.user_id)
on conflict do nothing;

-- A new account in a church gets a person (unless it was just linked to one).
create or replace function public.ensure_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f text;
  l text;
begin
  if exists (select 1 from public.people where user_id = new.user_id) then return new; end if;
  select coalesce(nullif(btrim(new.first_name), ''), split_part(coalesce(u.email, 'member'), '@', 1)), btrim(new.last_name)
    into f, l from auth.users u where u.id = new.user_id;
  f := coalesce(f, 'Member');
  l := coalesce(l, '');
  begin
    insert into public.people (church_id, first_name, last_name, ministries, user_id) values (new.church_id, f, l, new.ministries, new.user_id);
  exception when unique_violation then
    insert into public.people (church_id, first_name, last_name, ministries, user_id) values (new.church_id, f, l || ' (2)', new.ministries, new.user_id);
  end;
  return new;
end
$$;

drop trigger if exists church_accounts_ensure_person on public.church_accounts;
create trigger church_accounts_ensure_person after insert on public.church_accounts for each row execute function public.ensure_person();

-- ---- Events, assignments, change log ---------------------------------------------------------------------------

create table if not exists public.schedule_events (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  -- "sunday" is the default weekly service; "event" is anything added in between.
  kind       text not null default 'event' check (kind in ('sunday', 'event')),
  title      text not null check (char_length(btrim(title)) between 1 and 80),
  starts_on  date not null,
  starts_at  time,
  location   text not null default '' check (char_length(location) <= 120),
  notes      text not null default '' check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists schedule_one_sunday on public.schedule_events (church_id, starts_on) where kind = 'sunday';
create index if not exists schedule_events_church_date_idx on public.schedule_events (church_id, starts_on);
create index if not exists schedule_events_created_by_idx on public.schedule_events (created_by);

create table if not exists public.schedule_assignments (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  event_id   uuid not null references public.schedule_events (id) on delete cascade,
  person_id  uuid not null references public.people (id) on delete cascade,
  role       text not null check (public.valid_schedule_role(role)),
  note       text not null default '' check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, person_id, role)
);
create index if not exists schedule_assignments_person_idx on public.schedule_assignments (person_id);
create index if not exists schedule_assignments_church_idx on public.schedule_assignments (church_id);
create index if not exists schedule_assignments_created_by_idx on public.schedule_assignments (created_by);

create table if not exists public.schedule_log (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  event_id   uuid references public.schedule_events (id) on delete set null,
  actor_id   uuid references auth.users (id) on delete set null,
  actor_name text not null default '',
  action     text not null,
  summary    text not null check (char_length(summary) <= 400),
  created_at timestamptz not null default now()
);
create index if not exists schedule_log_church_idx on public.schedule_log (church_id, created_at desc);
create index if not exists schedule_log_event_idx on public.schedule_log (event_id);
create index if not exists schedule_log_actor_idx on public.schedule_log (actor_id);

alter table public.setlists add column if not exists event_id uuid references public.schedule_events (id) on delete set null;
create index if not exists setlists_event_idx on public.setlists (event_id);

-- Read-only to the app; the functions below write.
alter table public.people enable row level security;
alter table public.schedule_events enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.schedule_log enable row level security;

drop policy if exists "church members can read their people" on public.people;
create policy "church members can read their people" on public.people for select to authenticated using (church_id in (select public.current_church_ids()));
drop policy if exists "church members can read their schedule" on public.schedule_events;
create policy "church members can read their schedule" on public.schedule_events for select to authenticated using (church_id in (select public.current_church_ids()));
drop policy if exists "church members can read their assignments" on public.schedule_assignments;
create policy "church members can read their assignments" on public.schedule_assignments for select to authenticated using (church_id in (select public.current_church_ids()));
drop policy if exists "church members can read their change log" on public.schedule_log;
create policy "church members can read their change log" on public.schedule_log for select to authenticated using (church_id in (select public.current_church_ids()));

revoke all on public.people, public.schedule_events, public.schedule_assignments, public.schedule_log from anon, authenticated;
grant select on public.people, public.schedule_events, public.schedule_assignments, public.schedule_log to authenticated;

-- ---- Who is asking ---------------------------------------------------------------------------------------------

-- The signed-in person's role in their church (null if none).
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.church_accounts where user_id = (select auth.uid())
$$;

-- Admins and main accounts run the people list, change any event, and import.
create or replace function public.can_manage_schedule()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role() in ('church', 'admin'), false)
$$;

-- How the signed-in person is named in the change log.
create or replace function public.actor_label()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(ca.first_name || ' ' || ca.last_name), ''), u.email::text, 'Someone')
  from public.church_accounts ca
  left join auth.users u on u.id = ca.user_id
  where ca.user_id = (select auth.uid())
$$;

create or replace function public.person_label(p_person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select btrim(first_name || ' ' || last_name) from public.people where id = p_person
$$;

-- "Sunday, Oct 25" for the weekly service, "Youth night (Oct 29)" for anything else.
create or replace function public.event_label(p_event uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when kind = 'sunday' then to_char(starts_on, 'FMDay, FMMon FMDD') else title || ' (' || to_char(starts_on, 'FMMon FMDD') || ')' end
  from public.schedule_events where id = p_event
$$;

-- Writes a line in the change log. Old lines are tidied away now and then (the latest 2,000 per church are kept).
create or replace function public.log_schedule(p_church uuid, p_event uuid, p_action text, p_summary text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.schedule_log (church_id, event_id, actor_id, actor_name, action, summary)
  values (p_church, p_event, (select auth.uid()), coalesce(public.actor_label(), 'Someone'), p_action, left(p_summary, 400));
  if random() < 0.02 then
    delete from public.schedule_log
    where church_id = p_church and id not in (select id from public.schedule_log where church_id = p_church order by created_at desc limit 2000);
  end if;
end
$$;

-- ---- Events -----------------------------------------------------------------------------------------------------

-- The default weekly service for a Sunday, made the first time something is put on it. Safe to ask for again.
create or replace function public.schedule_ensure_sunday(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  eid uuid;
begin
  if cid is null then return jsonb_build_object('error', 'Join a church first.'); end if;
  if p_date is null or extract(dow from p_date) <> 0 then return jsonb_build_object('error', 'That isn''t a Sunday.'); end if;
  if p_date < current_date - 400 or p_date > current_date + 800 then return jsonb_build_object('error', 'That date is too far away.'); end if;
  insert into public.schedule_events (church_id, kind, title, starts_on, created_by) values (cid, 'sunday', 'Sunday service', p_date, (select auth.uid()))
  on conflict (church_id, starts_on) where kind = 'sunday' do nothing;
  select id into eid from public.schedule_events where church_id = cid and kind = 'sunday' and starts_on = p_date;
  return jsonb_build_object('ok', true, 'event_id', eid);
end
$$;

-- Anyone in the church can add an event in between the Sundays.
create or replace function public.schedule_add_event(p_title text, p_date date, p_time text, p_location text, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  t text := regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  tm time;
  eid uuid;
begin
  if cid is null then return jsonb_build_object('error', 'Join a church first.'); end if;
  if char_length(t) not between 1 and 80 then return jsonb_build_object('error', 'Give the event a name (up to 80 characters).'); end if;
  if p_date is null or p_date < current_date - 400 or p_date > current_date + 800 then return jsonb_build_object('error', 'Choose a date.'); end if;
  if coalesce(btrim(p_time), '') <> '' then
    if p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return jsonb_build_object('error', 'Use a time like 18:30.'); end if;
    tm := p_time::time;
  end if;
  if char_length(coalesce(p_location, '')) > 120 or char_length(coalesce(p_notes, '')) > 1000 then return jsonb_build_object('error', 'That is too long.'); end if;

  insert into public.schedule_events (church_id, kind, title, starts_on, starts_at, location, notes, created_by)
  values (cid, 'event', t, p_date, tm, btrim(coalesce(p_location, '')), btrim(coalesce(p_notes, '')), (select auth.uid()))
  returning id into eid;
  perform public.log_schedule(cid, eid, 'event_added', 'added the event “' || t || '” on ' || to_char(p_date, 'FMDay, FMMon FMDD'));
  return jsonb_build_object('ok', true, 'event_id', eid);
end
$$;

-- The person who added an event, or an admin, can change it. The weekly Sunday service can be changed by admins only, and its date can't move.
create or replace function public.schedule_update_event(p_id uuid, p_title text, p_date date, p_time text, p_location text, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  ev public.schedule_events%rowtype;
  t text := regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  tm time;
begin
  select * into ev from public.schedule_events where id = p_id and church_id = cid;
  if not found then return jsonb_build_object('error', 'That event isn''t there any more.'); end if;
  if not public.can_manage_schedule() and (ev.kind = 'sunday' or ev.created_by is distinct from (select auth.uid())) then
    return jsonb_build_object('error', 'Only the person who added it, or an admin, can change this.');
  end if;
  if ev.kind = 'sunday' then t := ev.title; p_date := ev.starts_on; end if;
  if char_length(t) not between 1 and 80 then return jsonb_build_object('error', 'Give the event a name (up to 80 characters).'); end if;
  if p_date is null or p_date < current_date - 400 or p_date > current_date + 800 then return jsonb_build_object('error', 'Choose a date.'); end if;
  if coalesce(btrim(p_time), '') <> '' then
    if p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return jsonb_build_object('error', 'Use a time like 18:30.'); end if;
    tm := p_time::time;
  end if;
  if char_length(coalesce(p_location, '')) > 120 or char_length(coalesce(p_notes, '')) > 1000 then return jsonb_build_object('error', 'That is too long.'); end if;

  update public.schedule_events
  set title = t, starts_on = p_date, starts_at = tm, location = btrim(coalesce(p_location, '')), notes = btrim(coalesce(p_notes, '')), updated_at = now()
  where id = p_id;
  perform public.log_schedule(cid, p_id, 'event_changed', 'changed the details of ' || public.event_label(p_id));
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.schedule_delete_event(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  ev public.schedule_events%rowtype;
begin
  select * into ev from public.schedule_events where id = p_id and church_id = cid;
  if not found then return jsonb_build_object('error', 'That event isn''t there any more.'); end if;
  if ev.kind = 'sunday' then return jsonb_build_object('error', 'Sundays are always on the schedule. Remove the people instead.'); end if;
  if not public.can_manage_schedule() and ev.created_by is distinct from (select auth.uid()) then
    return jsonb_build_object('error', 'Only the person who added it, or an admin, can remove this.');
  end if;
  perform public.log_schedule(cid, null, 'event_removed', 'removed the event “' || ev.title || '” on ' || to_char(ev.starts_on, 'FMDay, FMMon FMDD'));
  delete from public.schedule_events where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

-- ---- Putting people on the schedule ------------------------------------------------------------------------------

-- Anyone in the church can put anyone on, themselves included.
create or replace function public.schedule_assign(p_event uuid, p_person uuid, p_role text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  added integer;
begin
  if cid is null then return jsonb_build_object('error', 'Join a church first.'); end if;
  if not exists (select 1 from public.schedule_events where id = p_event and church_id = cid) then return jsonb_build_object('error', 'That event isn''t there any more.'); end if;
  if not exists (select 1 from public.people where id = p_person and church_id = cid) then return jsonb_build_object('error', 'That person isn''t on your list.'); end if;
  if not public.valid_schedule_role(p_role) then return jsonb_build_object('error', 'Choose a role.'); end if;
  if char_length(coalesce(p_note, '')) > 200 then return jsonb_build_object('error', 'Keep the note short.'); end if;

  insert into public.schedule_assignments (church_id, event_id, person_id, role, note, created_by)
  values (cid, p_event, p_person, p_role, btrim(coalesce(p_note, '')), (select auth.uid()))
  on conflict (event_id, person_id, role) do nothing;
  get diagnostics added = row_count;
  if added = 0 then return jsonb_build_object('ok', true, 'already', true); end if;
  perform public.log_schedule(cid, p_event, 'assigned', 'put ' || public.person_label(p_person) || ' on ' || public.schedule_role_label(p_role) || ' for ' || public.event_label(p_event));
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.schedule_unassign(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  a public.schedule_assignments%rowtype;
begin
  select * into a from public.schedule_assignments where id = p_id and church_id = cid;
  if not found then return jsonb_build_object('error', 'That assignment isn''t there any more.'); end if;
  perform public.log_schedule(cid, a.event_id, 'unassigned', 'took ' || public.person_label(a.person_id) || ' off ' || public.schedule_role_label(a.role) || ' for ' || public.event_label(a.event_id));
  delete from public.schedule_assignments where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

-- ---- The people list (admins and main accounts) ---------------------------------------------------------------------

create or replace function public.people_add(p_first text, p_last text, p_ministries text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  f text := regexp_replace(btrim(coalesce(p_first, '')), '\s+', ' ', 'g');
  l text := regexp_replace(btrim(coalesce(p_last, '')), '\s+', ' ', 'g');
  pid uuid;
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can add people.'); end if;
  if char_length(f) not between 1 and 60 or char_length(l) > 60 then return jsonb_build_object('error', 'Enter a first and last name.'); end if;
  if not public.valid_ministries(coalesce(p_ministries, '{}')) then return jsonb_build_object('error', 'Those ministries aren''t valid.'); end if;
  begin
    insert into public.people (church_id, first_name, last_name, ministries) values (cid, f, l, coalesce(p_ministries, '{}')) returning id into pid;
  exception when unique_violation then
    return jsonb_build_object('error', 'Someone called ' || btrim(f || ' ' || l) || ' is already on your list.');
  end;
  perform public.log_schedule(cid, null, 'person_added', 'added ' || btrim(f || ' ' || l) || ' to the people list');
  return jsonb_build_object('ok', true, 'person_id', pid);
end
$$;

create or replace function public.people_update(p_id uuid, p_first text, p_last text, p_ministries text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  f text := regexp_replace(btrim(coalesce(p_first, '')), '\s+', ' ', 'g');
  l text := regexp_replace(btrim(coalesce(p_last, '')), '\s+', ' ', 'g');
  before text;
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can change people.'); end if;
  if char_length(f) not between 1 and 60 or char_length(l) > 60 then return jsonb_build_object('error', 'Enter a first and last name.'); end if;
  if not public.valid_ministries(coalesce(p_ministries, '{}')) then return jsonb_build_object('error', 'Those ministries aren''t valid.'); end if;
  before := public.person_label(p_id);
  if not exists (select 1 from public.people where id = p_id and church_id = cid) then return jsonb_build_object('error', 'That person isn''t on your list.'); end if;
  begin
    update public.people set first_name = f, last_name = l, ministries = coalesce(p_ministries, '{}') where id = p_id;
  exception when unique_violation then
    return jsonb_build_object('error', 'Someone called ' || btrim(f || ' ' || l) || ' is already on your list.');
  end;
  -- A person with an account keeps their account's details the same.
  update public.church_accounts ca set first_name = f, last_name = l, ministries = coalesce(p_ministries, '{}')
  from public.people p where p.id = p_id and p.user_id = ca.user_id;
  perform public.log_schedule(cid, null, 'person_changed', 'changed the details of ' || before || case when before <> btrim(f || ' ' || l) then ' (now ' || btrim(f || ' ' || l) || ')' else '' end);
  return jsonb_build_object('ok', true);
end
$$;

-- Takes a person off the list, and off every event. People with an account are removed from the church on the Team page instead.
create or replace function public.people_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  p public.people%rowtype;
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can remove people.'); end if;
  select * into p from public.people where id = p_id and church_id = cid;
  if not found then return jsonb_build_object('error', 'That person isn''t on your list.'); end if;
  if p.user_id is not null then return jsonb_build_object('error', 'That person has an account. Remove them from the church on the Team page.'); end if;
  perform public.log_schedule(cid, null, 'person_removed', 'removed ' || btrim(p.first_name || ' ' || p.last_name) || ' from the people list');
  delete from public.people where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

-- ---- Importing from Excel (the file is read in the browser; this takes the rows) ------------------------------------

-- Rows look like { date: "2026-10-25", title: "", time: "10:00", location: "", notes: "", assign: { keys: ["Maria Reyes"], "song-leader": [...] } }.
-- It only adds: events that exist are kept, and people already assigned are left as they are.
create or replace function public.schedule_import(p_rows jsonb, p_create_people boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  r jsonb;
  d date;
  t text;
  tm time;
  eid uuid;
  role_key text;
  nm jsonb;
  clean text;
  pid uuid;
  added integer;
  events_touched uuid[] := '{}';
  new_assignments integer := 0;
  new_people integer := 0;
  unknown text[] := '{}';
  bad_rows integer := 0;
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can import.'); end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 400 then return jsonb_build_object('error', 'That file has too many rows (up to 400).'); end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      d := (r ->> 'date')::date;
    exception when others then
      d := null;
    end;
    if d is null or d < current_date - 400 or d > current_date + 800 then bad_rows := bad_rows + 1; continue; end if;

    t := regexp_replace(btrim(coalesce(r ->> 'title', '')), '\s+', ' ', 'g');
    if t = '' then t := case when extract(dow from d) = 0 then 'Sunday service' else 'Event' end; end if;
    t := left(t, 80);
    tm := null;
    if coalesce(r ->> 'time', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then tm := (r ->> 'time')::time; end if;

    if extract(dow from d) = 0 and lower(t) = 'sunday service' then
      insert into public.schedule_events (church_id, kind, title, starts_on, starts_at, location, notes, created_by)
      values (cid, 'sunday', 'Sunday service', d, tm, left(btrim(coalesce(r ->> 'location', '')), 120), left(btrim(coalesce(r ->> 'notes', '')), 1000), (select auth.uid()))
      on conflict (church_id, starts_on) where kind = 'sunday' do nothing;
      select id into eid from public.schedule_events where church_id = cid and kind = 'sunday' and starts_on = d;
    else
      select id into eid from public.schedule_events where church_id = cid and kind = 'event' and starts_on = d and lower(title) = lower(t) limit 1;
      if eid is null then
        insert into public.schedule_events (church_id, kind, title, starts_on, starts_at, location, notes, created_by)
        values (cid, 'event', t, d, tm, left(btrim(coalesce(r ->> 'location', '')), 120), left(btrim(coalesce(r ->> 'notes', '')), 1000), (select auth.uid()))
        returning id into eid;
      end if;
    end if;
    if not (eid = any (events_touched)) then events_touched := events_touched || eid; end if;

    for role_key in select * from jsonb_object_keys(coalesce(r -> 'assign', '{}'::jsonb)) loop
      if not public.valid_schedule_role(role_key) then continue; end if;
      for nm in select * from jsonb_array_elements(coalesce(r -> 'assign' -> role_key, '[]'::jsonb)) loop
        clean := regexp_replace(btrim(coalesce(nm #>> '{}', '')), '\s+', ' ', 'g');
        if clean = '' or char_length(clean) > 120 then continue; end if;
        select id into pid from public.people where church_id = cid and lower(btrim(first_name || ' ' || last_name)) = lower(clean);
        if pid is null then
          if p_create_people then
            insert into public.people (church_id, first_name, last_name)
            values (cid, left(split_part(clean, ' ', 1), 60), left(btrim(substr(clean, char_length(split_part(clean, ' ', 1)) + 1)), 60))
            on conflict do nothing
            returning id into pid;
            if pid is not null then new_people := new_people + 1; end if;
          end if;
          if pid is null then
            if not (clean = any (unknown)) then unknown := unknown || clean; end if;
            continue;
          end if;
        end if;
        insert into public.schedule_assignments (church_id, event_id, person_id, role, created_by)
        values (cid, eid, pid, role_key, (select auth.uid()))
        on conflict (event_id, person_id, role) do nothing;
        get diagnostics added = row_count;
        new_assignments := new_assignments + added;
        pid := null;
      end loop;
    end loop;
  end loop;

  perform public.log_schedule(cid, null, 'imported', 'imported from Excel: ' || new_assignments || ' new assignments across ' || coalesce(array_length(events_touched, 1), 0) || ' events'
    || case when new_people > 0 then ', and added ' || new_people || ' people' else '' end);
  return jsonb_build_object('ok', true, 'events', coalesce(array_length(events_touched, 1), 0), 'assignments', new_assignments, 'created_people', new_people, 'unknown', to_jsonb(unknown), 'skipped_rows', bad_rows);
end
$$;

-- ---- A setlist's team -----------------------------------------------------------------------------------------------

-- Points a setlist at the event it is for. With no event given, it looks for the event on the setlist's service date
-- (the Sunday service, or the only event that day), and with p_create makes one if there is none.
create or replace function public.setlist_link_event(p_setlist uuid, p_event uuid default null, p_create boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  s public.setlists%rowtype;
  eid uuid := p_event;
begin
  select * into s from public.setlists where id = p_setlist and church_id = cid;
  if not found then return jsonb_build_object('error', 'That setlist isn''t there any more.'); end if;
  if eid is not null then
    if not exists (select 1 from public.schedule_events where id = eid and church_id = cid) then return jsonb_build_object('error', 'That event isn''t there any more.'); end if;
  elsif s.service_date is not null then
    select id into eid from public.schedule_events where church_id = cid and starts_on = s.service_date order by (kind = 'sunday') desc, created_at limit 1;
    if eid is null and p_create then
      if extract(dow from s.service_date) = 0 then
        insert into public.schedule_events (church_id, kind, title, starts_on, created_by) values (cid, 'sunday', 'Sunday service', s.service_date, (select auth.uid()))
        on conflict (church_id, starts_on) where kind = 'sunday' do nothing;
        select id into eid from public.schedule_events where church_id = cid and kind = 'sunday' and starts_on = s.service_date;
      else
        insert into public.schedule_events (church_id, kind, title, starts_on, created_by) values (cid, 'event', left(s.name, 80), s.service_date, (select auth.uid())) returning id into eid;
      end if;
    end if;
  elsif p_create then
    insert into public.schedule_events (church_id, kind, title, starts_on, created_by) values (cid, 'event', left(s.name, 80), current_date, (select auth.uid())) returning id into eid;
  end if;
  if eid is null then return jsonb_build_object('ok', true, 'event_id', null); end if;
  update public.setlists set event_id = eid where id = p_setlist;
  return jsonb_build_object('ok', true, 'event_id', eid);
end
$$;

-- ---- Joining: link to a person already on the schedule ---------------------------------------------------------------

drop function if exists public.decide_application(uuid, boolean);

-- Approve or decline an application. When approving, the main account can say the applicant is someone already on
-- the people list (p_person), and they take over that person and everything they are scheduled for. Otherwise a new person is made.
create or replace function public.decide_application(p_id uuid, p_approve boolean, p_person uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  app public.church_applications%rowtype;
begin
  select * into app from public.church_applications where id = p_id for update;
  if not found or not public.is_church_manager(app.church_id) then
    return jsonb_build_object('error', 'That application isn''t there any more.');
  end if;
  if app.status <> 'pending' then
    return jsonb_build_object('error', 'That application was already answered.');
  end if;

  if p_approve then
    if exists (select 1 from public.church_accounts where user_id = app.user_id) then
      update public.church_applications set status = 'declined', decided_at = now(), decided_by = uid where id = p_id;
      return jsonb_build_object('error', 'That person has already joined a church.');
    end if;
    if p_person is not null then
      if not exists (select 1 from public.people where id = p_person and church_id = app.church_id and user_id is null) then
        return jsonb_build_object('error', 'That person already has an account, or isn''t on your list.');
      end if;
      -- Linked first, so the account doesn't get a second person made for it.
      update public.people set user_id = app.user_id, ministries = case when cardinality(ministries) = 0 then app.ministries else ministries end where id = p_person;
    end if;
    insert into public.church_accounts (user_id, church_id, role, first_name, last_name, ministries)
    values (app.user_id, app.church_id, 'member', app.first_name, app.last_name, app.ministries);
  end if;

  update public.church_applications
  set status = case when p_approve then 'approved' else 'declined' end, decided_at = now(), decided_by = uid
  where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

-- Taking someone out of the church keeps their person (and what they were scheduled for), just without the account.
create or replace function public.remove_member(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.church_accounts%rowtype;
begin
  select * into target from public.church_accounts where user_id = p_user;
  if not found or not public.is_church_manager(target.church_id) then
    return jsonb_build_object('error', 'That person isn''t in your church.');
  end if;
  if target.role = 'church' then return jsonb_build_object('error', 'The church account can''t be removed.'); end if;
  update public.people set user_id = null where user_id = p_user;
  delete from public.church_accounts where user_id = p_user;
  return jsonb_build_object('ok', true);
end
$$;

-- Your own name and ministries, kept the same on the schedule's people list.
create or replace function public.update_my_profile(p_first text, p_last text, p_ministries text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f text := btrim(coalesce(p_first, ''));
  l text := btrim(coalesce(p_last, ''));
  mins text[];
begin
  if char_length(f) not between 1 and 60 or char_length(l) not between 1 and 60 then
    return jsonb_build_object('error', 'Enter your first and last name.');
  end if;
  if coalesce(cardinality(p_ministries), 0) = 0 or not public.valid_ministries(p_ministries) then
    return jsonb_build_object('error', 'Choose at least one ministry.');
  end if;
  mins := (select array_agg(distinct m order by m) from unnest(p_ministries) m);
  begin
    update public.people set first_name = f, last_name = l, ministries = mins where user_id = (select auth.uid());
  exception when unique_violation then
    return jsonb_build_object('error', 'Someone called ' || f || ' ' || l || ' is already on your church''s list.');
  end;
  update public.church_accounts set first_name = f, last_name = l, ministries = mins where user_id = (select auth.uid());
  if not found then return jsonb_build_object('error', 'This account isn''t in a church yet.'); end if;
  return jsonb_build_object('ok', true);
end
$$;

-- ---- Who may call what -----------------------------------------------------------------------------------------------

revoke all on function
  public.my_role(), public.can_manage_schedule(), public.actor_label(), public.person_label(uuid), public.event_label(uuid),
  public.log_schedule(uuid, uuid, text, text), public.schedule_ensure_sunday(date), public.schedule_add_event(text, date, text, text, text),
  public.schedule_update_event(uuid, text, date, text, text, text), public.schedule_delete_event(uuid), public.schedule_assign(uuid, uuid, text, text),
  public.schedule_unassign(uuid), public.people_add(text, text, text[]), public.people_update(uuid, text, text, text[]), public.people_delete(uuid),
  public.schedule_import(jsonb, boolean), public.setlist_link_event(uuid, uuid, boolean), public.decide_application(uuid, boolean, uuid),
  public.remove_member(uuid), public.update_my_profile(text, text, text[]), public.ensure_person()
  from public, anon;
grant execute on function
  public.my_role(), public.can_manage_schedule(), public.schedule_ensure_sunday(date), public.schedule_add_event(text, date, text, text, text),
  public.schedule_update_event(uuid, text, date, text, text, text), public.schedule_delete_event(uuid), public.schedule_assign(uuid, uuid, text, text),
  public.schedule_unassign(uuid), public.people_add(text, text, text[]), public.people_update(uuid, text, text, text[]), public.people_delete(uuid),
  public.schedule_import(jsonb, boolean), public.setlist_link_event(uuid, uuid, boolean), public.decide_application(uuid, boolean, uuid),
  public.remove_member(uuid), public.update_my_profile(text, text, text[])
  to authenticated;
