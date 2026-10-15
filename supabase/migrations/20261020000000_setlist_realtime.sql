-- ChordBase: live updates for setlists. Screens showing the same setlist hear about
-- changes made on other screens through Supabase Realtime, which respects row level
-- security, so a church only ever hears about its own setlists.

-- Which screen made a change, so that screen can ignore the echo of its own edit.
-- It is a random id each browser tab makes up, not an account.
alter table public.setlists      add column edited_by text;
alter table public.setlist_items add column edited_by text;

-- Tell Realtime to publish changes to these tables (songs too, so editing a song
-- shows up in setlists that use it). Safe to run more than once.
do $$
declare
  t text;
begin
  foreach t in array array['setlists', 'setlist_items', 'songs'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
