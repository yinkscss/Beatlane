import { describe, expect, it } from 'vitest'
import {
  COMBO_FULL_RAIL,
  COMBO_PER_MARK,
  gradeSpatialHit,
  HIT_WINDOW_TILES,
  litMarksFromCombo,
  PERFECT_WINDOW_TILES,
  pointsForGrade,
  railFillPct,
  railMarks,
  SCORE_GREAT,
  SCORE_PERFECT,
  withinHitWindow,
} from '@/game/judging'

describe('chart judge — spatial grade', () => {
  const tileH = 100

  it('scores PERFECT / GREAT point values', () => {
    expect(pointsForGrade('perfect')).toBe(SCORE_PERFECT)
    expect(pointsForGrade('great')).toBe(SCORE_GREAT)
  })

  it('PERFECT when center is within perfect window', () => {
    const edge = tileH * PERFECT_WINDOW_TILES
    expect(gradeSpatialHit({ dist: 0, tileH })).toBe('perfect')
    expect(gradeSpatialHit({ dist: edge, tileH })).toBe('perfect')
    expect(gradeSpatialHit({ dist: edge + 0.01, tileH })).toBe('great')
  })

  it('forces PERFECT for hold-like / bridge / triple completion', () => {
    expect(
      gradeSpatialHit({ dist: tileH, tileH, alwaysPerfect: true }),
    ).toBe('perfect')
  })

  it('hit window admits GREAT band beyond perfect', () => {
    const perfectEdge = tileH * PERFECT_WINDOW_TILES
    const hitEdge = tileH * HIT_WINDOW_TILES
    expect(withinHitWindow(perfectEdge + 1, tileH)).toBe(true)
    expect(withinHitWindow(hitEdge, tileH)).toBe(true)
    expect(withinHitWindow(hitEdge + 0.01, tileH)).toBe(false)
  })
})

describe('chart judge — combo rail', () => {
  it('lights marks every COMBO_PER_MARK hits', () => {
    expect(litMarksFromCombo(0)).toBe(0)
    expect(litMarksFromCombo(COMBO_PER_MARK - 1)).toBe(0)
    expect(litMarksFromCombo(COMBO_PER_MARK)).toBe(1)
    expect(litMarksFromCombo(COMBO_FULL_RAIL)).toBe(6)
    expect(litMarksFromCombo(COMBO_FULL_RAIL + 99)).toBe(6)
  })

  it('rail fill caps at 100 and flag lights at ≥50%', () => {
    expect(railFillPct(0)).toBe(0)
    expect(railFillPct(COMBO_FULL_RAIL / 2)).toBe(50)
    expect(railFillPct(COMBO_FULL_RAIL)).toBe(100)
    const half = railMarks(COMBO_FULL_RAIL / 2)
    expect(half.find((m) => m.kind === 'flag')?.on).toBe(true)
  })
})
