/**
 * Pointer tap resolution for classic lanes.
 * Prefer the tile under the finger (x+y); fall back to piano-tiles column pick.
 */

export type TapTargetKind = 'bomb' | 'other'

export type TapTargetCandidate = {
  id: number
  kind: TapTargetKind
  /** Visual left edge in playfield space. */
  x: number
  y: number
  w: number
  h: number
  lane: number
}

export type PickTapTargetOpts = {
  tapX: number
  tapY: number
  hitY: number
  /** Extra pad around tile bounds (px). */
  padPx?: number
}

/**
 * Pick which tile a pointer tap should resolve to.
 * 1) If the finger is on a tile sprite → that tile (closest center if overlap).
 * 2) Else if the finger's X overlaps any tile column → lowest overlapping tile.
 * 3) Else null (empty / wrong lane).
 */
export function pickTapTarget(
  candidates: readonly TapTargetCandidate[],
  opts: PickTapTargetOpts,
): TapTargetCandidate | null {
  if (candidates.length === 0) return null
  const pad = opts.padPx ?? 10
  const { tapX, tapY, hitY } = opts

  const underFinger = candidates.filter((t) =>
    pointInBounds(tapX, tapY, t, pad),
  )
  if (underFinger.length === 1) return underFinger[0]!
  if (underFinger.length > 1) {
    return underFinger.slice().sort((a, b) => {
      const da = dist2(tapX, tapY, a.x + a.w / 2, a.y + a.h / 2)
      const db = dist2(tapX, tapY, b.x + b.w / 2, b.y + b.h / 2)
      return da - db
    })[0]!
  }

  const inColumn = candidates.filter(
    (t) => tapX >= t.x - pad && tapX <= t.x + t.w + pad,
  )
  if (inColumn.length === 0) return null

  // Piano-tiles column: resolve to the tile nearest the hit band (lowest action).
  return inColumn.slice().sort((a, b) => {
    const ca = a.y + a.h / 2
    const cb = b.y + b.h / 2
    return Math.abs(ca - hitY) - Math.abs(cb - hitY)
  })[0]!
}

/**
 * Lane-only pick (keyboard). Prefer a non-bomb when both share a lane so a
 * lingering Don't Tap above/below a real note does not steal the key press.
 */
export function pickLaneTarget(
  candidates: readonly TapTargetCandidate[],
  hitY: number,
): TapTargetCandidate | null {
  if (candidates.length === 0) return null
  const safe = candidates.filter((c) => c.kind !== 'bomb')
  const pool = safe.length > 0 ? safe : candidates
  return pool.slice().sort((a, b) => {
    const ca = a.y + a.h / 2
    const cb = b.y + b.h / 2
    return Math.abs(ca - hitY) - Math.abs(cb - hitY)
  })[0]!
}

function pointInBounds(
  x: number,
  y: number,
  t: TapTargetCandidate,
  pad: number,
): boolean {
  return (
    x >= t.x - pad &&
    x <= t.x + t.w + pad &&
    y >= t.y - pad &&
    y <= t.y + t.h + pad
  )
}

function dist2(x0: number, y0: number, x1: number, y1: number): number {
  const dx = x0 - x1
  const dy = y0 - y1
  return dx * dx + dy * dy
}
