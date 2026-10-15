-- ChordBase: how one song leads into the next in a setlist. Stored on the song that comes
-- first. "auto" means the app suggests the chords (from the two keys), "manual" means the
-- chords were typed in, "none" means no bridge.

alter table public.setlist_items
  add column transition_mode text not null default 'auto' check (transition_mode in ('auto', 'manual', 'none')),
  add column transition_chords text not null default '' check (char_length(transition_chords) <= 200);
