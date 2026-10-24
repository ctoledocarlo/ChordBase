-- ChordBase: one person per column, and no one in two columns at once.
--
--   * Backup singers are gone from the starter columns, and the column is hidden for churches that have it (what was
--     scheduled stays, and it can be brought back under Columns).
--   * A column holds one person on a day. Putting someone else on it replaces whoever was there.
--   * A person can be on only one column at a day's service. Asking for a second is refused, with a message naming
--     where they already are.
--   * An import follows the same rules: the first name in a cell, only where the column is empty, and not for a person
--     who is already on that day somewhere else.
-- What is already scheduled is not touched. Run 20261103000000 and 20261104000000 first. Safe to run again.

-- ---- Starter columns without backup singers -----------------------------------------------------------------------------

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

update public.schedule_columns set archived = true where key = 'backup-singer' and not archived;

-- ---- Putting people on -------------------------------------------------------------------------------------------------

create or replace function public.schedule_assign(p_event uuid, p_person uuid, p_role text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  elsewhere text;
  replaced text;
begin
  if cid is null then return jsonb_build_object('error', 'Join a church first.'); end if;
  if not exists (select 1 from public.schedule_events where id = p_event and church_id = cid) then return jsonb_build_object('error', 'That event isn''t there any more.'); end if;
  if not exists (select 1 from public.people where id = p_person and church_id = cid) then return jsonb_build_object('error', 'That person isn''t on your list.'); end if;
  if not exists (select 1 from public.schedule_columns where church_id = cid and key = p_role and kind = 'people' and not archived) then return jsonb_build_object('error', 'Choose a role.'); end if;
  if char_length(coalesce(p_note, '')) > 200 then return jsonb_build_object('error', 'Keep the note short.'); end if;

  -- Already on this very column: nothing to do.
  if exists (select 1 from public.schedule_assignments where event_id = p_event and person_id = p_person and role = p_role) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- One column at a time.
  select public.schedule_role_label(cid, a.role) into elsewhere from public.schedule_assignments a where a.event_id = p_event and a.person_id = p_person limit 1;
  if elsewhere is not null then
    return jsonb_build_object('error', public.person_label(p_person) || ' is already on ' || elsewhere || ' that day. Take them off first.');
  end if;

  -- One person per column: whoever was there is replaced.
  select string_agg(public.person_label(a.person_id), ' and ') into replaced from public.schedule_assignments a where a.event_id = p_event and a.role = p_role;
  delete from public.schedule_assignments where event_id = p_event and role = p_role;

  insert into public.schedule_assignments (church_id, event_id, person_id, role, note, created_by)
  values (cid, p_event, p_person, p_role, btrim(coalesce(p_note, '')), (select auth.uid()));
  perform public.log_schedule(cid, p_event, 'assigned',
    'put ' || public.person_label(p_person) || ' on ' || public.schedule_role_label(cid, p_role) || ' for ' || public.event_label(p_event)
    || case when replaced is not null then ', replacing ' || replaced else '' end);
  return jsonb_build_object('ok', true, 'replaced', replaced is not null);
end
$$;

-- ---- Importing: first name in a cell, empty columns only, no one in two columns ---------------------------------------------

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
  fv text;
  canon text;
  col public.schedule_columns%rowtype;
  events_touched uuid[] := '{}';
  new_assignments integer := 0;
  new_people integer := 0;
  unknown text[] := '{}';
  bad_rows integer := 0;
  conflicts integer := 0;
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
      -- One person per column, and an import only adds: a column that has someone is left alone.
      if exists (select 1 from public.schedule_assignments where event_id = eid and role = role_key) then continue; end if;
      -- Only the first name in the cell.
      select x into nm from jsonb_array_elements(coalesce(r -> 'assign' -> role_key, '[]'::jsonb)) x limit 1;
      if nm is null then continue; end if;
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
      -- Already on that day somewhere else: left off.
      if exists (select 1 from public.schedule_assignments where event_id = eid and person_id = pid) then
        conflicts := conflicts + 1;
        pid := null;
        continue;
      end if;
      insert into public.schedule_assignments (church_id, event_id, person_id, role, created_by) values (cid, eid, pid, role_key, (select auth.uid()));
      new_assignments := new_assignments + 1;
      pid := null;
    end loop;
  end loop;

  perform public.log_schedule(cid, null, 'imported', 'imported from Excel: ' || new_assignments || ' new assignments across ' || coalesce(array_length(events_touched, 1), 0) || ' events'
    || case when new_people > 0 then ', and added ' || new_people || ' people' else '' end);
  return jsonb_build_object('ok', true, 'events', coalesce(array_length(events_touched, 1), 0), 'assignments', new_assignments, 'created_people', new_people, 'unknown', to_jsonb(unknown), 'skipped_rows', bad_rows, 'conflicts', conflicts);
end
$$;

revoke all on function public.seed_schedule_columns(uuid), public.schedule_assign(uuid, uuid, text, text), public.schedule_import(jsonb, boolean) from public, anon;
grant execute on function public.schedule_assign(uuid, uuid, text, text), public.schedule_import(jsonb, boolean) to authenticated;
