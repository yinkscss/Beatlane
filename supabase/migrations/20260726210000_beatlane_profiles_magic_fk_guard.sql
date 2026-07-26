-- Ensure Magic issuer profiles are not blocked by leftover auth.users FK.
-- Idempotent: safe if 20260721144610 already dropped the constraint.

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists magic_issuer text;

create unique index if not exists profiles_magic_issuer_uidx
  on public.profiles (magic_issuer)
  where magic_issuer is not null;
