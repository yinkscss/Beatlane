import { describe, expect, it } from 'vitest'
import {
  ENDLESS_BASE,
  profileForLevel,
} from '@/game/difficultyProfiles'
import {
  assertLegalNotes,
  createGeneratorState,
  pullNotes,
} from '@/game/proceduralGenerator'
import {
  railFillPctFromSpeed,
  railMarksFromSpeed,
  SPEED_STAR_AT,
} from '@/game/judging'

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

  it('lands primary hits on the bed beat grid', () => {
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
      // Allow eighth-note staggers (0.25) for aggressive doubles; L1 has none.
      expect(phase < 0.02 || Math.abs(phase - 0.25) < 0.02).toBe(true)
    }
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

describe('speed star rail', () => {
  it('lights stars at 1.2 / 1.5 / 2.0 checkpoints', () => {
    expect(railMarksFromSpeed(1.0).filter((m) => m.kind === 'star' && m.on)).toHaveLength(0)
    expect(railMarksFromSpeed(SPEED_STAR_AT[0]).filter((m) => m.kind === 'star' && m.on)).toHaveLength(1)
    expect(railMarksFromSpeed(SPEED_STAR_AT[1]).filter((m) => m.kind === 'star' && m.on)).toHaveLength(2)
    expect(railMarksFromSpeed(SPEED_STAR_AT[2]).filter((m) => m.kind === 'star' && m.on)).toHaveLength(3)
    expect(railFillPctFromSpeed(2.0)).toBeGreaterThan(40)
  })
})
