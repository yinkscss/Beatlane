/** Hit grades, score fantasy, and star→crown rail — design-pack + beat-pitch. */

import {
  HIT_WINDOW_TILES,
  PERFECT_WINDOW_TILES,
} from '@/game/playfieldTheme'

export type JudgeGrade = 'perfect' | 'great' | 'miss'

export const SCORE_PERFECT = 320
export const SCORE_GREAT = 180

/** Re-export windows so unit tests + playfield share one source of truth. */
export { HIT_WINDOW_TILES, PERFECT_WINDOW_TILES }

/** Combo hits needed to light each of 3 stars then 3 crowns (flag sits mid-rail). */
export const COMBO_PER_MARK = 4
export const STAR_MARKS = 3
export const CROWN_MARKS = 3
export const TOTAL_MARKS = STAR_MARKS + CROWN_MARKS
/** Combo that fills the rail (3★ + 3👑). */
export const COMBO_FULL_RAIL = TOTAL_MARKS * COMBO_PER_MARK

export function pointsForGrade(grade: Exclude<JudgeGrade, 'miss'>): number {
  return grade === 'perfect' ? SCORE_PERFECT : SCORE_GREAT
}

/**
 * Spatial tap grade from |tileCenterY − hitLineY| vs tile height.
 * Hold-like / bridge / triple force PERFECT (progress already validated).
 */
export function gradeSpatialHit(opts: {
  dist: number
  tileH: number
  alwaysPerfect?: boolean
  perfectWindowFrac?: number
}): Exclude<JudgeGrade, 'miss'> {
  if (opts.alwaysPerfect) return 'perfect'
  const frac = opts.perfectWindowFrac ?? PERFECT_WINDOW_TILES
  return opts.dist <= opts.tileH * frac ? 'perfect' : 'great'
}

/** True when distance is inside the GREAT hit window (fraction of tile height). */
export function withinHitWindow(
  dist: number,
  tileH: number,
  hitWindowFrac = HIT_WINDOW_TILES,
): boolean {
  return dist <= tileH * hitWindowFrac
}

/**
 * Piano Tiles–style: a tile (y = top) is hittable while any part remains on the
 * playfield. Tiles scroll downward.
 */
export function tilePartiallyOnPlayfield(
  tileY: number,
  tileH: number,
  playfieldH: number,
): boolean {
  return tileY < playfieldH && tileY + tileH > 0
}

/** Auto-miss only once the tile top has fully left the bottom edge. */
export function tileFullyPastBottom(
  tileY: number,
  playfieldH: number,
): boolean {
  return tileY >= playfieldH
}

/**
 * HOLD progress while the tile scrolls through the hit band (0→1).
 * 0 = bottom of tile at hit line (press window); 1 = top at hit line (tile finished).
 * Finger-down until this reaches ~1 — a simple long tap, not a timed short press.
 */
export function holdTileProgress(
  tileY: number,
  tileH: number,
  hitLineY: number,
): number {
  if (tileH <= 0) return 0
  return Math.max(0, Math.min(1, (tileY + tileH - hitLineY) / tileH))
}

/** How many of the 6 star/crown marks are lit (flag is always the midpoint marker). */
export function litMarksFromCombo(combo: number): number {
  if (combo <= 0) return 0
  return Math.min(TOTAL_MARKS, Math.floor(combo / COMBO_PER_MARK))
}

/** Fill width 0–100 for the progress rail. */
export function railFillPct(combo: number): number {
  if (combo <= 0) return 0
  return Math.min(100, (combo / COMBO_FULL_RAIL) * 100)
}

export type RailMarkKind = 'star' | 'flag' | 'crown'

export type RailMark = {
  kind: RailMarkKind
  /** True when this star/crown is earned; flag lights at ≥50% fill. */
  on: boolean
}

/** Marks order matching design-pack: ⭐⭐⭐ ⚑ 👑👑👑 */
export function railMarks(combo: number): RailMark[] {
  const lit = litMarksFromCombo(combo)
  const fill = railFillPct(combo)
  return [
    { kind: 'star', on: lit >= 1 },
    { kind: 'star', on: lit >= 2 },
    { kind: 'star', on: lit >= 3 },
    { kind: 'flag', on: fill >= 50 },
    { kind: 'crown', on: lit >= 4 },
    { kind: 'crown', on: lit >= 5 },
    { kind: 'crown', on: lit >= 6 },
  ]
}
