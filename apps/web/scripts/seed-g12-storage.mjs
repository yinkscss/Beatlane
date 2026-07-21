/**
 * G12: Generate short CC0-style placeholder WAV + chart JSON, upload to Storage.
 *
 * Usage (from repo root; never commit keys):
 *   SUPABASE_SERVICE_ROLE_KEY=… node apps/web/scripts/seed-g12-storage.mjs
 *
 * Reads project URL from apps/web/.env VITE_SUPABASE_URL.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const outDir = join(__dirname, '../.g12-seed')

const TRACKS = [
  { key: 'night-drive', title: 'Night Drive', bpm: { easy: 100, normal: 112, hard: 124 }, freq: 220 },
  { key: 'soft-lights', title: 'Soft Lights', bpm: { easy: 96, normal: 108, hard: 120 }, freq: 246.94 },
  { key: 'pulse-market', title: 'Pulse Market', bpm: { easy: 110, normal: 122, hard: 134 }, freq: 261.63 },
  { key: 'skyline-tap', title: 'Skyline Tap', bpm: { easy: 102, normal: 114, hard: 126 }, freq: 293.66 },
  { key: 'lavender-rush', title: 'Lavender Rush', bpm: { easy: 98, normal: 110, hard: 128 }, freq: 329.63 },
  { key: 'orange-beat', title: 'Orange Beat', bpm: { easy: 104, normal: 116, hard: 130 }, freq: 349.23 },
  { key: 'four-lane-dream', title: 'Four Lane Dream', bpm: { easy: 100, normal: 118, hard: 132 }, freq: 196 },
  { key: 'quiet-keys', title: 'Quiet Keys', bpm: { easy: 92, normal: 104, hard: 118 }, freq: 174.61 },
  { key: 'lagos-after', title: 'Lagos After', bpm: { easy: 108, normal: 120, hard: 136 }, freq: 233.08 },
  { key: 'minipay-anthem', title: 'MiniPay Anthem', bpm: { easy: 106, normal: 118, hard: 128 }, freq: 277.18 },
  { key: 'market-close', title: 'Market Close', bpm: { easy: 112, normal: 124, hard: 138 }, freq: 311.13 },
]

const DIFFS = ['easy', 'normal', 'hard']
const DURATION_SEC = 20
const SAMPLE_RATE = 22050

function loadEnvUrl() {
  const envPath = join(root, 'apps/web/.env')
  const raw = readFileSync(envPath, 'utf8')
  const m = raw.match(/^VITE_SUPABASE_URL=(.+)$/m)
  if (!m) throw new Error('VITE_SUPABASE_URL missing in apps/web/.env')
  return m[1].trim()
}

function pcmWav(freqHz, durationSec, sampleRate) {
  const n = Math.floor(durationSec * sampleRate)
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    // Soft beep pulse every 0.5s — clearly placeholder, not a song.
    const envelope = Math.max(0, 1 - ((t % 0.5) / 0.12))
    const sample = Math.sin(2 * Math.PI * freqHz * t) * envelope * 0.35
    const s = Math.max(-1, Math.min(1, sample))
    data.writeInt16LE((s * 0x7fff) | 0, i * 2)
  }
  const dataSize = data.length
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  data.copy(buf, 44)
  return buf
}

function buildNotes(difficulty, bpm) {
  const beat = 60 / bpm
  const baseGap =
    difficulty === 'easy' ? beat * 1.2 : difficulty === 'normal' ? beat * 0.85 : beat * 0.55
  // Cold start: wider gaps early, ease into baseGap (~first third of chart).
  const earlyGap = baseGap * 1.55
  const rampUntil = DURATION_SEC * 0.35
  const notes = []
  let t = 1.0
  let lane = 0
  let i = 0
  while (t < DURATION_SEC - 1.5) {
    notes.push({ t: Number(t.toFixed(3)), lane, type: 'tap' })
    // Bombs / holds only after warmup so catalog charts ramp cold→hard.
    if (difficulty === 'hard' && t >= rampUntil && i % 7 === 6) {
      notes.push({
        t: Number(t.toFixed(3)),
        lane: (lane + 2) % 4,
        type: 'bomb',
      })
    }
    if (difficulty !== 'easy' && t >= rampUntil && i % 11 === 10) {
      notes.push({
        t: Number((t + baseGap * 0.5).toFixed(3)),
        lane: (lane + 1) % 4,
        type: 'hold',
        length: Number((beat * 1.5).toFixed(3)),
      })
    }
    lane = (lane + 1) % 4
    const gap =
      t < rampUntil
        ? earlyGap + (baseGap - earlyGap) * (t / rampUntil)
        : baseGap
    t += gap
    i++
  }
  notes.sort((a, b) => a.t - b.t || a.lane - b.lane)
  return notes
}

function buildChart(track, difficulty) {
  const bpm = track.bpm[difficulty]
  const scroll =
    difficulty === 'easy' ? 0.62 : difficulty === 'normal' ? 0.78 : 0.95
  return {
    schemaVersion: 1,
    id: `${track.key}-${difficulty}`,
    title: track.title,
    difficulty,
    bpm,
    offset: 0,
    audio: `storage://${track.key}/audio.wav`,
    scrollHeightsPerSec: scroll,
    notes: buildNotes(difficulty, bpm),
    events:
      difficulty === 'hard'
        ? [
            { t: 14, type: 'speed_up', mult: 1.25 },
            { t: 16, type: 'double', duration: 4 },
          ]
        : difficulty === 'normal'
          ? [{ t: 12, type: 'hold', duration: 4 }]
          : [],
  }
}

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceKey) {
    throw new Error('Set SUPABASE_SERVICE_ROLE_KEY in the environment (do not commit).')
  }
  const url = loadEnvUrl()
  const supabase = createClient(url, serviceKey)

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  let uploaded = 0
  for (const track of TRACKS) {
    const wav = pcmWav(track.freq, DURATION_SEC, SAMPLE_RATE)
    const wavPath = join(outDir, `${track.key}-audio.wav`)
    writeFileSync(wavPath, wav)

    const { error: audioErr } = await supabase.storage
      .from('audio')
      .upload(`${track.key}/audio.wav`, wav, {
        contentType: 'audio/wav',
        upsert: true,
      })
    if (audioErr) throw audioErr
    uploaded++

    for (const d of DIFFS) {
      const chart = buildChart(track, d)
      const json = JSON.stringify(chart, null, 2)
      writeFileSync(join(outDir, `${track.key}-${d}.json`), json)
      const { error: chartErr } = await supabase.storage
        .from('charts')
        .upload(`${track.key}/${d}.json`, json, {
          contentType: 'application/json',
          upsert: true,
        })
      if (chartErr) throw chartErr
      uploaded++
    }
    console.log(`ok ${track.key}`)
  }

  console.log(`Uploaded ${uploaded} objects to audio/ + charts/ buckets.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
