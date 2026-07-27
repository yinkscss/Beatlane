/**
 * Energy-flux onset detection for Classic endless.
 * Pure typed-array math on a decoded AudioBuffer — no AnalyserNode / FFT deps.
 */

export type Onset = {
  /** File time in seconds. */
  t: number
  /** 0..1 relative to this track's flux distribution. */
  strength: number
}

const FRAME = 1024
const HOP = 512
/** Local mean window half-width in seconds. */
const LOCAL_HALF_SEC = 0.25
const THRESH_MULT = 1.45
/** Minimum gap between accepted onsets (file seconds). */
const MIN_IOI_SEC = 0.11
/** Below this density, return [] so callers fall back to the beat grid. */
const MIN_ONSETS_PER_SEC = 0.4
/** Yield to the event loop every N frames so long tracks don't jank mobile. */
const YIELD_EVERY = 4096

function downmixMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length
  const out = new Float32Array(n)
  const ch = buffer.numberOfChannels
  if (ch === 1) {
    out.set(buffer.getChannelData(0))
    return out
  }
  const channels: Float32Array[] = []
  for (let c = 0; c < ch; c++) channels.push(buffer.getChannelData(c))
  const inv = 1 / ch
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let c = 0; c < ch; c++) s += channels[c]![i]!
    out[i] = s * inv
  }
  return out
}

function frameFeatures(
  samples: Float32Array,
  start: number,
): { rms: number; high: number } {
  let e = 0
  let h = 0
  const end = Math.min(samples.length, start + FRAME)
  let prev = samples[start] ?? 0
  for (let i = start; i < end; i++) {
    const s = samples[i]!
    e += s * s
    const d = s - prev
    h += d * d
    prev = s
  }
  const n = Math.max(1, end - start)
  return { rms: Math.sqrt(e / n), high: Math.sqrt(h / n) }
}

function yieldTick(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof queueMicrotask === 'function') queueMicrotask(resolve)
    else setTimeout(resolve, 0)
  })
}

/**
 * Detect onsets in a decoded buffer. Returns file-time peaks with
 * strength normalized against this track. Empty array = too sparse; caller
 * should fall back to the BPM beat grid.
 */
export async function detectOnsets(buffer: AudioBuffer): Promise<Onset[]> {
  if (buffer.length < FRAME * 2 || buffer.sampleRate <= 0) return []

  const samples = downmixMono(buffer)
  const sr = buffer.sampleRate
  const nFrames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1)
  if (nFrames < 4) return []

  const flux = new Float32Array(nFrames)
  let prevRms = 0
  let prevHigh = 0

  for (let f = 0; f < nFrames; f++) {
    const { rms, high } = frameFeatures(samples, f * HOP)
    const dRms = Math.max(0, rms - prevRms)
    const dHigh = Math.max(0, high - prevHigh)
    flux[f] = dRms + dHigh * 1.35
    prevRms = rms
    prevHigh = high
    if (f > 0 && f % YIELD_EVERY === 0) await yieldTick()
  }

  const winFrames = Math.max(1, Math.round((LOCAL_HALF_SEC * sr) / HOP))
  // Prefix sum for O(1) local means.
  const prefix = new Float64Array(nFrames + 1)
  for (let i = 0; i < nFrames; i++) prefix[i + 1] = prefix[i]! + flux[i]!

  const candidates: { f: number; v: number }[] = []
  for (let f = 1; f < nFrames - 1; f++) {
    const v = flux[f]!
    if (v <= flux[f - 1]! || v < flux[f + 1]!) continue
    const a = Math.max(0, f - winFrames)
    const b = Math.min(nFrames, f + winFrames + 1)
    const mean = (prefix[b]! - prefix[a]!) / Math.max(1, b - a)
    if (v >= mean * THRESH_MULT && v > 1e-6) {
      candidates.push({ f, v })
    }
  }

  // Peak-pick with minimum inter-onset interval.
  const minIoiFrames = Math.max(1, Math.round((MIN_IOI_SEC * sr) / HOP))
  const picked: { f: number; v: number }[] = []
  for (const c of candidates) {
    const last = picked[picked.length - 1]
    if (!last || c.f - last.f >= minIoiFrames) {
      picked.push(c)
    } else if (c.v > last.v) {
      picked[picked.length - 1] = c
    }
  }

  const durationSec = buffer.duration > 0 ? buffer.duration : samples.length / sr
  if (durationSec < 0.5) return []
  if (picked.length / durationSec < MIN_ONSETS_PER_SEC) return []

  // Normalize strength against this track's flux distribution (95th percentile).
  const vals = picked.map((p) => p.v).sort((a, b) => a - b)
  const p95 = vals[Math.max(0, Math.floor(vals.length * 0.95) - 1)]! || 1

  return picked.map((p) => ({
    t: (p.f * HOP) / sr,
    strength: Math.min(1, p.v / p95),
  }))
}

/** Sync helper for tests — same algorithm without async yields. */
export function detectOnsetsSync(buffer: AudioBuffer): Onset[] {
  // Re-run the core path without awaits by using a blocking loop.
  // For tests only; production uses detectOnsets.
  if (buffer.length < FRAME * 2 || buffer.sampleRate <= 0) return []

  const samples = downmixMono(buffer)
  const sr = buffer.sampleRate
  const nFrames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1)
  if (nFrames < 4) return []

  const flux = new Float32Array(nFrames)
  let prevRms = 0
  let prevHigh = 0
  for (let f = 0; f < nFrames; f++) {
    const { rms, high } = frameFeatures(samples, f * HOP)
    flux[f] = Math.max(0, rms - prevRms) + Math.max(0, high - prevHigh) * 1.35
    prevRms = rms
    prevHigh = high
  }

  const winFrames = Math.max(1, Math.round((LOCAL_HALF_SEC * sr) / HOP))
  const prefix = new Float64Array(nFrames + 1)
  for (let i = 0; i < nFrames; i++) prefix[i + 1] = prefix[i]! + flux[i]!

  const candidates: { f: number; v: number }[] = []
  for (let f = 1; f < nFrames - 1; f++) {
    const v = flux[f]!
    if (v <= flux[f - 1]! || v < flux[f + 1]!) continue
    const a = Math.max(0, f - winFrames)
    const b = Math.min(nFrames, f + winFrames + 1)
    const mean = (prefix[b]! - prefix[a]!) / Math.max(1, b - a)
    if (v >= mean * THRESH_MULT && v > 1e-6) candidates.push({ f, v })
  }

  const minIoiFrames = Math.max(1, Math.round((MIN_IOI_SEC * sr) / HOP))
  const picked: { f: number; v: number }[] = []
  for (const c of candidates) {
    const last = picked[picked.length - 1]
    if (!last || c.f - last.f >= minIoiFrames) picked.push(c)
    else if (c.v > last.v) picked[picked.length - 1] = c
  }

  const durationSec = buffer.duration > 0 ? buffer.duration : samples.length / sr
  if (durationSec < 0.5 || picked.length / durationSec < MIN_ONSETS_PER_SEC) {
    return []
  }

  const vals = picked.map((p) => p.v).sort((a, b) => a - b)
  const p95 = vals[Math.max(0, Math.floor(vals.length * 0.95) - 1)]! || 1
  return picked.map((p) => ({
    t: (p.f * HOP) / sr,
    strength: Math.min(1, p.v / p95),
  }))
}
