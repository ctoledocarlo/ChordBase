-- ChordBase: brute-force protection for logging in.
--
-- Before the (expensive) password check, the app asks this table whether an address, an email, or an
-- email-from-an-address is already locked out. One small row per key; no passwords or readable emails
-- or addresses are stored (the app hashes the keys). The functions are only callable with the service
-- role key, so a visitor can't read the table or lock someone else out by calling them.

create table public.login_attempts (
  -- sha256 of "kind:value" (kind is ip, email or pair), made by the app.
  key          text primary key,
  fails        integer not null default 0,
  window_start timestamptz not null default now(),
  max_fails    integer not null,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;

-- Which of these keys are locked right now, and whether this exact email-and-address pair has failed lately.
create or replace function public.login_gate(p_keys text[], p_pair text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result jsonb;
begin
  -- Housekeeping without a scheduler: now and then, drop rows nobody has touched for a day.
  if random() < 0.01 then
    delete from public.login_attempts where updated_at < now() - interval '1 day';
  end if;

  select jsonb_build_object(
    'locked', coalesce(
      jsonb_agg(jsonb_build_object('key', key, 'seconds', ceil(extract(epoch from locked_until - now()))::int))
        filter (where locked_until > now()),
      '[]'::jsonb),
    'had_fails', coalesce(bool_or(fails > 0 and window_start > now() - interval '15 minutes') filter (where key = p_pair), false)
  )
  into result
  from public.login_attempts
  where key = any (p_keys);

  return result;
end;
$$;

-- Counts one failed attempt against each key (with that key's own limit) and locks any that reached it for 15 minutes.
create or replace function public.login_failed(p_keys text[], p_limits integer[])
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  insert into public.login_attempts as a (key, fails, window_start, max_fails, updated_at)
  select k, 1, now(), l, now()
  from unnest(p_keys, p_limits) as t (k, l)
  on conflict (key) do update set
    fails = case when a.window_start <= now() - interval '15 minutes' then 1 else a.fails + 1 end,
    window_start = case when a.window_start <= now() - interval '15 minutes' then now() else a.window_start end,
    max_fails = excluded.max_fails,
    updated_at = now(),
    locked_until = case
      when (case when a.window_start <= now() - interval '15 minutes' then 1 else a.fails + 1 end) >= excluded.max_fails
        then now() + interval '15 minutes'
      else a.locked_until
    end;

  return (
    select jsonb_build_object(
      'locked', coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'seconds', ceil(extract(epoch from locked_until - now()))::int))
          filter (where locked_until > now()),
        '[]'::jsonb)
    )
    from public.login_attempts
    where key = any (p_keys)
  );
end;
$$;

-- A good login clears the failures for that email-and-address pair (the address-wide and email-wide counts just age out).
create or replace function public.login_ok(p_pair text)
returns void
language sql
set search_path = ''
as $$
  delete from public.login_attempts where key = p_pair
$$;

revoke execute on function public.login_gate(text[], text) from public, anon, authenticated;
revoke execute on function public.login_failed(text[], integer[]) from public, anon, authenticated;
revoke execute on function public.login_ok(text) from public, anon, authenticated;
grant execute on function public.login_gate(text[], text) to service_role;
grant execute on function public.login_failed(text[], integer[]) to service_role;
grant execute on function public.login_ok(text) to service_role;
