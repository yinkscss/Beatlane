import { describe, expect, it } from 'vitest'
import { detectOnsetsSync } from '@/audio/onsets'

function makeBuffer(opts: {
  durationSec: number
  sampleRate?: number
  clicksAt?: number[]
}): AudioBuffer {
  const sr = opts.sampleRate ?? 44100
  const length = Math.floor(opts.durationSec * sr)
  const data = new Float32Array(length)
  for (const t of opts.clicksAt ?? []) {
    const i = Math.floor(t * sr)
    for (let k = 0; k < 256 && i + k < length; k++) {
      // Sharp attack then decay — strong flux peak.
      data[i + k] = (k < 8 ? 1 : 0.4 * Math.exp(-k / 40)) * (k % 2 === 0 ? 1 : -1)
    }
  }
  return {
    duration: opts.durationSec,
    length,
    sampleRate: sr,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer
}

describe('detectOnsets', () => {
  it('returns [] for a silent buffer', () => {
    const buf = makeBuffer({ durationSec: 3 })
    expect(detectOnsetsSync(buf)).toEqual([])
  })

  it('finds clicks within ~25ms of their true times', () => {
    const clicks = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
    const buf = makeBuffer({ durationSec: 5, clicksAt: clicks })
    const onsets = detectOnsetsSync(buf)
    expect(onsets.length).toBeGreaterThanOrEqual(clicks.length - 1)
    for (const c of clicks) {
      const nearest = onsets.reduce(
        (best, o) =>
          Math.abs(o.t - c) < Math.abs(best - c) ? o.t : best,
        onsets[0]?.t ?? Infinity,
      )
      expect(Math.abs(nearest - c)).toBeLessThan(0.025)
    }
    for (const o of onsets) {
      expect(o.strength).toBeGreaterThan(0)
      expect(o.strength).toBeLessThanOrEqual(1)
    }
  })

  it('returns [] when onset density is below the fallback floor', () => {
    // One click in 5s → 0.2/sec < 0.4/sec floor.
    const buf = makeBuffer({ durationSec: 5, clicksAt: [1.0] })
    expect(detectOnsetsSync(buf)).toEqual([])
  })
})
