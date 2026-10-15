-- ChordBase: search songs by their words. `lyrics` is the song with the chords and
-- directives taken out, lower case, punctuation removed and spacing flattened, so a phrase
-- matches even when a chord sits in the middle of a word or a line breaks mid-phrase.
-- It is kept up to date by the database itself whenever the song's text changes.

create extension if not exists pg_trgm with schema extensions;

alter table public.songs
  add column lyrics text generated always as (
    lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(body, '\[[^\]]*\]|\{[^}]*\}', '', 'g'),
          '[^[:alnum:][:space:]]', '', 'g'
        ),
        '\s+', ' ', 'g'
      )
    )
  ) stored;

-- Makes "contains these words" searches fast however many songs there are.
create index songs_lyrics_trgm_idx on public.songs using gin (lyrics extensions.gin_trgm_ops);
