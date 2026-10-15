-- ChordBase: a song in a setlist can carry its own version of the chords and layout, so a
-- setlist can be changed without editing the song in the library. Null means "use the song as it is".

alter table public.setlist_items
  add column body_override text;
