/** Local looping beds for Classic endless (bundled under public/audio/tracks). */

export type LocalTrack = {
  id: string
  title: string
  artist: string
  url: string
  /** Tempo for beat-locked procedural notes. */
  bpm: number
  /** Seconds from file start to the first downbeat. */
  offsetSec: number
}

export const LOCAL_TRACKS: LocalTrack[] = [
  {
    id: 'dirty-mastered',
    title: 'Dirty',
    artist: 'BoySod',
    url: '/audio/tracks/dirty-mastered.mp3',
    bpm: 88,
    offsetSec: 0.186,
  },
  {
    id: 'energy',
    title: 'ENERGY',
    artist: 'boysod',
    url: '/audio/tracks/energy.mp3',
    bpm: 92,
    offsetSec: 0.627,
  },
  {
    id: 'soro-mi',
    title: 'Soro Mi',
    artist: 'boysod',
    url: '/audio/tracks/soro-mi.mp3',
    bpm: 112,
    offsetSec: 0.464,
  },
]

export const DEFAULT_LOCAL_TRACK_ID = 'dirty-mastered'

export function localTrackById(id: string | null | undefined): LocalTrack {
  return (
    LOCAL_TRACKS.find((t) => t.id === id) ??
    LOCAL_TRACKS.find((t) => t.id === DEFAULT_LOCAL_TRACK_ID)!
  )
}
