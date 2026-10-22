-- ChordBase: people apply to join a church.
--
--   Church (main)  ->  Admins  ->  Individual accounts
--
-- A new account has no church. It finds one, applies with a first and last name and the ministries it serves
-- in, and the church's own account approves or declines. Once in, a person can change their ministries any
-- time. The church account can make someone an admin, make an admin an individual again, or remove them.
-- What each role is allowed to do beyond that is still to be decided.
--
-- Everything that changes who belongs to what goes through the functions below, which check who is asking.
-- The tables themselves can only be read. Safe to run again.

-- ---- Ministries -----------------------------------------------------------------------------------------

-- The ministries a person can serve in: Stage (with the instrument) or Media (no specific roles). A person can have several.
create or replace function public.valid_ministries(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
    and cardinality(p) <= 8
    and p <@ array['stage:drums', 'stage:keys', 'stage:acoustic-guitar', 'stage:electric-guitar', 'stage:bass', 'stage:vocals', 'stage:other', 'media']::text[]
$$;

-- ---- Who is what, within a church -----------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'church_accounts' and column_name = 'role') then
    alter table public.church_accounts
      add column role       text   not null default 'member' check (role in ('church', 'admin', 'member')),
      add column first_name text   not null default '' check (char_length(first_name) <= 60),
      add column last_name  text   not null default '' check (char_length(last_name) <= 60),
      add column ministries text[] not null default '{}' check (public.valid_ministries(ministries));
    -- The logins that exist before this update are the churches' own.
    update public.church_accounts set role = 'church';
  end if;
end
$$;

-- Whether the signed-in login is the main (church) account of this church.
create or replace function public.is_church_manager(p_church uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_accounts
    where user_id = (select auth.uid()) and church_id = p_church and role = 'church'
  )
$$;

revoke all on function public.is_church_manager(uuid) from public, anon;
grant execute on function public.is_church_manager(uuid) to authenticated;

-- ---- Applications ---------------------------------------------------------------------------------------

create table if not exists public.church_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  church_id   uuid not null references public.churches (id) on delete cascade,
  first_name  text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name   text not null check (char_length(btrim(last_name)) between 1 and 60),
  ministries  text[] not null check (cardinality(ministries) >= 1 and public.valid_ministries(ministries)),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references auth.users (id) on delete set null
);

-- One waiting application per person; they cancel it before applying somewhere else.
create unique index if not exists church_applications_one_pending on public.church_applications (user_id) where status = 'pending';
create index if not exists church_applications_user_idx on public.church_applications (user_id, created_at desc);
create index if not exists church_applications_church_idx on public.church_applications (church_id, status);
create index if not exists church_applications_decided_by_idx on public.church_applications (decided_by);

alter table public.church_applications enable row level security;

drop policy if exists "people can read their own applications, churches theirs" on public.church_applications;
create policy "people can read their own applications, churches theirs"
  on public.church_applications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_church_manager(church_id));

revoke all on public.church_applications from anon, authenticated;
grant select on public.church_applications to authenticated;

-- ---- Finding a church and applying ----------------------------------------------------------------------

-- Churches whose name contains the text (at least two letters), a few at a time. Only names are shown, and only to signed-in people.
create or replace function public.search_churches(p_q text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name
  from public.churches c
  where (select auth.uid()) is not null
    and char_length(btrim(coalesce(p_q, ''))) >= 2
    and c.name ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by c.name
  limit 8
$$;

create or replace function public.apply_to_church(p_church uuid, p_first text, p_last text, p_ministries text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  f text := btrim(coalesce(p_first, ''));
  l text := btrim(coalesce(p_last, ''));
begin
  if uid is null then return jsonb_build_object('error', 'Sign in first.'); end if;
  if exists (select 1 from public.church_accounts where user_id = uid) then
    return jsonb_build_object('error', 'This account already belongs to a church.');
  end if;
  if char_length(f) not between 1 and 60 or char_length(l) not between 1 and 60 then
    return jsonb_build_object('error', 'Enter your first and last name.');
  end if;
  if coalesce(cardinality(p_ministries), 0) = 0 or not public.valid_ministries(p_ministries) then
    return jsonb_build_object('error', 'Choose at least one ministry.');
  end if;
  if not exists (select 1 from public.churches where id = p_church) then
    return jsonb_build_object('error', 'That church wasn''t found.');
  end if;
  if exists (select 1 from public.church_applications where user_id = uid and status = 'pending') then
    return jsonb_build_object('error', 'You already have an application waiting. Cancel it first to apply somewhere else.');
  end if;

  insert into public.church_applications (user_id, church_id, first_name, last_name, ministries)
  values (uid, p_church, f, l, (select array_agg(distinct m order by m) from unnest(p_ministries) m));
  return jsonb_build_object('ok', true);
end
$$;

-- The latest application of the signed-in person (waiting or declined), with the church's name; null if none.
create or replace function public.my_application()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(x)
  from (
    select a.id, a.status, a.church_id, c.name as church_name, a.first_name, a.last_name, a.ministries, a.created_at
    from public.church_applications a
    join public.churches c on c.id = a.church_id
    where a.user_id = (select auth.uid())
    order by a.created_at desc
    limit 1
  ) x
$$;

create or replace function public.cancel_application()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.church_applications where user_id = (select auth.uid()) and status = 'pending'
$$;

-- ---- The church account: requests and members ------------------------------------------------------------

create or replace function public.church_requests()
returns table (id uuid, user_id uuid, email text, first_name text, last_name text, ministries text[], created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.user_id, u.email::text, a.first_name, a.last_name, a.ministries, a.created_at
  from public.church_applications a
  join auth.users u on u.id = a.user_id
  where a.status = 'pending' and public.is_church_manager(a.church_id)
  order by a.created_at
$$;

create or replace function public.church_members()
returns table (user_id uuid, email text, first_name text, last_name text, ministries text[], role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select ca.user_id, u.email::text, ca.first_name, ca.last_name, ca.ministries, ca.role, ca.created_at
  from public.church_accounts ca
  join auth.users u on u.id = ca.user_id
  where public.is_church_manager(ca.church_id)
  order by case ca.role when 'church' then 0 when 'admin' then 1 else 2 end, lower(ca.last_name), lower(ca.first_name), u.email
$$;

-- Approve or decline an application. Only the church account of that church may.
create or replace function public.decide_application(p_id uuid, p_approve boolean)
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
    insert into public.church_accounts (user_id, church_id, role, first_name, last_name, ministries)
    values (app.user_id, app.church_id, 'member', app.first_name, app.last_name, app.ministries);
  end if;

  update public.church_applications
  set status = case when p_approve then 'approved' else 'declined' end, decided_at = now(), decided_by = uid
  where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

-- Make a person an admin, or an individual account again. Only the church account may, and never for itself.
create or replace function public.set_member_role(p_user uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.church_accounts%rowtype;
begin
  if p_role not in ('admin', 'member') then return jsonb_build_object('error', 'Choose admin or individual account.'); end if;
  select * into target from public.church_accounts where user_id = p_user;
  if not found or not public.is_church_manager(target.church_id) then
    return jsonb_build_object('error', 'That person isn''t in your church.');
  end if;
  if target.role = 'church' then return jsonb_build_object('error', 'The church account''s role can''t be changed.'); end if;
  update public.church_accounts set role = p_role where user_id = p_user;
  return jsonb_build_object('ok', true);
end
$$;

-- Take a person out of the church. They lose access straight away and can apply again.
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
  delete from public.church_accounts where user_id = p_user;
  return jsonb_build_object('ok', true);
end
$$;

-- ---- A person's own details ------------------------------------------------------------------------------

-- Change your own name and ministries, any time. (Your role is not something you can change.)
create or replace function public.update_my_profile(p_first text, p_last text, p_ministries text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f text := btrim(coalesce(p_first, ''));
  l text := btrim(coalesce(p_last, ''));
begin
  if char_length(f) not between 1 and 60 or char_length(l) not between 1 and 60 then
    return jsonb_build_object('error', 'Enter your first and last name.');
  end if;
  if coalesce(cardinality(p_ministries), 0) = 0 or not public.valid_ministries(p_ministries) then
    return jsonb_build_object('error', 'Choose at least one ministry.');
  end if;
  update public.church_accounts
  set first_name = f, last_name = l, ministries = (select array_agg(distinct m order by m) from unnest(p_ministries) m)
  where user_id = (select auth.uid());
  if not found then return jsonb_build_object('error', 'This account isn''t in a church yet.'); end if;
  return jsonb_build_object('ok', true);
end
$$;

-- Only signed-in people may call any of these.
revoke all on function
  public.search_churches(text), public.apply_to_church(uuid, text, text, text[]), public.my_application(), public.cancel_application(),
  public.church_requests(), public.church_members(), public.decide_application(uuid, boolean),
  public.set_member_role(uuid, text), public.remove_member(uuid), public.update_my_profile(text, text, text[])
  from public, anon;
grant execute on function
  public.search_churches(text), public.apply_to_church(uuid, text, text, text[]), public.my_application(), public.cancel_application(),
  public.church_requests(), public.church_members(), public.decide_application(uuid, boolean),
  public.set_member_role(uuid, text), public.remove_member(uuid), public.update_my_profile(text, text, text[])
  to authenticated;
