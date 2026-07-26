import { describe, expect, it } from 'vitest'
import {
  pickLaneTarget,
  pickTapTarget,
  type TapTargetCandidate,
} from '@/game/tapTarget'

const hitY = 656

function tile(
  partial: Partial<TapTargetCandidate> &
    Pick<TapTargetCandidate, 'id' | 'kind' | 'x' | 'y'>,
): TapTargetCandidate {
  return {
    w: 80,
    h: 100,
    lane: 0,
    ...partial,
  }
}

describe('pickTapTarget', () => {
  it('hits the black tile under the finger even when a bomb is lower in-lane', () => {
    const bomb = tile({ id: 1, kind: 'bomb', x: 10, y: 600, lane: 1 })
    const safe = tile({ id: 2, kind: 'other', x: 10, y: 200, lane: 1 })
    // Finger on the upper black tile
    const picked = pickTapTarget([bomb, safe], {
      tapX: 50,
      tapY: 240,
      hitY,
    })
    expect(picked?.id).toBe(2)
  })

  it('fails on Dont Tap when the finger is on the bomb sprite', () => {
    const bomb = tile({ id: 1, kind: 'bomb', x: 10, y: 600, lane: 1 })
    const safe = tile({ id: 2, kind: 'other', x: 10, y: 200, lane: 1 })
    const picked = pickTapTarget([bomb, safe], {
      tapX: 50,
      tapY: 640,
      hitY,
    })
    expect(picked?.id).toBe(1)
    expect(picked?.kind).toBe('bomb')
  })

  it('does not steal a safe tile in an adjacent lane when finger is on it', () => {
    const bomb = tile({ id: 1, kind: 'bomb', x: 110, y: 500, w: 80, lane: 2 })
    const safe = tile({ id: 2, kind: 'other', x: 20, y: 500, w: 80, lane: 1 })
    // Near the lane divider but still on the safe tile
    const picked = pickTapTarget([bomb, safe], {
      tapX: 95,
      tapY: 540,
      hitY,
      padPx: 10,
    })
    expect(picked?.id).toBe(2)
  })

  it('column fallback picks the tile nearer the hit band', () => {
    const upper = tile({ id: 1, kind: 'other', x: 10, y: 100, lane: 0 })
    const lower = tile({ id: 2, kind: 'other', x: 10, y: 580, lane: 0 })
    // White space in the column (not on either sprite)
    const picked = pickTapTarget([upper, lower], {
      tapX: 50,
      tapY: 400,
      hitY,
    })
    expect(picked?.id).toBe(2)
  })

  it('returns null for empty space with no overlapping column', () => {
    const safe = tile({ id: 1, kind: 'other', x: 10, y: 200, lane: 0 })
    const picked = pickTapTarget([safe], {
      tapX: 300,
      tapY: 240,
      hitY,
    })
    expect(picked).toBeNull()
  })
})

describe('pickLaneTarget', () => {
  it('prefers a safe note over a bomb in the same lane', () => {
    const bomb = tile({ id: 1, kind: 'bomb', x: 10, y: 600, lane: 0 })
    const safe = tile({ id: 2, kind: 'other', x: 10, y: 200, lane: 0 })
    expect(pickLaneTarget([bomb, safe], hitY)?.id).toBe(2)
  })

  it('returns the bomb when it is the only candidate', () => {
    const bomb = tile({ id: 1, kind: 'bomb', x: 10, y: 600, lane: 0 })
    expect(pickLaneTarget([bomb], hitY)?.kind).toBe('bomb')
  })
})
