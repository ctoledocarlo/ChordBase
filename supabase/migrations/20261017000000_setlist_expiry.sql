-- ChordBase: setlists expire. By default one month after they are created; the
-- app lets the church keep one for up to a year. Expired setlists are removed
-- the next time the setlist list is opened.

alter table public.setlists
  add column expires_at timestamptz not null default (now() + interval '1 month');

create index setlists_expires_at_idx on public.setlists (expires_at);
