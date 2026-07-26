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
  it('never emits triple/hold or 3+ simultaneous covers', () => {
    const state = createGeneratorState(profileForLevel(8), 42)
    const notes = pullNotes(state, 120, 2.0)
    expect(notes.length).toBeGreaterThan(40)
    expect(() => assertLegalNotes(notes)).not.toThrow()
    expect(notes.some((n) => n.type === 'triple')).toBe(false)
    expect(notes.some((n) => n.type === 'l_hook')).toBe(false)
    expect(notes.some((n) => n.type === 'fake_gap')).toBe(false)
  })

  it('is deterministic for the same seed', () => {
    const a = createGeneratorState(ENDLESS_BASE, 7)
    const b = createGeneratorState(ENDLESS_BASE, 7)
    const na = pullNotes(a, 20, 1.2)
    const nb = pullNotes(b, 20, 1.2)
    expect(na).toEqual(nb)
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
