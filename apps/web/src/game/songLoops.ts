/**
 * Classic endless loop → speed schedule.
 * Chart time is wall-clock (real elapsed). File time advances at playbackRate.
 */

/** Rate for completed-loop count `loop` (0 = first pass): 1 → 2 → 4… capped. */
export function speedMultForLoop(loop: number, maxSpeedMult: number): number {
  const n = Math.max(0, Math.floor(loop))
  return Math.min(maxSpeedMult, 2 ** n)
}

/**
 * Chart time at which loop `loop` begins.
 * Loop 0 starts mid-file at `originSec` (music may already be playing).
 * Loop n (n≥1) lasts `durationSec / speedMultForLoop(n)`.
 */
export function loopStartChartT(
  loop: number,
  opts: {
    durationSec: number
    originSec: number
    maxSpeedMult: number
  },
): number {
  const dur = Math.max(0, opts.durationSec)
  if (dur <= 0) return 0
  const origin = Math.max(0, Math.min(dur, opts.originSec))
  const n = Math.max(0, Math.floor(loop))
  if (n === 0) return 0

  // Loop 0: remaining file from origin at rate 1.
  let t = (dur - origin) / speedMultForLoop(0, opts.maxSpeedMult)
  for (let i = 1; i < n; i++) {
    t += dur / speedMultForLoop(i, opts.maxSpeedMult)
  }
  return t
}

/** Next loop index whose start chart-time is > songTime (or equal when exactly on boundary). */
export function loopsCompletedAt(
  songTime: number,
  opts: {
    durationSec: number
    originSec: number
    maxSpeedMult: number
    maxLevel: number
  },
): number {
  if (opts.durationSec <= 1 || songTime < 0) return 0
  let loops = 0
  const maxLoops = Math.max(0, opts.maxLevel - 1)
  while (loops < maxLoops) {
    const nextStart = loopStartChartT(loops + 1, opts)
    if (songTime + 1e-9 < nextStart) break
    loops += 1
  }
  return loops
}
