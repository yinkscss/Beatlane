-- G13: Daily Track seed table + run validation fields for leaderboards
-- Idempotent: safe if partially applied outside migration history.

-- ---------------------------------------------------------------------------
-- daily_tracks: one seeded chart per UTC calendar day
-- ---------------------------------------------------------------------------
create table if not exists public.daily_tracks (
  day date primary key,
  seed text not null,
  chart_id text not null references public.charts (id),
  created_at timestamptz not null default now()
);

create index if not exists daily_tracks_chart_id_idx on public.daily_tracks (chart_id);

-- ---------------------------------------------------------------------------
-- runs: tap payload + server validation markers
-- ---------------------------------------------------------------------------
alter table public.runs
  add column if not exists daily_day date,
  add column if not exists seed text,
  add column if not exists validated boolean not null default false,
  add column if not exists client_score integer,
  add column if not exists taps jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'runs_client_score_nonneg'
      and conrelid = 'public.runs'::regclass
  ) then
    alter table public.runs
      add constraint runs_client_score_nonneg
      check (client_score is null or client_score >= 0);
  end if;
end $$;

create index if not exists runs_daily_board_idx
  on public.runs (daily_day, score desc)
  where mode = 'daily' and validated = true;

create index if not exists runs_classic_board_idx
  on public.runs (score desc)
  where mode = 'classic' and validated = true;

create index if not exists runs_user_daily_idx
  on public.runs (user_id, daily_day, score desc)
  where mode = 'daily';

-- ---------------------------------------------------------------------------
-- RLS: daily_tracks readable (catalog); writes via service role only
-- ---------------------------------------------------------------------------
alter table public.daily_tracks enable row level security;

drop policy if exists "daily_tracks_select_all" on public.daily_tracks;
create policy "daily_tracks_select_all"
  on public.daily_tracks for select to anon, authenticated
  using (true);
