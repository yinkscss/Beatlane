/**
 * Chart time since run start (beginRun), not since the Play-button music arm.
 * Music may start on the gesture (Safari) several seconds before tiles — that
 * elapsed time must not skip the opening notes.
 */
export function elapsedSongTimeSec(opts: {
  perfNow: number
  perfAnchor: number
  audioNow: number | null
  audioAnchor: number | null
}): number {
  if (opts.audioNow != null && opts.audioAnchor != null) {
    return Math.max(0, opts.audioNow - opts.audioAnchor)
  }
  return Math.max(0, (opts.perfNow - opts.perfAnchor) / 1000)
}
