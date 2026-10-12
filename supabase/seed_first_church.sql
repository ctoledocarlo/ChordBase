-- Run ONCE in the Supabase dashboard -> SQL Editor, AFTER:
--   1. the migration in supabase/migrations/ has been applied, and
--   2. you created the church's login in Authentication -> Users
--      ("Add user" -> "Create new user", with "Auto Confirm User" checked).
--
-- Replace the email below with that login's email, then run.
-- (Not named seed.sql on purpose, so `supabase db reset` doesn't auto-run it.)

with church as (
  insert into public.churches (name, slug)
  values ('Friends of Jesus Christ Canada', 'friends-of-jesus-christ-canada')
  on conflict (slug) do update set name = excluded.name
  returning id
)
insert into public.church_accounts (user_id, church_id)
select u.id, church.id
from church
join auth.users u on lower(u.email) = lower('REPLACE_WITH_CHURCH_LOGIN_EMAIL')
on conflict (user_id) do update set church_id = excluded.church_id;

-- Check: should return exactly one row. Zero rows means the email didn't match
-- an existing auth user.
select c.name, u.email
from public.church_accounts ca
join public.churches c on c.id = ca.church_id
join auth.users u on u.id = ca.user_id;
