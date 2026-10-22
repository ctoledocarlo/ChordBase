-- ChordBase: closing the public API's reach to the song-version trigger, and indexes on foreign keys that had none
-- (found by Supabase's advisors). Safe to run again.

-- keep_song_version() only ever runs as a trigger on songs. Nobody needs to call it through the API, and a trigger
-- fires without the caller holding EXECUTE, so this changes nothing about how versions are kept.
revoke execute on function public.keep_song_version() from public, anon, authenticated;

-- A foreign key without an index makes deleting or changing the row it points at scan the whole child table.
create index if not exists setlist_items_church_id_idx    on public.setlist_items    (church_id);
create index if not exists setlist_items_singer_id_idx    on public.setlist_items    (singer_id);
create index if not exists setlist_messages_church_id_idx on public.setlist_messages (church_id);
create index if not exists setlist_notes_church_id_idx    on public.setlist_notes    (church_id);
create index if not exists setlist_notes_view_id_idx      on public.setlist_notes    (view_id);
create index if not exists setlist_tasks_church_id_idx    on public.setlist_tasks    (church_id);
create index if not exists setlist_tasks_view_id_idx      on public.setlist_tasks    (view_id);
create index if not exists setlist_views_church_id_idx    on public.setlist_views    (church_id);
create index if not exists song_versions_church_id_idx    on public.song_versions    (church_id);
