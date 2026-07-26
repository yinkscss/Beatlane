/**
 * Classic endless — one game. Level steps up each time the song finishes a loop.
 */

export type DifficultyProfile = {
  /** Base scroll in playfield-heights / sec. */
  startScroll: number
  /** Cap on speedMult. */
  maxSpeedMult: number
  /** Mult at which aggressive patterns unlock. */
  aggressiveAtMult: number
  /** Base gap between note hits (seconds) at 1×. */
  baseGapSec: number
  /** Min gap at high speed. */
  minGapSec: number
}

/** Level 1 baseline (cold start). */
export const ENDLESS_BASE: DifficultyProfile = {
  startScroll: 0.72,
  maxSpeedMult: 3.2,
  aggressiveAtMult: 1.35,
  baseGapSec: 0.5,
  minGapSec: 0.22,
}

/** Per song-loop completion: tighten gaps + raise scroll slightly. */
export const LEVEL_UP = {
  scrollStep: 0.06,
  gapShrink: 0.035,
  minGapFloor: 0.16,
  aggressiveStep: 0.08,
  /** Instant speedMult bump when the song finishes (never slows on revive). */
  speedBump: 0.18,
  maxLevel: 20,
} as const

/** Speed checkpoints for Classic star rail. */
export const SPEED_STAR_CHECKPOINTS = [1.2, 1.5, 2.0] as const

export function profileForLevel(level: number): DifficultyProfile {
  const n = Math.max(0, Math.min(LEVEL_UP.maxLevel, level) - 1)
  return {
    startScroll: ENDLESS_BASE.startScroll + n * LEVEL_UP.scrollStep,
    maxSpeedMult: ENDLESS_BASE.maxSpeedMult,
    aggressiveAtMult: Math.max(
      1.05,
      ENDLESS_BASE.aggressiveAtMult - n * LEVEL_UP.aggressiveStep,
    ),
    baseGapSec: Math.max(
      ENDLESS_BASE.minGapSec,
      ENDLESS_BASE.baseGapSec - n * LEVEL_UP.gapShrink,
    ),
    minGapSec: Math.max(
      LEVEL_UP.minGapFloor,
      ENDLESS_BASE.minGapSec - n * 0.01,
    ),
  }
}
