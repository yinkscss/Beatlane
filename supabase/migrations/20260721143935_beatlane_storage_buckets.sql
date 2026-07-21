-- Private Storage buckets for audio + chart JSON payloads

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'audio',
    'audio',
    false,
    52428800,
    array['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/x-wav']
  ),
  (
    'charts',
    'charts',
    false,
    5242880,
    array['application/json', 'text/plain', 'text/json']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read public-catalog assets (anon + authenticated)
create policy "storage_select_public_chart_assets"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id in ('audio', 'charts')
    and exists (
      select 1 from public.charts c
      where c.is_public = true
        and (
          (bucket_id = 'audio' and c.audio_path = name)
          or (bucket_id = 'charts' and c.chart_path = name)
        )
    )
  );

-- Read unlocked private assets
create policy "storage_select_unlocked_chart_assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('audio', 'charts')
    and exists (
      select 1
      from public.unlocks u
      join public.charts c on c.id = u.unlock_key
      where u.user_id = (select auth.uid())
        and u.unlock_type = 'chart'
        and (
          (bucket_id = 'audio' and c.audio_path = name)
          or (bucket_id = 'charts' and c.chart_path = name)
        )
    )
  );

-- No client uploads in G8 — service_role bypasses RLS for admin/edge uploads
