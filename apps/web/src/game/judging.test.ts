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
  holdAssistTargets,
  holdTileProgress,
  nearestValidHoldPoint,
  tileFullyPastBottom,
  tilePartiallyOnPlayfield,
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

  it('late tiles stay hittable until fully off the bottom', () => {
    const playfieldH = 800
    const h = 112
    // Near hit line (~0.82) — still on screen
    expect(tilePartiallyOnPlayfield(playfieldH * 0.82, h, playfieldH)).toBe(
      true,
    )
    // Mostly past hit line, bottom still on playfield
    expect(tilePartiallyOnPlayfield(playfieldH - h * 0.4, h, playfieldH)).toBe(
      true,
    )
    // Top just past bottom edge — gone
    expect(tilePartiallyOnPlayfield(playfieldH, h, playfieldH)).toBe(false)
    expect(tileFullyPastBottom(playfieldH - 1, playfieldH)).toBe(false)
    expect(tileFullyPastBottom(playfieldH, playfieldH)).toBe(true)
  })

  it('tall HOLD tiles stay startable while any part remains on-screen', () => {
    const playfieldH = 800
    const holdH = 420
    // Bottom edge just entering from top
    expect(tilePartiallyOnPlayfield(-holdH + 20, holdH, playfieldH)).toBe(true)
    // Mostly scrolled past hit line, still overlapping playfield
    expect(
      tilePartiallyOnPlayfield(playfieldH - holdH * 0.2, holdH, playfieldH),
    ).toBe(true)
    // Fully past bottom — auto-miss only
    expect(tilePartiallyOnPlayfield(playfieldH, holdH, playfieldH)).toBe(false)
    expect(tileFullyPastBottom(playfieldH, playfieldH)).toBe(true)
  })

  it('HOLD progress is geometric through the hit band (long tap until tile finishes)', () => {
    const hitY = 656
    const holdH = 200
    // Bottom at hit line → just started
    expect(holdTileProgress(hitY - holdH, holdH, hitY)).toBe(0)
    // Halfway through
    expect(holdTileProgress(hitY - holdH / 2, holdH, hitY)).toBeCloseTo(0.5)
    // Top at hit line → finished
    expect(holdTileProgress(hitY, holdH, hitY)).toBe(1)
    // Still approaching — not started
    expect(holdTileProgress(hitY - holdH - 40, holdH, hitY)).toBe(0)
  })

  it('HOLD_TAP_LOCK earliest_pixel_auto snaps Y to tip or hit line', () => {
    const hitY = 656
    const holdH = 200
    // Approaching: tip only
    const approachingY = hitY - holdH - 40
    expect(holdAssistTargets(approachingY, holdH, hitY)).toEqual([
      approachingY + holdH,
    ])
    // Press high in lane → still snaps to tip
    expect(
      nearestValidHoldPoint(100, approachingY, holdH, hitY),
    ).toBe(approachingY + holdH)

    // Crossing hit line: tip + line are both valid
    const crossingY = hitY - holdH / 2
    expect(holdAssistTargets(crossingY, holdH, hitY)).toEqual([
      crossingY + holdH,
      hitY,
    ])
    // Press near tip → tip
    expect(
      nearestValidHoldPoint(crossingY + holdH - 5, crossingY, holdH, hitY),
    ).toBe(crossingY + holdH)
    // Press near line → line
    expect(nearestValidHoldPoint(hitY + 3, crossingY, holdH, hitY)).toBe(hitY)
    // Keyboard / no-Y: pressY = hit line → prefers line when available
    expect(nearestValidHoldPoint(hitY, crossingY, holdH, hitY)).toBe(hitY)
  })

  it('late spatial taps grade GREAT (not miss) when far from hit line', () => {
    expect(gradeSpatialHit({ dist: tileH * 2, tileH })).toBe('great')
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
