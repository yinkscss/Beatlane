import { describe, expect, it } from 'vitest'
import {
  loopStartChartT,
  loopsCompletedAt,
  speedMultForLoop,
} from '@/game/songLoops'

describe('speedMultForLoop', () => {
  it('doubles each loop and caps at maxSpeedMult', () => {
    expect(speedMultForLoop(0, 3.2)).toBe(1)
    expect(speedMultForLoop(1, 3.2)).toBe(2)
    expect(speedMultForLoop(2, 3.2)).toBe(3.2)
    expect(speedMultForLoop(3, 3.2)).toBe(3.2)
    expect(speedMultForLoop(10, 3.2)).toBe(3.2)
  })
})

describe('loopStartChartT', () => {
  const opts = { durationSec: 60, originSec: 10, maxSpeedMult: 3.2 }

  it('starts loop 0 at chart t=0', () => {
    expect(loopStartChartT(0, opts)).toBe(0)
  })

  it('shrinks boundaries as rate doubles', () => {
    // Loop 0 lasts (60-10)/1 = 50s → loop 1 at t=50
    expect(loopStartChartT(1, opts)).toBeCloseTo(50, 5)
    // Loop 1 lasts 60/2 = 30s → loop 2 at t=80
    expect(loopStartChartT(2, opts)).toBeCloseTo(80, 5)
    // Loop 2 lasts 60/3.2 ≈ 18.75 → loop 3 at t≈98.75
    expect(loopStartChartT(3, opts)).toBeCloseTo(80 + 60 / 3.2, 5)
  })
})

describe('loopsCompletedAt', () => {
  const opts = {
    durationSec: 60,
    originSec: 0,
    maxSpeedMult: 3.2,
    maxLevel: 20,
  }

  it('counts completed loops from chart time', () => {
    expect(loopsCompletedAt(0, opts)).toBe(0)
    expect(loopsCompletedAt(59.9, opts)).toBe(0)
    expect(loopsCompletedAt(60, opts)).toBe(1)
    // After loop 1 (rate 2): next boundary at 60 + 60/2 = 90
    expect(loopsCompletedAt(90, opts)).toBe(2)
  })
})
