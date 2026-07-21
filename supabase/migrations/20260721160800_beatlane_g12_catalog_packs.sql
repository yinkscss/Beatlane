-- G12: packs, track grouping, listed catalog, pack unlock storage access

create table if not exists public.packs (
  id text primary key,
  title text not null,
  description text,
  price_cusd numeric(18, 6) not null check (price_cusd >= 0),
  art_gradient text,
  created_at timestamptz not null default now()
);

alter table public.packs enable row level security;

create policy "packs_select_all"
  on public.packs for select to anon, authenticated
  using (true);

alter table public.charts
  add column if not exists track_key text,
  add column if not exists pack_id text references public.packs (id) on delete set null,
  add column if not exists price_cusd numeric(18, 6),
  add column if not exists art_gradient text,
  add column if not exists is_listed boolean not null default true;

create index if not exists charts_track_key_idx on public.charts (track_key);
create index if not exists charts_pack_id_idx on public.charts (pack_id);
create index if not exists charts_is_listed_idx on public.charts (is_listed) where is_listed = true;

-- Listed catalog metadata readable by anyone (Storage still gated by is_public / unlocks).
drop policy if exists "charts_select_listed" on public.charts;
create policy "charts_select_listed"
  on public.charts for select to anon, authenticated
  using (is_listed = true);

-- Pack unlock grants chart metadata (in addition to chart-id unlocks).
drop policy if exists "charts_select_unlocked_pack" on public.charts;
create policy "charts_select_unlocked_pack"
  on public.charts for select to authenticated
  using (
    pack_id is not null
    and exists (
      select 1 from public.unlocks u
      where u.user_id = (select auth.uid())
        and u.unlock_type = 'pack'
        and u.unlock_key = charts.pack_id
    )
  );

-- Storage: pack unlock can read pack chart/audio objects.
drop policy if exists "storage_select_unlocked_pack_assets" on storage.objects;
create policy "storage_select_unlocked_pack_assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('audio', 'charts')
    and exists (
      select 1
      from public.unlocks u
      join public.charts c on c.pack_id = u.unlock_key
      where u.user_id = (select auth.uid())
        and u.unlock_type = 'pack'
        and (
          (bucket_id = 'audio' and c.audio_path = name)
          or (bucket_id = 'charts' and c.chart_path = name)
        )
    )
  );

-- Track-key chart unlock (single unlock covers all difficulties).
drop policy if exists "charts_select_unlocked_track" on public.charts;
create policy "charts_select_unlocked_track"
  on public.charts for select to authenticated
  using (
    track_key is not null
    and exists (
      select 1 from public.unlocks u
      where u.user_id = (select auth.uid())
        and u.unlock_type = 'chart'
        and u.unlock_key = charts.track_key
    )
  );

drop policy if exists "storage_select_unlocked_track_assets" on storage.objects;
create policy "storage_select_unlocked_track_assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('audio', 'charts')
    and exists (
      select 1
      from public.unlocks u
      join public.charts c on c.track_key = u.unlock_key
      where u.user_id = (select auth.uid())
        and u.unlock_type = 'chart'
        and (
          (bucket_id = 'audio' and c.audio_path = name)
          or (bucket_id = 'charts' and c.chart_path = name)
        )
    )
  );
