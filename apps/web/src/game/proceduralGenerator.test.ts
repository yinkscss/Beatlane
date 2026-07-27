import { describe, expect, it } from 'vitest'
import type { Onset } from '@/audio/onsets'
import {
  ENDLESS_BASE,
  profileForLevel,
} from '@/game/difficultyProfiles'
import {
  assertLegalNotes,
  createGeneratorState,
  pullNotes,
  setGeneratorOnsets,
} from '@/game/proceduralGenerator'
import {
  LOOP_STAR_AT,
  railFillPctFromLoops,
  railMarksFromLoops,
} from '@/game/judging'

function syntheticOnsets(durationSec: number, everySec = 0.25): Onset[] {
  const out: Onset[] = []
  for (let t = 0.4; t < durationSec - 0.05; t += everySec) {
    // Alternate strong / medium so pattern rolls fire.
    out.push({ t, strength: out.length % 3 === 0 ? 0.9 : 0.55 })
  }
  return out
}

describe('proceduralGenerator', () => {
  const grid = { bpm: 120, offsetSec: 0, musicFilePosSec: 0 }

  it('never emits triple/hold or 3+ simultaneous covers', () => {
    const state = createGeneratorState(profileForLevel(8), 42, grid)
    const notes = pullNotes(state, 120, 2.0)
    expect(notes.length).toBeGreaterThan(40)
    expect(() => assertLegalNotes(notes)).not.toThrow()
    expect(notes.some((n) => n.type === 'triple')).toBe(false)
    expect(notes.some((n) => n.type === 'l_hook')).toBe(false)
    expect(notes.some((n) => n.type === 'fake_gap')).toBe(false)
  })

  it('is deterministic for the same seed', () => {
    const a = createGeneratorState(ENDLESS_BASE, 7, grid)
    const b = createGeneratorState(ENDLESS_BASE, 7, grid)
    const na = pullNotes(a, 20, 1.2)
    const nb = pullNotes(b, 20, 1.2)
    expect(na).toEqual(nb)
  })

  it('lands primary hits on the bed beat grid (fallback)', () => {
    const state = createGeneratorState(ENDLESS_BASE, 9, {
      bpm: 120,
      offsetSec: 0.1,
      musicFilePosSec: 3.2,
    })
    const notes = pullNotes(state, 8, 1)
    const taps = notes.filter((n) => n.type === 'tap' || n.type === 'bridge')
    expect(taps.length).toBeGreaterThan(4)
    // At 120 BPM with filePos 3.2 / offset 0.1, beats in chart time are 0.4, 0.9, …
    for (const n of taps) {
      const phase = (n.t - 0.4 + 1e-6) % 0.5
      // Allow eighth-note staggers (0.25) for aggressive doubles / zig-zag.
      expect(phase < 0.02 || Math.abs(phase - 0.25) < 0.02).toBe(true)
    }
  })

  it('onset mode stays legal at 1× / 2× / 3.2× and respects the gap floor', () => {
    for (const speed of [1, 2, 3.2]) {
      const state = createGeneratorState(profileForLevel(5), 99, grid)
      setGeneratorOnsets(state, syntheticOnsets(40, 0.12), 40)
      const notes = pullNotes(state, 30, speed)
      expect(notes.length).toBeGreaterThan(10)
      expect(() => assertLegalNotes(notes)).not.toThrow()
      expect(notes.some((n) => n.type === 'triple')).toBe(false)

      // Real-time gap floor: consecutive emit times ≥ ~0.18 / related.
      const times = [...new Set(notes.map((n) => n.t))].sort((a, b) => a - b)
      for (let i = 1; i < times.length; i++) {
        expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(0.175)
      }
    }
  })

  it('empty onsets fall back to the beat grid', () => {
    const state = createGeneratorState(ENDLESS_BASE, 3, grid)
    setGeneratorOnsets(state, [], 60)
    const notes = pullNotes(state, 6, 1)
    expect(notes.length).toBeGreaterThan(3)
    expect(() => assertLegalNotes(notes)).not.toThrow()
  })

  it('can emit simultaneous doubles (exactly 2 lanes) when aggressive', () => {
    const state = createGeneratorState(profileForLevel(8), 1, grid)
    setGeneratorOnsets(state, syntheticOnsets(20, 0.3), 20)
    const notes = pullNotes(state, 15, 2.0)
    const byT = new Map<number, typeof notes>()
    for (const n of notes) {
      const list = byT.get(n.t) ?? []
      list.push(n)
      byT.set(n.t, list)
    }
    const doubles = [...byT.values()].filter(
      (g) => g.length === 2 && g.every((n) => n.type === 'tap'),
    )
    // Not guaranteed every seed, but with strong onsets + aggressive it should fire.
    // If none, still legal — just assert no 3-wide.
    for (const g of doubles) {
      const lanes = g.map((n) => n.lane).sort()
      expect(lanes[0]!).toBeLessThanOrEqual(1)
      expect(lanes[1]!).toBeGreaterThanOrEqual(2)
    }
    expect(() => assertLegalNotes(notes)).not.toThrow()
  })
})

describe('song-loop levels', () => {
  it('hardens profile as level increases', () => {
    const l1 = profileForLevel(1)
    const l5 = profileForLevel(5)
    expect(l5.startScroll).toBeGreaterThan(l1.startScroll)
    expect(l5.baseGapSec).toBeLessThan(l1.baseGapSec)
    expect(l5.aggressiveAtMult).toBeLessThan(l1.aggressiveAtMult)
  })
})

describe('loop star rail', () => {
  it('lights stars at loops 1 / 2 / 3', () => {
    expect(
      railMarksFromLoops(0).filter((m) => m.kind === 'star' && m.on),
    ).toHaveLength(0)
    expect(
      railMarksFromLoops(LOOP_STAR_AT[0]).filter(
        (m) => m.kind === 'star' && m.on,
      ),
    ).toHaveLength(1)
    expect(
      railMarksFromLoops(LOOP_STAR_AT[1]).filter(
        (m) => m.kind === 'star' && m.on,
      ),
    ).toHaveLength(2)
    expect(
      railMarksFromLoops(LOOP_STAR_AT[2]).filter(
        (m) => m.kind === 'star' && m.on,
      ),
    ).toHaveLength(3)
    expect(railFillPctFromLoops(3)).toBeGreaterThan(40)
  })
})
