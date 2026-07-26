/**
 * Classic endless — one game. Level steps up each time the song finishes a loop.
 * Note density is expressed in beats so obstacles lock to the bed BPM.
 */

export type DifficultyProfile = {
  /** Base scroll in playfield-heights / sec. */
  startScroll: number
  /** Cap on speedMult. */
  maxSpeedMult: number
  /** Mult at which aggressive patterns unlock. */
  aggressiveAtMult: number
  /** Beats between hits at 1× (1 = quarter notes). */
  baseGapBeats: number
  /** Fastest density (0.5 = eighths). */
  minGapBeats: number
  /**
   * Approx gap seconds at 120 BPM — kept for tests / UI that still read sec.
   * Equals baseGapBeats * 0.5.
   */
  baseGapSec: number
  minGapSec: number
}

/** Level 1 baseline (cold start). */
export const ENDLESS_BASE: DifficultyProfile = {
  startScroll: 0.72,
  maxSpeedMult: 3.2,
  aggressiveAtMult: 1.35,
  baseGapBeats: 1,
  minGapBeats: 0.5,
  baseGapSec: 0.5,
  minGapSec: 0.25,
}

/** Per song-loop completion: tighten gaps + raise scroll slightly. */
export const LEVEL_UP = {
  scrollStep: 0.06,
  /** Shrink base gap by this many beats per level. */
  gapShrinkBeats: 0.05,
  minGapFloorBeats: 0.5,
  aggressiveStep: 0.08,
  /** Instant speedMult bump when the song finishes (never slows on revive). */
  speedBump: 0.18,
  maxLevel: 20,
} as const

/** Speed checkpoints for Classic star rail. */
export const SPEED_STAR_CHECKPOINTS = [1.2, 1.5, 2.0] as const

export function profileForLevel(level: number): DifficultyProfile {
  const n = Math.max(0, Math.min(LEVEL_UP.maxLevel, level) - 1)
  const baseGapBeats = Math.max(
    ENDLESS_BASE.minGapBeats,
    ENDLESS_BASE.baseGapBeats - n * LEVEL_UP.gapShrinkBeats,
  )
  const minGapBeats = LEVEL_UP.minGapFloorBeats
  return {
    startScroll: ENDLESS_BASE.startScroll + n * LEVEL_UP.scrollStep,
    maxSpeedMult: ENDLESS_BASE.maxSpeedMult,
    aggressiveAtMult: Math.max(
      1.05,
      ENDLESS_BASE.aggressiveAtMult - n * LEVEL_UP.aggressiveStep,
    ),
    baseGapBeats,
    minGapBeats,
    baseGapSec: baseGapBeats * 0.5,
    minGapSec: minGapBeats * 0.5,
  }
}
