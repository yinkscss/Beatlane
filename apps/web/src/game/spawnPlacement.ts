/**
 * Y position when a tile should appear given current song time.
 * Ideal spawn: top at y = -tileH so the tile arrives at the hit line at noteT.
 * Late catch-up: advance by (songTime − spawnIdeal) × scrollSpeed.
 */
export function spawnYForSongTime(opts: {
  songTime: number
  noteT: number
  leadSec: number
  scrollSpeed: number
  tileH: number
}): number {
  const spawnIdeal = opts.noteT - opts.leadSec
  const lateSec = Math.max(0, opts.songTime - spawnIdeal)
  return -opts.tileH + lateSec * opts.scrollSpeed
}
