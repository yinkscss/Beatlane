-- G12 seed: 8 free tracks (×3 difficulties) + Afrobeats pack (paid)

insert into public.packs (id, title, description, price_cusd, art_gradient)
values (
  'afrobeats',
  'Afrobeats Pack',
  '3 original charts · Easy → Hard · royalty-safe.',
  1.99,
  'linear-gradient(145deg,#ff8a3d,#1a1424)'
)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  price_cusd = excluded.price_cusd,
  art_gradient = excluded.art_gradient;

-- Hide G8 stubs from Music UI (keep rows for FK safety if referenced).
update public.charts
set is_listed = false
where id in ('catalog-stub-easy', 'catalog-stub-normal', 'private-locked');

-- Helper: upsert one chart row
-- Free tracks
insert into public.charts (
  id, title, difficulty, bpm, duration_ms, is_public, is_listed,
  track_key, pack_id, price_cusd, art_gradient, audio_path, chart_path
) values
  -- Night Drive
  ('night-drive-easy', 'Night Drive', 'easy', 100, 20000, true, true, 'night-drive', null, null, 'linear-gradient(135deg,#ff8a3d,#1a1424)', 'night-drive/audio.wav', 'night-drive/easy.json'),
  ('night-drive-normal', 'Night Drive', 'normal', 112, 20000, true, true, 'night-drive', null, null, 'linear-gradient(135deg,#ff8a3d,#1a1424)', 'night-drive/audio.wav', 'night-drive/normal.json'),
  ('night-drive-hard', 'Night Drive', 'hard', 124, 20000, true, true, 'night-drive', null, null, 'linear-gradient(135deg,#ff8a3d,#1a1424)', 'night-drive/audio.wav', 'night-drive/hard.json'),
  -- Soft Lights
  ('soft-lights-easy', 'Soft Lights', 'easy', 96, 20000, true, true, 'soft-lights', null, null, 'linear-gradient(135deg,#6b5b95,#140f1c)', 'soft-lights/audio.wav', 'soft-lights/easy.json'),
  ('soft-lights-normal', 'Soft Lights', 'normal', 108, 20000, true, true, 'soft-lights', null, null, 'linear-gradient(135deg,#6b5b95,#140f1c)', 'soft-lights/audio.wav', 'soft-lights/normal.json'),
  ('soft-lights-hard', 'Soft Lights', 'hard', 120, 20000, true, true, 'soft-lights', null, null, 'linear-gradient(135deg,#6b5b95,#140f1c)', 'soft-lights/audio.wav', 'soft-lights/hard.json'),
  -- Pulse Market
  ('pulse-market-easy', 'Pulse Market', 'easy', 110, 20000, true, true, 'pulse-market', null, null, 'linear-gradient(135deg,#ff5c7a,#140f1c)', 'pulse-market/audio.wav', 'pulse-market/easy.json'),
  ('pulse-market-normal', 'Pulse Market', 'normal', 122, 20000, true, true, 'pulse-market', null, null, 'linear-gradient(135deg,#ff5c7a,#140f1c)', 'pulse-market/audio.wav', 'pulse-market/normal.json'),
  ('pulse-market-hard', 'Pulse Market', 'hard', 134, 20000, true, true, 'pulse-market', null, null, 'linear-gradient(135deg,#ff5c7a,#140f1c)', 'pulse-market/audio.wav', 'pulse-market/hard.json'),
  -- Skyline Tap
  ('skyline-tap-easy', 'Skyline Tap', 'easy', 102, 20000, true, true, 'skyline-tap', null, null, 'linear-gradient(135deg,#7dd3fc,#1a1424)', 'skyline-tap/audio.wav', 'skyline-tap/easy.json'),
  ('skyline-tap-normal', 'Skyline Tap', 'normal', 114, 20000, true, true, 'skyline-tap', null, null, 'linear-gradient(135deg,#7dd3fc,#1a1424)', 'skyline-tap/audio.wav', 'skyline-tap/normal.json'),
  ('skyline-tap-hard', 'Skyline Tap', 'hard', 126, 20000, true, true, 'skyline-tap', null, null, 'linear-gradient(135deg,#7dd3fc,#1a1424)', 'skyline-tap/audio.wav', 'skyline-tap/hard.json'),
  -- Lavender Rush
  ('lavender-rush-easy', 'Lavender Rush', 'easy', 98, 20000, true, true, 'lavender-rush', null, null, 'linear-gradient(135deg,#c4b5fd,#2a1f3d)', 'lavender-rush/audio.wav', 'lavender-rush/easy.json'),
  ('lavender-rush-normal', 'Lavender Rush', 'normal', 110, 20000, true, true, 'lavender-rush', null, null, 'linear-gradient(135deg,#c4b5fd,#2a1f3d)', 'lavender-rush/audio.wav', 'lavender-rush/normal.json'),
  ('lavender-rush-hard', 'Lavender Rush', 'hard', 128, 20000, true, true, 'lavender-rush', null, null, 'linear-gradient(135deg,#c4b5fd,#2a1f3d)', 'lavender-rush/audio.wav', 'lavender-rush/hard.json'),
  -- Orange Beat
  ('orange-beat-easy', 'Orange Beat', 'easy', 104, 20000, true, true, 'orange-beat', null, null, 'linear-gradient(135deg,#ffb347,#c45c26)', 'orange-beat/audio.wav', 'orange-beat/easy.json'),
  ('orange-beat-normal', 'Orange Beat', 'normal', 116, 20000, true, true, 'orange-beat', null, null, 'linear-gradient(135deg,#ffb347,#c45c26)', 'orange-beat/audio.wav', 'orange-beat/normal.json'),
  ('orange-beat-hard', 'Orange Beat', 'hard', 130, 20000, true, true, 'orange-beat', null, null, 'linear-gradient(135deg,#ffb347,#c45c26)', 'orange-beat/audio.wav', 'orange-beat/hard.json'),
  -- Four Lane Dream
  ('four-lane-dream-easy', 'Four Lane Dream', 'easy', 100, 20000, true, true, 'four-lane-dream', null, null, 'linear-gradient(135deg,#f0c95a,#1a1424)', 'four-lane-dream/audio.wav', 'four-lane-dream/easy.json'),
  ('four-lane-dream-normal', 'Four Lane Dream', 'normal', 118, 20000, true, true, 'four-lane-dream', null, null, 'linear-gradient(135deg,#f0c95a,#1a1424)', 'four-lane-dream/audio.wav', 'four-lane-dream/normal.json'),
  ('four-lane-dream-hard', 'Four Lane Dream', 'hard', 132, 20000, true, true, 'four-lane-dream', null, null, 'linear-gradient(135deg,#f0c95a,#1a1424)', 'four-lane-dream/audio.wav', 'four-lane-dream/hard.json'),
  -- Quiet Keys
  ('quiet-keys-easy', 'Quiet Keys', 'easy', 92, 20000, true, true, 'quiet-keys', null, null, 'linear-gradient(135deg,#a8dadc,#1d3557)', 'quiet-keys/audio.wav', 'quiet-keys/easy.json'),
  ('quiet-keys-normal', 'Quiet Keys', 'normal', 104, 20000, true, true, 'quiet-keys', null, null, 'linear-gradient(135deg,#a8dadc,#1d3557)', 'quiet-keys/audio.wav', 'quiet-keys/normal.json'),
  ('quiet-keys-hard', 'Quiet Keys', 'hard', 118, 20000, true, true, 'quiet-keys', null, null, 'linear-gradient(135deg,#a8dadc,#1d3557)', 'quiet-keys/audio.wav', 'quiet-keys/hard.json'),
  -- Paid pack: Lagos After ($0.99 single)
  ('lagos-after-easy', 'Lagos After', 'easy', 108, 20000, false, true, 'lagos-after', 'afrobeats', 0.99, 'linear-gradient(135deg,#f0c95a,#c45c26)', 'lagos-after/audio.wav', 'lagos-after/easy.json'),
  ('lagos-after-normal', 'Lagos After', 'normal', 120, 20000, false, true, 'lagos-after', 'afrobeats', 0.99, 'linear-gradient(135deg,#f0c95a,#c45c26)', 'lagos-after/audio.wav', 'lagos-after/normal.json'),
  ('lagos-after-hard', 'Lagos After', 'hard', 136, 20000, false, true, 'lagos-after', 'afrobeats', 0.99, 'linear-gradient(135deg,#f0c95a,#c45c26)', 'lagos-after/audio.wav', 'lagos-after/hard.json'),
  -- Paid pack: MiniPay Anthem ($0.49 single)
  ('minipay-anthem-easy', 'MiniPay Anthem', 'easy', 106, 20000, false, true, 'minipay-anthem', 'afrobeats', 0.49, 'linear-gradient(135deg,#35d07f,#0b3d2e)', 'minipay-anthem/audio.wav', 'minipay-anthem/easy.json'),
  ('minipay-anthem-normal', 'MiniPay Anthem', 'normal', 118, 20000, false, true, 'minipay-anthem', 'afrobeats', 0.49, 'linear-gradient(135deg,#35d07f,#0b3d2e)', 'minipay-anthem/audio.wav', 'minipay-anthem/normal.json'),
  ('minipay-anthem-hard', 'MiniPay Anthem', 'hard', 128, 20000, false, true, 'minipay-anthem', 'afrobeats', 0.49, 'linear-gradient(135deg,#35d07f,#0b3d2e)', 'minipay-anthem/audio.wav', 'minipay-anthem/hard.json'),
  -- Paid pack-only filler
  ('market-close-easy', 'Market Close', 'easy', 112, 20000, false, true, 'market-close', 'afrobeats', null, 'linear-gradient(135deg,#ff8a3d,#5c2a1a)', 'market-close/audio.wav', 'market-close/easy.json'),
  ('market-close-normal', 'Market Close', 'normal', 124, 20000, false, true, 'market-close', 'afrobeats', null, 'linear-gradient(135deg,#ff8a3d,#5c2a1a)', 'market-close/audio.wav', 'market-close/normal.json'),
  ('market-close-hard', 'Market Close', 'hard', 138, 20000, false, true, 'market-close', 'afrobeats', null, 'linear-gradient(135deg,#ff8a3d,#5c2a1a)', 'market-close/audio.wav', 'market-close/hard.json')
on conflict (id) do update set
  title = excluded.title,
  difficulty = excluded.difficulty,
  bpm = excluded.bpm,
  duration_ms = excluded.duration_ms,
  is_public = excluded.is_public,
  is_listed = excluded.is_listed,
  track_key = excluded.track_key,
  pack_id = excluded.pack_id,
  price_cusd = excluded.price_cusd,
  art_gradient = excluded.art_gradient,
  audio_path = excluded.audio_path,
  chart_path = excluded.chart_path,
  updated_at = now();
