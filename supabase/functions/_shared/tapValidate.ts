/**
 * Server tap revalidation vs chart note times (G13 Daily).
 * Chart clock is authoritative — mirrors client hit windows from playfieldTheme.
 */

import { SCORE_GREAT, SCORE_PERFECT } from './scoring.ts'

export type TapInput = {
  t: number
  lane: number
}

export type ChartNoteLite = {
  t: number
  lane: number
  type: string
  length?: number
  endLane?: number
  foot?: number
  span?: number
}

/** Match client: HIT_WINDOW_TILES * tileHeight / heightsPerSec */
export const GREAT_WINDOW_SEC = (0.85 * 0.14) / 0.72
/** Match client: PERFECT_WINDOW_TILES * tileHeight / heightsPerSec */
export const PERFECT_WINDOW_SEC = (0.28 * 0.14) / 0.72

export type ValidateResult = {
  ok: boolean
  serverScore: number
  perfects: number
  goods: number
  misses: number
  matched: number
  expected: number
  reason?: string
}

function expectedHitTime(note: ChartNoteLite): number {
  const holdLike = new Set(['hold', 'long_hold', 'l_hook', 'fake_gap'])
  if (holdLike.has(note.type) && typeof note.length === 'number') {
    return note.t + note.length
  }
  return note.t
}

function lanesForNote(note: ChartNoteLite): number[] {
  if (note.type === 'bridge') {
    return [note.lane, note.lane + 1]
  }
  if (note.type === 'triple') {
    return [note.lane, note.lane + 1, note.lane + 2]
  }
  if (note.type === 'slide' && typeof note.endLane === 'number') {
    return [note.endLane]
  }
  if (note.type === 'l_hook' && typeof note.foot === 'number') {
    return [note.lane] // stem completion; foot is separate press
  }
  return [note.lane]
}

/** Scorable notes only (bombs are fail-on-tap, not scored). */
export function scorableNotes(notes: ChartNoteLite[]): ChartNoteLite[] {
  return notes.filter((n) => n.type !== 'bomb')
}

export function validateTapsAgainstChart(
  notes: ChartNoteLite[],
  taps: TapInput[],
  clientScore: number,
): ValidateResult {
  const allScorable = scorableNotes(notes)
  // Scope to notes reachable in this run so mid-chart fails can still board.
  const maxTapT =
    taps.length > 0 ? Math.max(...taps.map((t) => t.t)) : Number.POSITIVE_INFINITY
  const horizon = Number.isFinite(maxTapT)
    ? maxTapT + GREAT_WINDOW_SEC
    : Number.POSITIVE_INFINITY
  const expected = allScorable.filter((n) => expectedHitTime(n) <= horizon)

  const used = new Set<number>()
  let perfects = 0
  let goods = 0
  let serverScore = 0
  let matched = 0

  for (const note of expected) {
    const wantT = expectedHitTime(note)
    const lanes = new Set(lanesForNote(note))
    let bestIdx = -1
    let bestAbs = Infinity
    let bestGrade: 'perfect' | 'great' | null = null

    for (let i = 0; i < taps.length; i++) {
      if (used.has(i)) continue
      const tap = taps[i]
      if (!lanes.has(tap.lane)) continue
      const abs = Math.abs(tap.t - wantT)
      if (abs > GREAT_WINDOW_SEC) continue
      if (abs < bestAbs) {
        bestAbs = abs
        bestIdx = i
        bestGrade = abs <= PERFECT_WINDOW_SEC ? 'perfect' : 'great'
      }
    }

    if (bestIdx >= 0 && bestGrade) {
      used.add(bestIdx)
      matched += 1
      if (bestGrade === 'perfect') {
        perfects += 1
        serverScore += SCORE_PERFECT
      } else {
        goods += 1
        serverScore += SCORE_GREAT
      }
    }
  }

  const misses = Math.max(0, expected.length - matched)

  // Cheat guard: allow gold×2 fantasy + one perfect slack; reject gross inflation
  if (clientScore > serverScore * 2 + SCORE_PERFECT) {
    return {
      ok: false,
      serverScore,
      perfects,
      goods,
      misses,
      matched,
      expected: expected.length,
      reason: 'client_score_exceeds_validated',
    }
  }

  // Within the run horizon, require meaningful tap coverage (anti empty-payload).
  if (expected.length > 0 && matched / expected.length < 0.35) {
    return {
      ok: false,
      serverScore,
      perfects,
      goods,
      misses,
      matched,
      expected: expected.length,
      reason: 'insufficient_matched_taps',
    }
  }

  if (matched === 0 && clientScore > 0) {
    return {
      ok: false,
      serverScore,
      perfects,
      goods,
      misses,
      matched,
      expected: expected.length,
      reason: 'no_matched_taps',
    }
  }

  return {
    ok: true,
    serverScore,
    perfects,
    goods,
    misses,
    matched,
    expected: expected.length,
  }
}
