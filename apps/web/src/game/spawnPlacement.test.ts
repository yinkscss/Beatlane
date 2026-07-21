import { describe, expect, it } from 'vitest'
import {
  coversAllFourLanesAtSameT,
  lanesCoveredByNote,
  parseChart,
  type ChartNote,
} from '@/charts/schema'
import { spawnYForSongTime } from '@/game/spawnPlacement'

describe('spawnYForSongTime', () => {
  const tileH = 100
  const scrollSpeed = 400
  const leadSec = 1.2
  const noteT = 3

  it('spawns at -tileH when song time equals ideal spawn', () => {
    const songTime = noteT - leadSec
    expect(
      spawnYForSongTime({ songTime, noteT, leadSec, scrollSpeed, tileH }),
    ).toBe(-tileH)
  })

  it('advances Y by lateSec × scrollSpeed on catch-up', () => {
    const lateSec = 0.5
    const songTime = noteT - leadSec + lateSec
    expect(
      spawnYForSongTime({ songTime, noteT, leadSec, scrollSpeed, tileH }),
    ).toBeCloseTo(-tileH + lateSec * scrollSpeed)
  })

  it('staggers batch-spawned notes with different noteT', () => {
    const songTime = 2.5
    const y0 = spawnYForSongTime({
      songTime,
      noteT: 1.2,
      leadSec,
      scrollSpeed,
      tileH,
    })
    const y1 = spawnYForSongTime({
      songTime,
      noteT: 2.0,
      leadSec,
      scrollSpeed,
      tileH,
    })
    const y2 = spawnYForSongTime({
      songTime,
      noteT: 2.8,
      leadSec,
      scrollSpeed,
      tileH,
    })
    expect(y0).toBeGreaterThan(y1)
    expect(y1).toBeGreaterThan(y2)
    expect(y0 - y1).toBeCloseTo((2.0 - 1.2) * scrollSpeed)
  })

  it('does not go above -tileH when spawning early', () => {
    const songTime = noteT - leadSec - 0.25
    expect(
      spawnYForSongTime({ songTime, noteT, leadSec, scrollSpeed, tileH }),
    ).toBe(-tileH)
  })
})

describe('lane cover at same t', () => {
  it('counts bridge span 2 and triple span 3', () => {
    expect(lanesCoveredByNote({ t: 0, lane: 1, type: 'bridge' })).toEqual([
      1, 2,
    ])
    expect(lanesCoveredByNote({ t: 0, lane: 0, type: 'triple' })).toEqual([
      0, 1, 2,
    ])
    expect(
      lanesCoveredByNote({
        t: 0,
        lane: 2,
        type: 'l_hook',
        foot: -1,
        length: 1,
      }),
    ).toEqual([2, 1])
  })

  it('allows up to 3 lanes at one t', () => {
    const notes: ChartNote[] = [
      { t: 1, lane: 0, type: 'tap' },
      { t: 1, lane: 2, type: 'tap' },
      { t: 1, lane: 3, type: 'tap' },
    ]
    expect(coversAllFourLanesAtSameT(notes)).toBe(false)
  })

  it('flags four taps at the same t', () => {
    const notes: ChartNote[] = [
      { t: 1, lane: 0, type: 'tap' },
      { t: 1, lane: 1, type: 'tap' },
      { t: 1, lane: 2, type: 'tap' },
      { t: 1, lane: 3, type: 'tap' },
    ]
    expect(coversAllFourLanesAtSameT(notes)).toBe(true)
  })

  it('flags triple + tap covering all lanes', () => {
    const notes: ChartNote[] = [
      { t: 2, lane: 0, type: 'triple' },
      { t: 2, lane: 3, type: 'tap' },
    ]
    expect(coversAllFourLanesAtSameT(notes)).toBe(true)
  })

  it('parseChart rejects 4-lane cover at one t', () => {
    expect(() =>
      parseChart({
        schemaVersion: 1,
        id: 'bad',
        title: 'Bad',
        difficulty: 'easy',
        bpm: 100,
        offset: 0,
        audio: '/a.wav',
        notes: [
          { t: 1, lane: 0, type: 'tap' },
          { t: 1, lane: 1, type: 'tap' },
          { t: 1, lane: 2, type: 'tap' },
          { t: 1, lane: 3, type: 'tap' },
        ],
        events: [],
      }),
    ).toThrow(/at most 3 lanes/)
  })
})
