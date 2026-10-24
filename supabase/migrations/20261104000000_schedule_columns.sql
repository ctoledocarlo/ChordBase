-- ChordBase: schedule columns that each church shapes for itself.
--
-- Until now the schedule had one fixed set of roles. Every church now has its own columns:
--   * people columns  ("Drums", "Audio", "Dancers"): who serves. Several people can share one.
--   * choice columns  ("Type of Sunday", "Rev 5 team"): one value from a list the church writes.
--   * text columns    ("Sermon", "Theme"): anything typed.
-- A new church starts with a sensible set (vocals, band, sound booth); admins and main accounts add, rename, reorder and
-- hide columns whenever they like. Hiding keeps the history, so the numbers in the scheduler's panel stay right.
--
-- Choice and text values live on the event (schedule_events.fields, keyed by the column's key). Run 20261103000000 first.
-- Safe to run again.

-- ---- Columns -------------------------------------------------------------------------------------------------

create table if not exists public.schedule_columns (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  -- What assignments and event values refer to. Never changes, even if the label does.
  key        text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  label      text not null check (char_length(btrim(label)) between 1 and 40),
  kind       text not null default 'people' check (kind in ('people', 'choice', 'text')),
  -- The heading it sits under ("Sound booth", "Band").
  section    text not null default '' check (char_length(section) <= 40),
  options    text[] not null default '{}' check (cardinality(options) <= 40),
  -- For people columns: the ministries whose people are the likely ones.
  ministries text[] not null default '{}' check (public.valid_ministries(ministries)),
  -- Left out of a day's card until someone is put on it or it is asked for (backup singers).
  optional   boolean not null default false,
  position   integer not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (church_id, key)
);
create index if not exists schedule_columns_church_idx on public.schedule_columns (church_id, position);

alter table public.schedule_columns enable row level security;
drop policy if exists "church members can read their columns" on public.schedule_columns;
create policy "church members can read their columns" on public.schedule_columns for select to authenticated using (church_id in (select public.current_church_ids()));
revoke all on public.schedule_columns from anon, authenticated;
grant select on public.schedule_columns to authenticated;

alter table public.schedule_events add column if not exists fields jsonb not null default '{}'::jsonb;
alter table public.schedule_events drop constraint if exists schedule_events_fields_object;
alter table public.schedule_events add constraint schedule_events_fields_object check (jsonb_typeof(fields) = 'object');

-- Roles are the columns' keys now, so the fixed list no longer applies.
alter table public.schedule_assignments drop constraint if exists schedule_assignments_role_check;

-- ---- The starting set ---------------------------------------------------------------------------------------------

create or replace function public.column_slug(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(left(trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g')), 40), ''), 'column')
$$;

-- Vocals, band and sound booth, which most churches have. A church changes them freely afterwards.
create or replace function public.seed_schedule_columns(p_church uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.schedule_columns (church_id, key, label, kind, section, ministries, optional, position)
  select p_church, v.key, v.label, 'people', v.section, v.ministries, v.optional, v.position
  from (values
    ('song-leader',     'Song leader',      'Vocals',      array['stage:vocals']::text[],           false, 10),
    ('backup-singer',   'Backup singers',   'Vocals',      array['stage:vocals']::text[],           true,  20),
    ('keys',            'Keys',             'Band',        array['stage:keys']::text[],             false, 30),
    ('drums',           'Drums',            'Band',        array['stage:drums']::text[],            false, 40),
    ('bass',            'Bass',             'Band',        array['stage:bass']::text[],             false, 50),
    ('electric-guitar', 'Electric guitar',  'Band',        array['stage:electric-guitar']::text[],  false, 60),
    ('acoustic-guitar', 'Acoustic guitar',  'Band',        array['stage:acoustic-guitar']::text[],  false, 70),
    ('other',           'Other instrument', 'Band',        array['stage:other']::text[],            true,  80),
    ('audio',           'Audio',            'Sound booth', array['media']::text[],                  false, 90),
    ('projection',      'Projection',       'Sound booth', array['media']::text[],                  false, 100),
    ('camera',          'Camera',           'Sound booth', array['media']::text[],                  false, 110)
  ) as v(key, label, section, ministries, optional, position)
  on conflict (church_id, key) do nothing;
end
$$;

-- Churches that already exist get the set too, plus a column for anything already scheduled under an older role.
do $$
declare
  c record;
begin
  for c in select id from public.churches loop
    perform public.seed_schedule_columns(c.id);
  end loop;
end
$$;

insert into public.schedule_columns (church_id, key, label, kind, section, ministries, position)
select distinct a.church_id, a.role,
  case a.role when 'media' then 'Media' else initcap(replace(a.role, '-', ' ')) end,
  'people', case a.role when 'media' then 'Sound booth' else '' end,
  case a.role when 'media' then array['media']::text[] else '{}'::text[] end,
  200
from public.schedule_assignments a
where not exists (select 1 from public.schedule_columns k where k.church_id = a.church_id and k.key = a.role)
on conflict (church_id, key) do nothing;

create or replace function public.churches_seed_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_schedule_columns(new.id);
  return new;
end
$$;

drop trigger if exists churches_seed_columns on public.churches;
create trigger churches_seed_columns after insert on public.churches for each row execute function public.churches_seed_columns();

-- ---- Helpers ----------------------------------------------------------------------------------------------------

-- A column's label for the change log ("drums"), or its key when it has gone.
create or replace function public.schedule_role_label(p_church uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select lower(label) from public.schedule_columns where church_id = p_church and key = p_key), p_key)
$$;

-- Clean up a list of options: trimmed, no blanks or repeats (ignoring case), at most 40 of up to 40 characters.
create or replace function public.clean_options(p text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(o order by first_seen), '{}'::text[])
  from (
    select o, first_seen
    from (
      select distinct on (lower(o)) o, first_seen
      from (
        select left(regexp_replace(btrim(x), '\s+', ' ', 'g'), 40) as o, ord as first_seen
        from unnest(coalesce(p, '{}'::text[])) with ordinality as t(x, ord)
        where btrim(x) <> ''
      ) a
      order by lower(o), first_seen
    ) b
    order by first_seen
    limit 40
  ) c
$$;

-- ---- Changing columns (admins and main accounts) -----------------------------------------------------------------------

create or replace function public.schedule_column_add(p_label text, p_kind text, p_section text, p_options text[], p_ministries text[], p_optional boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  lbl text := regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  sec text := regexp_replace(btrim(coalesce(p_section, '')), '\s+', ' ', 'g');
  base text := public.column_slug(p_label);
  k text;
  n integer := 1;
  pos integer;
  new_id uuid;
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can change the columns.'); end if;
  if char_length(lbl) not between 1 and 40 then return jsonb_build_object('error', 'Give the column a name (up to 40 characters).'); end if;
  if char_length(sec) > 40 then return jsonb_build_object('error', 'Keep the heading short (up to 40 characters).'); end if;
  if p_kind not in ('people', 'choice', 'text') then return jsonb_build_object('error', 'Choose what the column holds.'); end if;
  if not public.valid_ministries(coalesce(p_ministries, '{}')) then return jsonb_build_object('error', 'Those ministries aren''t valid.'); end if;
  if exists (select 1 from public.schedule_columns where church_id = cid and not archived and lower(label) = lower(lbl)) then
    return jsonb_build_object('error', 'You already have a column called ' || lbl || '.');
  end if;
  if (select count(*) from public.schedule_columns where church_id = cid and not archived) >= 40 then
    return jsonb_build_object('error', 'That is a lot of columns. Hide one you don''t use first.');
  end if;
  k := base;
  while exists (select 1 from public.schedule_columns where church_id = cid and key = k) loop
    n := n + 1;
    k := left(base, 36) || '-' || n;
  end loop;
  select coalesce(max(position), 0) + 10 into pos from public.schedule_columns where church_id = cid;
  insert into public.schedule_columns (church_id, key, label, kind, section, options, ministries, optional, position)
  values (cid, k, lbl, p_kind, sec, case when p_kind = 'choice' then public.clean_options(p_options) else '{}' end,
    case when p_kind = 'people' then coalesce(p_ministries, '{}') else '{}' end, p_kind = 'people' and coalesce(p_optional, false), pos)
  returning id into new_id;
  perform public.log_schedule(cid, null, 'column_added', 'added the column “' || lbl || '”');
  return jsonb_build_object('ok', true, 'id', new_id, 'key', k);
end
$$;

create or replace function public.schedule_column_update(p_id uuid, p_label text, p_section text, p_options text[], p_ministries text[], p_optional boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  col public.schedule_columns%rowtype;
  lbl text := regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  sec text := regexp_replace(btrim(coalesce(p_section, '')), '\s+', ' ', 'g');
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can change the columns.'); end if;
  select * into col from public.schedule_columns where id = p_id and church_id = cid;
  if not found then return jsonb_build_object('error', 'That column isn''t there any more.'); end if;
  if char_length(lbl) not between 1 and 40 then return jsonb_build_object('error', 'Give the column a name (up to 40 characters).'); end if;
  if char_length(sec) > 40 then return jsonb_build_object('error', 'Keep the heading short (up to 40 characters).'); end if;
  if not public.valid_ministries(coalesce(p_ministries, '{}')) then return jsonb_build_object('error', 'Those ministries aren''t valid.'); end if;
  if exists (select 1 from public.schedule_columns where church_id = cid and not archived and id <> p_id and lower(label) = lower(lbl)) then
    return jsonb_build_object('error', 'You already have a column called ' || lbl || '.');
  end if;
  update public.schedule_columns
  set label = lbl, section = sec,
      options = case when col.kind = 'choice' then public.clean_options(p_options) else '{}' end,
      ministries = case when col.kind = 'people' then coalesce(p_ministries, '{}') else '{}' end,
      optional = col.kind = 'people' and coalesce(p_optional, false)
  where id = p_id;
  perform public.log_schedule(cid, null, 'column_changed', 'changed the column “' || lbl || '”' || case when col.label <> lbl then ' (was “' || col.label || '”)' else '' end);
  return jsonb_build_object('ok', true);
end
$$;

-- Moves a column one place earlier (-1) or later (1) among the columns under the same heading.
create or replace function public.schedule_column_move(p_id uuid, p_direction integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  col public.schedule_columns%rowtype;
  other public.schedule_columns%rowtype;
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can change the columns.'); end if;
  select * into col from public.schedule_columns where id = p_id and church_id = cid;
  if not found then return jsonb_build_object('error', 'That column isn''t there any more.'); end if;
  if p_direction < 0 then
    select * into other from public.schedule_columns where church_id = cid and not archived and section = col.section and (position, id) < (col.position, col.id) order by position desc, id desc limit 1;
  else
    select * into other from public.schedule_columns where church_id = cid and not archived and section = col.section and (position, id) > (col.position, col.id) order by position, id limit 1;
  end if;
  if not found then return jsonb_build_object('ok', true); end if;
  if other.position = col.position then
    update public.schedule_columns set position = position + case when p_direction < 0 then -1 else 1 end where id = col.id;
  else
    update public.schedule_columns set position = other.position where id = col.id;
    update public.schedule_columns set position = col.position where id = other.id;
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- Hides a column (or brings it back). Its history stays.
create or replace function public.schedule_column_archive(p_id uuid, p_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  col public.schedule_columns%rowtype;
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can change the columns.'); end if;
  select * into col from public.schedule_columns where id = p_id and church_id = cid;
  if not found then return jsonb_build_object('error', 'That column isn''t there any more.'); end if;
  if not p_archived and exists (select 1 from public.schedule_columns where church_id = cid and not archived and id <> p_id and lower(label) = lower(col.label)) then
    return jsonb_build_object('error', 'You already have another column called ' || col.label || '.');
  end if;
  update public.schedule_columns set archived = coalesce(p_archived, true) where id = p_id;
  perform public.log_schedule(cid, null, 'column_changed', case when coalesce(p_archived, true) then 'hid the column “' || col.label || '”' else 'brought back the column “' || col.label || '”' end);
  return jsonb_build_object('ok', true);
end
$$;

-- Several columns at once, from an Excel file. p_new is [{ ref, label, kind, section, options }]; the answer says which key each ref became.
-- With p_keep, columns that are not in that list and have never been used are hidden (the starter columns a file doesn't use).
create or replace function public.schedule_columns_apply(p_new jsonb, p_keep text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  c jsonb;
  made jsonb := '[]'::jsonb;
  lbl text;
  kind text;
  sec text;
  opts text[];
  base text;
  k text;
  n integer;
  pos integer;
  existing text;
  made_keys text[] := '{}';
  hidden integer := 0;
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can change the columns.'); end if;
  if p_new is not null and (jsonb_typeof(p_new) <> 'array' or jsonb_array_length(p_new) > 40) then return jsonb_build_object('error', 'That is too many new columns.'); end if;

  for c in select * from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) loop
    lbl := left(regexp_replace(btrim(coalesce(c ->> 'label', '')), '\s+', ' ', 'g'), 40);
    kind := coalesce(c ->> 'kind', 'people');
    sec := left(regexp_replace(btrim(coalesce(c ->> 'section', '')), '\s+', ' ', 'g'), 40);
    if lbl = '' or kind not in ('people', 'choice', 'text') then continue; end if;
    -- A column with that name already (maybe made a moment ago): use it.
    select key into existing from public.schedule_columns where church_id = cid and not archived and lower(label) = lower(lbl) limit 1;
    if existing is not null then
      made := made || jsonb_build_array(jsonb_build_object('ref', c ->> 'ref', 'key', existing));
      made_keys := made_keys || existing;
      existing := null;
      continue;
    end if;
    opts := '{}';
    if kind = 'choice' then
      select coalesce(array_agg(x), '{}') into opts from jsonb_array_elements_text(coalesce(c -> 'options', '[]'::jsonb)) x;
      opts := public.clean_options(opts);
    end if;
    base := public.column_slug(lbl);
    k := base;
    n := 1;
    while exists (select 1 from public.schedule_columns where church_id = cid and key = k) loop
      n := n + 1;
      k := left(base, 36) || '-' || n;
    end loop;
    select coalesce(max(position), 0) + 10 into pos from public.schedule_columns where church_id = cid;
    insert into public.schedule_columns (church_id, key, label, kind, section, options, position) values (cid, k, lbl, kind, sec, opts, pos);
    made := made || jsonb_build_array(jsonb_build_object('ref', c ->> 'ref', 'key', k));
    made_keys := made_keys || k;
    perform public.log_schedule(cid, null, 'column_added', 'added the column “' || lbl || '”');
  end loop;

  if p_keep is not null then
    with gone as (
      update public.schedule_columns k2 set archived = true
      where k2.church_id = cid and not k2.archived and not (k2.key = any (p_keep || made_keys))
        and not exists (select 1 from public.schedule_assignments a where a.church_id = cid and a.role = k2.key)
        and not exists (select 1 from public.schedule_events e where e.church_id = cid and e.fields ? k2.key)
      returning 1
    )
    select count(*) into hidden from gone;
    if hidden > 0 then perform public.log_schedule(cid, null, 'column_changed', 'hid ' || hidden || ' unused starter columns'); end if;
  end if;
  return jsonb_build_object('ok', true, 'created', made, 'hidden', hidden);
end
$$;

-- ---- Values on an event (choice and text columns) -----------------------------------------------------------------------

-- Anyone in the church can set a value, like putting someone on a role. An empty value clears it.
create or replace function public.schedule_set_field(p_event uuid, p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  col public.schedule_columns%rowtype;
  v text := left(regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g'), 200);
  before text;
begin
  if cid is null then return jsonb_build_object('error', 'Join a church first.'); end if;
  if not exists (select 1 from public.schedule_events where id = p_event and church_id = cid) then return jsonb_build_object('error', 'That event isn''t there any more.'); end if;
  select * into col from public.schedule_columns where church_id = cid and key = p_key and not archived and kind in ('choice', 'text');
  if not found then return jsonb_build_object('error', 'That column isn''t there any more.'); end if;
  if col.kind = 'choice' and v <> '' and not (v = any (col.options)) then return jsonb_build_object('error', 'Choose one of the options.'); end if;
  select fields ->> p_key into before from public.schedule_events where id = p_event;
  if coalesce(before, '') = v then return jsonb_build_object('ok', true, 'already', true); end if;
  update public.schedule_events
  set fields = case when v = '' then fields - p_key else fields || jsonb_build_object(p_key, v) end, updated_at = now()
  where id = p_event;
  perform public.log_schedule(cid, p_event, 'field_changed',
    case when v = '' then 'cleared ' || lower(col.label) else 'set ' || lower(col.label) || ' to ' || v end || ' for ' || public.event_label(p_event));
  return jsonb_build_object('ok', true);
end
$$;

-- ---- Putting people on a column ---------------------------------------------------------------------------------------

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
  if not exists (select 1 from public.schedule_columns where church_id = cid and key = p_role and kind = 'people' and not archived) then return jsonb_build_object('error', 'Choose a role.'); end if;
  if char_length(coalesce(p_note, '')) > 200 then return jsonb_build_object('error', 'Keep the note short.'); end if;

  insert into public.schedule_assignments (church_id, event_id, person_id, role, note, created_by)
  values (cid, p_event, p_person, p_role, btrim(coalesce(p_note, '')), (select auth.uid()))
  on conflict (event_id, person_id, role) do nothing;
  get diagnostics added = row_count;
  if added = 0 then return jsonb_build_object('ok', true, 'already', true); end if;
  perform public.log_schedule(cid, p_event, 'assigned', 'put ' || public.person_label(p_person) || ' on ' || public.schedule_role_label(cid, p_role) || ' for ' || public.event_label(p_event));
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
  perform public.log_schedule(cid, a.event_id, 'unassigned', 'took ' || public.person_label(a.person_id) || ' off ' || public.schedule_role_label(cid, a.role) || ' for ' || public.event_label(a.event_id));
  delete from public.schedule_assignments where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

drop function if exists public.schedule_role_label(text);

-- ---- Importing: rows now carry values for choice and text columns too ------------------------------------------------------
-- Rows look like { date, title, time, location, notes, assign: { drums: ["Maria Reyes"] }, fields: { sunday-type: "Communion" } }.
-- A choice value that is not an option yet is added to the column's options.

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
  fv text;
  canon text;
  col public.schedule_columns%rowtype;
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
    if d is null or d < current_date - 800 or d > current_date + 800 then bad_rows := bad_rows + 1; continue; end if;

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

    -- Choice and text values: only filled in where the event has none yet.
    if jsonb_typeof(r -> 'fields') = 'object' then
      for role_key in select * from jsonb_object_keys(r -> 'fields') loop
        select * into col from public.schedule_columns where church_id = cid and key = role_key and not archived and kind in ('choice', 'text');
        if not found then continue; end if;
        fv := left(regexp_replace(btrim(coalesce(r -> 'fields' ->> role_key, '')), '\s+', ' ', 'g'), case when col.kind = 'choice' then 40 else 200 end);
        if fv = '' then continue; end if;
        if col.kind = 'choice' then
          -- "Israel sunday" is the option "Israel Sunday"; anything new becomes an option.
          select o into canon from unnest(col.options) o where lower(o) = lower(fv) limit 1;
          if canon is not null then
            fv := canon;
          else
            if cardinality(col.options) >= 40 then continue; end if;
            update public.schedule_columns set options = options || fv where id = col.id;
          end if;
        end if;
        update public.schedule_events set fields = fields || jsonb_build_object(role_key, fv), updated_at = now() where id = eid and not (fields ? role_key);
      end loop;
    end if;

    for role_key in select * from jsonb_object_keys(coalesce(r -> 'assign', '{}'::jsonb)) loop
      if not exists (select 1 from public.schedule_columns where church_id = cid and key = role_key and kind = 'people' and not archived) then continue; end if;
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

-- ---- Who may call what ------------------------------------------------------------------------------------------------------

revoke all on function
  public.column_slug(text), public.seed_schedule_columns(uuid), public.churches_seed_columns(), public.schedule_role_label(uuid, text), public.clean_options(text[]),
  public.schedule_column_add(text, text, text, text[], text[], boolean), public.schedule_column_update(uuid, text, text, text[], text[], boolean),
  public.schedule_column_move(uuid, integer), public.schedule_column_archive(uuid, boolean), public.schedule_columns_apply(jsonb, text[]),
  public.schedule_set_field(uuid, text, text), public.schedule_assign(uuid, uuid, text, text), public.schedule_unassign(uuid), public.schedule_import(jsonb, boolean)
  from public, anon;
grant execute on function
  public.schedule_column_add(text, text, text, text[], text[], boolean), public.schedule_column_update(uuid, text, text, text[], text[], boolean),
  public.schedule_column_move(uuid, integer), public.schedule_column_archive(uuid, boolean), public.schedule_columns_apply(jsonb, text[]),
  public.schedule_set_field(uuid, text, text), public.schedule_assign(uuid, uuid, text, text), public.schedule_unassign(uuid), public.schedule_import(jsonb, boolean)
  to authenticated;
