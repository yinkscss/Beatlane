/** Local looping beds for Classic endless (bundled under public/audio/tracks). */

export type LocalTrack = {
  id: string
  title: string
  artist: string
  url: string
}

export const LOCAL_TRACKS: LocalTrack[] = [
  {
    id: 'dirty-mastered',
    title: 'Dirty',
    artist: 'BoySod',
    url: '/audio/tracks/dirty-mastered.mp3',
  },
  {
    id: 'energy',
    title: 'ENERGY',
    artist: 'boysod',
    url: '/audio/tracks/energy.mp3',
  },
  {
    id: 'soro-mi',
    title: 'Soro Mi',
    artist: 'boysod',
    url: '/audio/tracks/soro-mi.mp3',
  },
]

export const DEFAULT_LOCAL_TRACK_ID = 'dirty-mastered'

export function localTrackById(id: string | null | undefined): LocalTrack {
  return (
    LOCAL_TRACKS.find((t) => t.id === id) ??
    LOCAL_TRACKS.find((t) => t.id === DEFAULT_LOCAL_TRACK_ID)!
  )
}
