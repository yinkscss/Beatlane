-- Tiny public catalog stub so anon client can read charts metadata

insert into public.charts (
  id, title, difficulty, bpm, duration_ms, is_public, audio_path, chart_path
) values
  (
    'catalog-stub-easy',
    'Catalog Stub (Easy)',
    'easy',
    100,
    45000,
    true,
    'catalog-stub-easy/audio.ogg',
    'catalog-stub-easy/chart.json'
  ),
  (
    'catalog-stub-normal',
    'Catalog Stub (Normal)',
    'normal',
    120,
    60000,
    true,
    'catalog-stub-normal/audio.ogg',
    'catalog-stub-normal/chart.json'
  )
on conflict (id) do update set
  title = excluded.title,
  difficulty = excluded.difficulty,
  bpm = excluded.bpm,
  duration_ms = excluded.duration_ms,
  is_public = excluded.is_public,
  audio_path = excluded.audio_path,
  chart_path = excluded.chart_path,
  updated_at = now();
