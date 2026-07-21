-- G16: Blitz tournament cups — entry fee, rake 15%, ranking, payout stub.
-- Entry fees settle on Celo Mainnet cUSD (Q07) via purchases; optional
-- TournamentVault on Celo Sepolia for on-chain escrow/payout stub.

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  status text not null default 'open'
    check (status in ('scheduled', 'open', 'live', 'closed', 'paid')),
  entry_fee_cusd numeric(12, 2) not null check (entry_fee_cusd >= 1 and entry_fee_cusd <= 10),
  rake_bps integer not null default 1500 check (rake_bps = 1500),
  duration_sec integer not null default 60 check (duration_sec > 0),
  chart_id text not null default 'sample-normal',
  capacity integer not null default 150 check (capacity > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  on_chain_cup_id text,
  contract_address text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  purchase_id uuid references public.purchases (id) on delete set null,
  tx_hash text not null,
  amount_cusd numeric(12, 2) not null,
  network text not null default 'celo-mainnet',
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id),
  unique (tx_hash)
);

create index tournament_entries_tournament_id_idx
  on public.tournament_entries (tournament_id);

create table if not exists public.tournament_runs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  tiles integer not null check (tiles >= 0),
  score integer not null default 0 check (score >= 0),
  combo_max integer not null default 0 check (combo_max >= 0),
  duration_ms integer,
  chart_id text,
  validated boolean not null default false,
  taps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index tournament_runs_tournament_tiles_idx
  on public.tournament_runs (tournament_id, tiles desc, created_at asc);

create table if not exists public.tournament_payouts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place integer not null check (place >= 1),
  tiles integer not null check (tiles >= 0),
  gross_pool_cusd numeric(12, 2) not null,
  rake_cusd numeric(12, 2) not null,
  prize_cusd numeric(12, 2) not null,
  status text not null default 'stub'
    check (status in ('stub', 'pending', 'paid')),
  tx_hash text,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id),
  unique (tournament_id, place)
);

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_runs enable row level security;
alter table public.tournament_payouts enable row level security;

-- Public read of cups / boards; writes via service role / edge only.
create policy "tournaments_select_public"
  on public.tournaments for select to anon, authenticated
  using (true);

create policy "tournament_entries_select_public"
  on public.tournament_entries for select to anon, authenticated
  using (true);

create policy "tournament_runs_select_public"
  on public.tournament_runs for select to anon, authenticated
  using (true);

create policy "tournament_payouts_select_public"
  on public.tournament_payouts for select to anon, authenticated
  using (true);

-- Seed Friday Finger Cup (design-pack). Entry $3 · 60s · fair chart.
insert into public.tournaments (
  slug, title, status, entry_fee_cusd, rake_bps, duration_sec, chart_id, capacity, metadata
) values (
  'friday-finger',
  'Friday Finger Cup',
  'open',
  3.00,
  1500,
  60,
  'sample-normal',
  150,
  '{"blurb":"60s Blitz · most tiles · top 10 paid","helpers":"off"}'::jsonb
)
on conflict (slug) do nothing;
