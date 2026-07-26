/** Beat-grid helpers for Classic endless ↔ bed sync. */

export function beatSecForBpm(bpm: number): number {
  return 60 / Math.max(1, bpm)
}

/**
 * Chart time of the next beat at or after `minChartT`.
 * Chart t=0 maps to `musicFilePosSec` in the looping bed.
 * Beats in the file sit at `offsetSec + n * beatSec`.
 */
export function nextBeatChartTime(opts: {
  bpm: number
  /** Downbeat alignment inside the audio file (seconds). */
  offsetSec: number
  /** Bed playhead when chart clock is 0. */
  musicFilePosSec: number
  /** Earliest chart time to schedule (gives the player a beat to see). */
  minChartT?: number
}): number {
  const beatSec = beatSecForBpm(opts.bpm)
  const minT = opts.minChartT ?? 0.2
  const phase =
    ((opts.musicFilePosSec - opts.offsetSec) % beatSec + beatSec) % beatSec
  let t = phase < 1e-4 ? 0 : beatSec - phase
  while (t < minT) t += beatSec
  return t
}

/** Snap a chart time onto the same beat grid as `nextBeatChartTime`. */
export function quantizeChartTime(
  chartT: number,
  opts: { bpm: number; offsetSec: number; musicFilePosSec: number },
): number {
  const beatSec = beatSecForBpm(opts.bpm)
  const phase0 =
    ((opts.musicFilePosSec - opts.offsetSec) % beatSec + beatSec) % beatSec
  // chart times where phase lands on a beat: t = (beatSec - phase0) % beatSec + k*beatSec
  const first = phase0 < 1e-4 ? 0 : beatSec - phase0
  if (chartT <= first) return first
  const k = Math.round((chartT - first) / beatSec)
  return first + Math.max(0, k) * beatSec
}

/**
 * Density step in beats → seconds, snapped to ½-beat subdivisions.
 * Faster speedMult shortens the gap toward `minGapBeats`.
 */
export function gapSecForBeats(opts: {
  bpm: number
  speedMult: number
  baseGapBeats: number
  minGapBeats: number
}): number {
  const beatSec = beatSecForBpm(opts.bpm)
  const raw =
    opts.baseGapBeats / Math.max(1, opts.speedMult * 0.92)
  const beats = Math.max(
    opts.minGapBeats,
    Math.round(raw * 2) / 2, // ½-beat grid
  )
  return beats * beatSec
}
