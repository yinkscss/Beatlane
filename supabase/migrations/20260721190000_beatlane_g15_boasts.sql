-- G15: Boast attestations — shareable on-chain flex cards.
-- Receipt hash lives on purchases.tx_hash; this table holds card metadata + share slug.

create table if not exists public.boasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  purchase_id uuid references public.purchases (id) on delete set null,
  combo integer not null check (combo >= 0),
  score integer not null check (score >= 0),
  chart_title text,
  mode text not null default 'classic',
  on_chain_id bigint,
  tx_hash text not null,
  receipt_hash text,
  share_slug text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (share_slug),
  unique (tx_hash)
);

create index boasts_user_id_created_at_idx on public.boasts (user_id, created_at desc);
create index boasts_share_slug_idx on public.boasts (share_slug);

alter table public.boasts enable row level security;

-- Public read by slug (share cards); owners can also list their own.
create policy "boasts_select_public"
  on public.boasts for select to anon, authenticated
  using (true);

-- Writes via service role / edge only (no client insert).
