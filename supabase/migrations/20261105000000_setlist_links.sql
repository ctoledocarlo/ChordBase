-- ChordBase: linking setlists to the schedule, from either side.
--
-- A setlist can point at the service or event it is for (setlists.event_id, added with the schedule). Until now it could
-- only find the one on its own date. Now it can be linked to any event, from the setlist page or from the schedule,
-- unlinked again, and each change is written to the schedule's change log. A setlist with no date takes the event's date.
-- Run 20261103000000 and 20261104000000 first. Safe to run again.

-- Points a setlist at an event. With no event given, it looks for the event on the setlist's service date (the Sunday
-- service, or the first event that day), and with p_create makes one if there is none.
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
  if s.event_id is distinct from eid then
    update public.setlists set event_id = eid, service_date = coalesce(service_date, ev.starts_on) where id = p_setlist;
    perform public.log_schedule(cid, eid, 'setlist_linked', 'linked the setlist “' || left(s.name, 80) || '” to ' || public.event_label(eid));
  end if;
  return jsonb_build_object('ok', true, 'event_id', eid);
end
$$;

-- Takes a setlist off the event it was linked to. The setlist and the event both stay.
create or replace function public.setlist_unlink_event(p_setlist uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  s public.setlists%rowtype;
begin
  select * into s from public.setlists where id = p_setlist and church_id = cid;
  if not found then return jsonb_build_object('error', 'That setlist isn''t there any more.'); end if;
  if s.event_id is null then return jsonb_build_object('ok', true, 'already', true); end if;
  perform public.log_schedule(cid, s.event_id, 'setlist_unlinked', 'unlinked the setlist “' || left(s.name, 80) || '” from ' || coalesce(public.event_label(s.event_id), 'its event'));
  update public.setlists set event_id = null where id = p_setlist;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.setlist_link_event(uuid, uuid, boolean), public.setlist_unlink_event(uuid) from public, anon;
grant execute on function public.setlist_link_event(uuid, uuid, boolean), public.setlist_unlink_event(uuid) to authenticated;
