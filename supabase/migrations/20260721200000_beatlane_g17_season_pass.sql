-- G17: Season Pass — continues + track unlocks over 4 weeks (Q20).
-- No cosmetics / skins (Q23). Price $2.99 cUSD on Celo Mainnet (Q07).

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  price_cusd numeric(12, 2) not null check (price_cusd = 2.99),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active'
    check (status in ('scheduled', 'active', 'ended')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.season_rewards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  day_offset integer not null check (day_offset >= 0 and day_offset <= 28),
  sort_order integer not null default 0,
  reward_type text not null check (reward_type in ('continue', 'chart')),
  continue_count integer not null default 0 check (continue_count >= 0),
  track_key text,
  label text not null,
  created_at timestamptz not null default now(),
  check (
    (reward_type = 'continue' and continue_count > 0 and track_key is null)
    or (reward_type = 'chart' and track_key is not null and continue_count = 0)
  ),
  unique (season_id, sort_order)
);

create index season_rewards_season_id_idx on public.season_rewards (season_id);

create table if not exists public.season_reward_grants (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  reward_id uuid not null references public.season_rewards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_purchase_id uuid references public.purchases (id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (user_id, reward_id)
);

create index season_reward_grants_user_idx
  on public.season_reward_grants (user_id, season_id);

alter table public.seasons enable row level security;
alter table public.season_rewards enable row level security;
alter table public.season_reward_grants enable row level security;

create policy "seasons_select_public"
  on public.seasons for select to anon, authenticated
  using (true);

create policy "season_rewards_select_public"
  on public.season_rewards for select to anon, authenticated
  using (true);

-- Grants are private; edge function (service role) reads/writes.
create policy "season_reward_grants_select_own"
  on public.season_reward_grants for select to authenticated
  using (user_id = auth.uid());

create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function public.set_updated_at();

-- Season 1: Rhythm Pass — 4 weeks from 2026-07-21 (Q20).
insert into public.seasons (
  slug, title, price_cusd, starts_at, ends_at, status, metadata
) values (
  'season-1',
  'Rhythm Pass',
  2.99,
  '2026-07-21T00:00:00Z',
  '2026-08-18T00:00:00Z',
  'active',
  '{"blurb":"Bonus continues + track unlocks — no skins.","network":"celo-mainnet","duration_weeks":4}'::jsonb
)
on conflict (slug) do update set
  title = excluded.title,
  price_cusd = excluded.price_cusd,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

-- Reward track (design-pack nodes): +1 · ♪ · +2 · ♪ · ★ (continues finale — not cosmetic)
insert into public.season_rewards (
  season_id, day_offset, sort_order, reward_type, continue_count, track_key, label
)
select s.id, v.day_offset, v.sort_order, v.reward_type, v.continue_count, v.track_key, v.label
from public.seasons s
cross join (
  values
    (0,  0, 'continue', 1, null::text, '+1'),
    (7,  1, 'chart',    0, 'lagos-after', '♪'),
    (14, 2, 'continue', 2, null, '+2'),
    (21, 3, 'chart',    0, 'minipay-anthem', '♪'),
    (27, 4, 'continue', 3, null, '★')
) as v(day_offset, sort_order, reward_type, continue_count, track_key, label)
where s.slug = 'season-1'
on conflict (season_id, sort_order) do update set
  day_offset = excluded.day_offset,
  reward_type = excluded.reward_type,
  continue_count = excluded.continue_count,
  track_key = excluded.track_key,
  label = excluded.label;
