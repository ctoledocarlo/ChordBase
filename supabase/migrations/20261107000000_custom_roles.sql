-- ChordBase: roles that are the church's own, and can be deleted.
--
--   * "Other instrument" is no longer a starter column. A church adds the roles it really has (a saxophone, a
--     choir, a second camera) with "+ Add a role" on the schedule, under any heading it likes.
--   * A column can now be deleted for good (hiding is still there and keeps the history). Deleting takes off everyone who
--     was put on it and clears its values. Where the church never used "Other instrument", it is removed.
-- Run 20261104000000 and 20261106000000 first. Safe to run again.

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
    ('audio',           'Audio',            'Sound booth', array['media']::text[],                  false, 90),
    ('projection',      'Projection',       'Sound booth', array['media']::text[],                  false, 100),
    ('camera',          'Camera',           'Sound booth', array['media']::text[],                  false, 110)
  ) as v(key, label, section, ministries, optional, position)
  on conflict (church_id, key) do nothing;
end
$$;

-- Churches that never used "Other instrument" (nor the backup singers) lose the column.
delete from public.schedule_columns c
where c.key in ('other', 'backup-singer')
  and not exists (select 1 from public.schedule_assignments a where a.church_id = c.church_id and a.role = c.key)
  and not exists (select 1 from public.schedule_events e where e.church_id = c.church_id and e.fields ? c.key);

-- Deletes a column for good: whoever was put on it, and what was typed or chosen in it.
create or replace function public.schedule_column_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.my_church_id();
  col public.schedule_columns%rowtype;
  removed integer;
begin
  if not public.can_manage_schedule() then return jsonb_build_object('error', 'Only admins and the church''s main accounts can change the columns.'); end if;
  select * into col from public.schedule_columns where id = p_id and church_id = cid;
  if not found then return jsonb_build_object('error', 'That column isn''t there any more.'); end if;
  delete from public.schedule_assignments where church_id = cid and role = col.key;
  get diagnostics removed = row_count;
  update public.schedule_events set fields = fields - col.key where church_id = cid and fields ? col.key;
  delete from public.schedule_columns where id = p_id;
  perform public.log_schedule(cid, null, 'column_removed', 'deleted the column “' || col.label || '”' || case when removed > 0 then ' and ' || removed || ' ' || case when removed = 1 then 'assignment' else 'assignments' end else '' end);
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.seed_schedule_columns(uuid), public.schedule_column_delete(uuid) from public, anon;
grant execute on function public.schedule_column_delete(uuid) to authenticated;
