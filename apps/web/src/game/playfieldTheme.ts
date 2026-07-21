/** Playfield look — matches docs/beat-pitch.html + design tokens (sky→lavender, not dark stage). */

export const PLAYFIELD = {
  /** soft sky → lavender stops (165deg feel approximated as vertical) */
  gradient: [
    { offset: 0, color: 0xc4b0f0 },
    { offset: 0.42, color: 0x8ec8ff },
    { offset: 0.7, color: 0xa8d4ff },
    { offset: 1, color: 0xd4b8f5 },
  ] as const,
  laneRule: 0xffffff,
  laneRuleAlpha: 0.55,
  hitLine: 0xffffff,
  tile: 0x0d0d12,
  tileInsetHighlight: 0xffffff,
  /** Hit band Y as fraction from top (beat-pitch hit-line at bottom: 18%). */
  hitLineY: 0.82,
  /** Tile height as fraction of playfield height. */
  tileHeight: 0.14,
  /** Tile width inset within lane (left/right 8% → 84% wide). */
  tileInsetX: 0.08,
  lanes: 4,
} as const

export const SCROLL = {
  /** Base scroll speed in playfield-heights per second. */
  heightsPerSec: 0.72,
  /** Spawn cadence at start (ms). */
  spawnMs: 720,
  minSpawnMs: 480,
} as const

/**
 * Legacy spatial half-window (fraction of tile height) for `withinHitWindow`.
 * Tap acceptance / auto-miss use on-screen visibility in classicPlayfield.
 */
export const HIT_WINDOW_TILES = 0.85

/** PERFECT if |tileCenterY - hitLineY| < this fraction of tile height. */
export const PERFECT_WINDOW_TILES = 0.28
