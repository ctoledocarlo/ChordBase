-- ChordBase: a phone remote switches itself off. The app sets this to four hours after it was started, and
-- Media can add an hour when half an hour or less is left. Run 20261029000000_remote_and_versions.sql first.
--
-- Safe to run again.

alter table public.setlists
  add column if not exists remote_expires_at timestamptz;

-- A remote that is already on gets four hours from when it was started (or from now, if that isn't known).
update public.setlists
set remote_expires_at = coalesce(remote_started_at, now()) + interval '4 hours'
where remote_pin is not null and remote_expires_at is null;
