import { describe, expect, it } from 'vitest'
import {
  beatSecForBpm,
  gapSecForBeats,
  nextBeatChartTime,
  quantizeChartTime,
} from '@/game/beatGrid'

describe('beatGrid', () => {
  it('maps bpm to beat length', () => {
    expect(beatSecForBpm(120)).toBeCloseTo(0.5)
    expect(beatSecForBpm(90)).toBeCloseTo(2 / 3, 5)
  })

  it('aligns first note to the audible next beat after countdown head-start', () => {
    // Music already 3.1s in; offset 0.1; 120 BPM → beats at 0.1, 0.6, 1.1, …
    // phase = (3.1 - 0.1) % 0.5 = 0 → exactly on a beat → next at 0, then minT pushes to 0.5
    const t = nextBeatChartTime({
      bpm: 120,
      offsetSec: 0.1,
      musicFilePosSec: 3.1,
      minChartT: 0.25,
    })
    expect(t).toBeCloseTo(0.5)

    // phase mid-beat: file 3.2 → phase 0.1 → next beat in 0.4s chart time
    const t2 = nextBeatChartTime({
      bpm: 120,
      offsetSec: 0.1,
      musicFilePosSec: 3.2,
      minChartT: 0.2,
    })
    expect(t2).toBeCloseTo(0.4)
  })

  it('keeps quantized times on the same grid', () => {
    const grid = {
      bpm: 120,
      offsetSec: 0.1,
      musicFilePosSec: 3.2,
    }
    const first = nextBeatChartTime({ ...grid, minChartT: 0.2 })
    expect(quantizeChartTime(first + 0.12, grid)).toBeCloseTo(first)
    expect(quantizeChartTime(first + 0.3, grid)).toBeCloseTo(first + 0.5)
  })

  it('gap shrinks with speed but stays on ½-beat steps', () => {
    const slow = gapSecForBeats({
      bpm: 120,
      speedMult: 1,
      baseGapBeats: 1,
      minGapBeats: 0.5,
    })
    expect(slow).toBeCloseTo(0.5)
    const fast = gapSecForBeats({
      bpm: 120,
      speedMult: 2.2,
      baseGapBeats: 1,
      minGapBeats: 0.5,
    })
    expect(fast).toBeCloseTo(0.25)
  })
})
