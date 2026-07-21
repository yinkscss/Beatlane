-- G9: Magic-first profiles (issuer-keyed). Auth identity is Magic; Supabase Auth optional later.

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists magic_issuer text;

create unique index if not exists profiles_magic_issuer_uidx
  on public.profiles (magic_issuer)
  where magic_issuer is not null;

comment on column public.profiles.magic_issuer is
  'Magic DID issuer (did:…). Stable identity for Magic sessions; id is UUID v5 of issuer.';
