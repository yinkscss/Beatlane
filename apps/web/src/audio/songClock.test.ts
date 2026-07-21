import { describe, expect, it } from 'vitest'
import { elapsedSongTimeSec } from '@/audio/songClock'

describe('elapsedSongTimeSec', () => {
  it('uses AudioContext time when both audio anchors exist', () => {
    expect(
      elapsedSongTimeSec({
        perfNow: 10_000,
        perfAnchor: 0,
        audioNow: 8.5,
        audioAnchor: 5,
      }),
    ).toBe(3.5)
  })

  it('falls back to performance time when audio is unavailable', () => {
    expect(
      elapsedSongTimeSec({
        perfNow: 4200,
        perfAnchor: 1000,
        audioNow: null,
        audioAnchor: null,
      }),
    ).toBe(3.2)
  })

  it('ignores music that started before beginRun (countdown desync)', () => {
    // Music armed at audio=0 on Play tap; beginRun 3s later anchors at 3.
    // Chart time must be ~0 at beginRun, not ~3.
    const beginAudioAnchor = 3
    expect(
      elapsedSongTimeSec({
        perfNow: 3000,
        perfAnchor: 3000,
        audioNow: 3.0,
        audioAnchor: beginAudioAnchor,
      }),
    ).toBe(0)
    expect(
      elapsedSongTimeSec({
        perfNow: 3500,
        perfAnchor: 3000,
        audioNow: 3.5,
        audioAnchor: beginAudioAnchor,
      }),
    ).toBe(0.5)
  })

  it('never returns negative time', () => {
    expect(
      elapsedSongTimeSec({
        perfNow: 100,
        perfAnchor: 500,
        audioNow: 1,
        audioAnchor: 2,
      }),
    ).toBe(0)
  })
})
