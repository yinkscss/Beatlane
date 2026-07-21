-- Beatlane G8 core schema: profiles, charts, runs, purchases, unlocks + RLS

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  wallet_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_wallet_address_idx on public.profiles (wallet_address)
  where wallet_address is not null;

-- ---------------------------------------------------------------------------
-- charts (catalog metadata; payloads live in Storage)
-- ---------------------------------------------------------------------------
create table public.charts (
  id text primary key,
  title text not null,
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  bpm numeric not null check (bpm > 0),
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  is_public boolean not null default false,
  audio_path text,
  chart_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index charts_is_public_idx on public.charts (is_public) where is_public = true;

-- ---------------------------------------------------------------------------
-- runs
-- ---------------------------------------------------------------------------
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  chart_id text not null references public.charts (id),
  mode text not null check (mode in ('classic', 'zen', 'daily', 'blitz')),
  score integer not null default 0 check (score >= 0),
  combo_max integer not null default 0 check (combo_max >= 0),
  perfects integer not null default 0 check (perfects >= 0),
  goods integer not null default 0 check (goods >= 0),
  misses integer not null default 0 check (misses >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index runs_user_id_created_at_idx on public.runs (user_id, created_at desc);
create index runs_chart_id_score_idx on public.runs (chart_id, score desc);

-- ---------------------------------------------------------------------------
-- purchases
-- ---------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sku text not null,
  amount_cusd numeric(18, 6) not null check (amount_cusd >= 0),
  tx_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchases_user_id_created_at_idx on public.purchases (user_id, created_at desc);
create unique index purchases_tx_hash_uidx on public.purchases (tx_hash)
  where tx_hash is not null;

-- ---------------------------------------------------------------------------
-- unlocks
-- ---------------------------------------------------------------------------
create table public.unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  unlock_type text not null check (unlock_type in ('chart', 'pack', 'continue', 'season_pass')),
  unlock_key text not null,
  source_purchase_id uuid references public.purchases (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, unlock_type, unlock_key)
);

create index unlocks_user_id_idx on public.unlocks (user_id);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger charts_set_updated_at
  before update on public.charts
  for each row execute function public.set_updated_at();

create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- auto-create profile on auth signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.charts enable row level security;
alter table public.runs enable row level security;
alter table public.purchases enable row level security;
alter table public.unlocks enable row level security;

-- profiles: own row only
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

-- charts: public catalog readable by anyone; private via unlock
create policy "charts_select_public"
  on public.charts for select to anon, authenticated
  using (is_public = true);

create policy "charts_select_unlocked"
  on public.charts for select to authenticated
  using (
    exists (
      select 1 from public.unlocks u
      where u.user_id = (select auth.uid())
        and u.unlock_type = 'chart'
        and u.unlock_key = charts.id
    )
  );

-- runs: own rows
create policy "runs_select_own"
  on public.runs for select to authenticated
  using (user_id = (select auth.uid()));

create policy "runs_insert_own"
  on public.runs for insert to authenticated
  with check (user_id = (select auth.uid()));

-- purchases: own read; writes via service role / future edge (no client insert in G8)
create policy "purchases_select_own"
  on public.purchases for select to authenticated
  using (user_id = (select auth.uid()));

-- unlocks: own read
create policy "unlocks_select_own"
  on public.unlocks for select to authenticated
  using (user_id = (select auth.uid()));
