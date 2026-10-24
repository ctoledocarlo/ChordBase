-- ChordBase: media roles, and one setlist for a service.
--
--   * Media is no longer one "no specific roles" ministry. Its roles are Audio, Sound booth and Camera, so the roster can
--     show who can do what. Everyone who was just "Media" is given all three (they can be narrowed on the people list).
--   * A service or event has one setlist. Linking another one replaces the setlist that was there.
--   * Putting someone on a column now says which assignment it made, so the page can show it at once and take it off
--     again without reloading.
-- Run 20261104000000, 20261105000000 and 20261106000000 first. Safe to run again.

-- ---- Ministries ---------------------------------------------------------------------------------------------------------

create or replace function public.valid_ministries(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
    and cardinality(p) <= 10
    and p <@ array['stage:drums', 'stage:keys', 'stage:acoustic-guitar', 'stage:electric-guitar', 'stage:bass', 'stage:vocals', 'stage:other',
                   'media:audio', 'media:sound-booth', 'media:camera', 'media']::text[]
$$;

-- "Media" with no specific roles becomes all three roles.
create or replace function public.expand_media(p text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when 'media' = any (p) then (select array_agg(distinct m order by m) from unnest(array_remove(p, 'media') || array['media:audio', 'media:sound-booth', 'media:camera']::text[]) m)
    else p end
$$;

update public.people set ministries = public.expand_media(ministries) where 'media' = any (ministries);
update public.church_accounts set ministries = public.expand_media(ministries) where 'media' = any (ministries);
update public.church_applications set ministries = public.expand_media(ministries) where 'media' = any (ministries);

-- The starter columns suggest the people who can do them.
update public.schedule_columns set ministries = array['media:audio']::text[] where key = 'audio' and ministries = array['media']::text[];
update public.schedule_columns set ministries = array['media:sound-booth']::text[] where key = 'projection' and ministries = array['media']::text[];
update public.schedule_columns set ministries = array['media:camera']::text[] where key = 'camera' and ministries = array['media']::text[];
update public.schedule_columns set ministries = public.expand_media(ministries) where 'media' = any (ministries);

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
    ('audio',           'Audio',            'Sound booth', array['media:audio']::text[],            false, 90),
    ('projection',      'Projection',       'Sound booth', array['media:sound-booth']::text[],      false, 100),
    ('camera',          'Camera',           'Sound booth', array['media:camera']::text[],           false, 110)
  ) as v(key, label, section, ministries, optional, position)
  on conflict (church_id, key) do nothing;
end
$$;

-- ---- One setlist for a service ------------------------------------------------------------------------------------------

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
  ev public.schedule_events%rowtype;
  replaced text;
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

  select * into ev from public.schedule_events where id = eid;
  -- One setlist to a service: whichever was linked to it before is unlinked.
  select string_agg('“' || left(name, 80) || '”', ', ') into replaced from public.setlists where church_id = cid and event_id = eid and id <> p_setlist;
  update public.setlists set event_id = null where church_id = cid and event_id = eid and id <> p_setlist;
  if s.event_id is distinct from eid then
    update public.setlists set event_id = eid, service_date = coalesce(service_date, ev.starts_on) where id = p_setlist;
    perform public.log_schedule(cid, eid, 'setlist_linked', 'linked the setlist “' || left(s.name, 80) || '” to ' || public.event_label(eid)
      || case when replaced is not null then ', replacing ' || replaced else '' end);
  end if;
  return jsonb_build_object('ok', true, 'event_id', eid);
end
$$;

-- ---- Putting people on: the answer carries the new assignment's id --------------------------------------------------------

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
  new_id uuid;
  existing uuid;
begin
  if cid is null then return jsonb_build_object('error', 'Join a church first.'); end if;
  if not exists (select 1 from public.schedule_events where id = p_event and church_id = cid) then return jsonb_build_object('error', 'That event isn''t there any more.'); end if;
  if not exists (select 1 from public.people where id = p_person and church_id = cid) then return jsonb_build_object('error', 'That person isn''t on your list.'); end if;
  if not exists (select 1 from public.schedule_columns where church_id = cid and key = p_role and kind = 'people' and not archived) then return jsonb_build_object('error', 'Choose a role.'); end if;
  if char_length(coalesce(p_note, '')) > 200 then return jsonb_build_object('error', 'Keep the note short.'); end if;

  select id into existing from public.schedule_assignments where event_id = p_event and person_id = p_person and role = p_role;
  if existing is not null then return jsonb_build_object('ok', true, 'already', true, 'id', existing); end if;

  select public.schedule_role_label(cid, a.role) into elsewhere from public.schedule_assignments a where a.event_id = p_event and a.person_id = p_person limit 1;
  if elsewhere is not null then
    return jsonb_build_object('error', public.person_label(p_person) || ' is already on ' || elsewhere || ' that day. Take them off first.');
  end if;

  select string_agg(public.person_label(a.person_id), ' and ') into replaced from public.schedule_assignments a where a.event_id = p_event and a.role = p_role;
  delete from public.schedule_assignments where event_id = p_event and role = p_role;

  insert into public.schedule_assignments (church_id, event_id, person_id, role, note, created_by)
  values (cid, p_event, p_person, p_role, btrim(coalesce(p_note, '')), (select auth.uid()))
  returning id into new_id;
  perform public.log_schedule(cid, p_event, 'assigned',
    'put ' || public.person_label(p_person) || ' on ' || public.schedule_role_label(cid, p_role) || ' for ' || public.event_label(p_event)
    || case when replaced is not null then ', replacing ' || replaced else '' end);
  return jsonb_build_object('ok', true, 'replaced', replaced is not null, 'id', new_id);
end
$$;

revoke all on function public.expand_media(text[]), public.seed_schedule_columns(uuid), public.setlist_link_event(uuid, uuid, boolean), public.schedule_assign(uuid, uuid, text, text) from public, anon;
grant execute on function public.setlist_link_event(uuid, uuid, boolean), public.schedule_assign(uuid, uuid, text, text) to authenticated;
