-- ChordBase: churches + church login accounts, with row-level security.
--
-- Model (v1): one Supabase Auth user per church ("the church login").
-- church_accounts maps that auth user to a church. Later, many users can map
-- to one church (add a role/status column then) without touching church data.
-- Every future church-owned table should carry a church_id and use
-- public.current_church_ids() in its RLS policies.

create table public.churches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) > 0),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.church_accounts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  church_id  uuid not null references public.churches (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index church_accounts_church_id_idx on public.church_accounts (church_id);

-- Churches the signed-in user belongs to. SECURITY DEFINER so policies on other
-- tables can call it without recursing into church_accounts' own RLS.
create function public.current_church_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select church_id
  from public.church_accounts
  where user_id = (select auth.uid())
$$;

revoke all on function public.current_church_ids() from public, anon;
grant execute on function public.current_church_ids() to authenticated;

alter table public.churches enable row level security;
alter table public.church_accounts enable row level security;

-- Read-only from the app. No insert/update/delete policies exist, so churches
-- and links are created only by you (SQL editor / service role).
create policy "church members can read their church"
  on public.churches for select to authenticated
  using (id in (select public.current_church_ids()));

create policy "users can read their own church link"
  on public.church_accounts for select to authenticated
  using (user_id = (select auth.uid()));

-- Defense in depth: anonymous visitors get nothing.
revoke all on public.churches, public.church_accounts from anon;
grant select on public.churches, public.church_accounts to authenticated;
