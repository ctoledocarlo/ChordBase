-- ChordBase: the song currently on stage. Media screens choose it; Stage and Viewer screens
-- follow it. Null means "nothing chosen yet" (screens show the first song).

alter table public.setlists
  add column active_item_id uuid references public.setlist_items (id) on delete set null;
