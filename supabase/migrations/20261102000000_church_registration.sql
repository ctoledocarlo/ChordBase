-- ChordBase: registering a church, and the limit of two main accounts.
--
-- Two kinds of account sign up:
--   * a CHURCH registers itself: this makes the church and its first main account (role "church");
--   * an INDIVIDUAL signs up and then applies to a church (see 20261101000000_memberships.sql).
--
-- A church normally has up to two main accounts. The first is the one that registered it; a main account can
-- make a second from an admin or individual account. The limit is checked here, in the functions the app uses,
-- so that someone with the database in front of them can still make an exception.
-- Run 20261101000000_memberships.sql first. Safe to run again.

-- Two churches can't share a name (ignoring case and spacing), so nobody can register as a church that exists already.
create unique index if not exists churches_name_unique on public.churches (lower(btrim(name)));

-- Makes a church and makes the signed-in person its first main account.
create or replace function public.register_church(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  base text;
  candidate text;
  i integer := 1;
  cid uuid;
begin
  if uid is null then return jsonb_build_object('error', 'Sign in first.'); end if;
  if char_length(n) not between 2 and 80 then
    return jsonb_build_object('error', 'Give your church a name (2 to 80 characters).');
  end if;
  if exists (select 1 from public.church_accounts where user_id = uid) then
    return jsonb_build_object('error', 'This account already belongs to a church.');
  end if;
  if exists (select 1 from public.churches where lower(btrim(name)) = lower(n)) then
    return jsonb_build_object('error', 'A church called “' || n || '” is already on ChordBase. If it is yours, apply to join it instead and ask its main account to let you in.');
  end if;

  -- A waiting application to another church is withdrawn: this account is starting a church of its own.
  delete from public.church_applications where user_id = uid and status = 'pending';

  base := trim(both '-' from lower(regexp_replace(n, '[^a-zA-Z0-9]+', '-', 'g')));
  if base = '' then base := 'church'; end if;
  candidate := base;
  while exists (select 1 from public.churches where slug = candidate) loop
    i := i + 1;
    candidate := base || '-' || i;
  end loop;

  begin
    insert into public.churches (name, slug) values (n, candidate) returning id into cid;
  exception when unique_violation then
    return jsonb_build_object('error', 'A church with that name was just registered. Try applying to join it instead.');
  end;
  insert into public.church_accounts (user_id, church_id, role) values (uid, cid, 'church');
  return jsonb_build_object('ok', true, 'church_id', cid);
end
$$;

-- Make a person an admin, an individual account again, or (up to two in all) a main account. Only a main account may.
-- A main account's own role can't be changed here.
create or replace function public.set_member_role(p_user uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.church_accounts%rowtype;
begin
  if p_role not in ('admin', 'member', 'church') then
    return jsonb_build_object('error', 'Choose main account, admin or individual account.');
  end if;
  select * into target from public.church_accounts where user_id = p_user;
  if not found or not public.is_church_manager(target.church_id) then
    return jsonb_build_object('error', 'That person isn''t in your church.');
  end if;
  if target.role = 'church' then
    return jsonb_build_object('error', 'A main account''s role can''t be changed here.');
  end if;
  if p_role = 'church' and (select count(*) from public.church_accounts where church_id = target.church_id and role = 'church') >= 2 then
    return jsonb_build_object('error', 'A church can have up to 2 main accounts.');
  end if;
  update public.church_accounts set role = p_role where user_id = p_user;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.register_church(text), public.set_member_role(uuid, text) from public, anon;
grant execute on function public.register_church(text), public.set_member_role(uuid, text) to authenticated;
