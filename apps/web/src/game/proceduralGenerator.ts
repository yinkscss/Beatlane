/**
 * Procedural Classic endless note stream.
 * Prefers waveform onsets when available; falls back to beat-locked BPM grid.
 * Never emits triple/four-lane walls or hold/long_hold tiles.
 */

import type { ChartNote } from '@/charts/schema'
import type { Onset } from '@/audio/onsets'
import { beatSecForBpm, gapSecForBeats, nextBeatChartTime } from '@/game/beatGrid'
import type { DifficultyProfile } from '@/game/difficultyProfiles'
import { speedMultForLoop } from '@/game/songLoops'

export type ProceduralSeed = number

/** Mulberry32 — tiny deterministic PRNG. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type BeatGridConfig = {
  bpm: number
  offsetSec: number
  musicFilePosSec: number
}

export type GeneratorState = {
  nextT: number
  lastLane: number
  rng: () => number
  profile: DifficultyProfile
  notesEmitted: number
  /** Bed tempo — required for beat-locked gaps / fairness floor. */
  bpm: number
  offsetSec: number
  musicFilePosSec: number
  /** File-time onsets; empty → BPM-grid fallback. */
  onsets: Onset[]
  fileDurationSec: number
  onsetIdx: number
  /** Completed song loops (0 = first pass). */
  loopIndex: number
  /** Chart time when the current loop's file t=0 maps to. */
  loopAnchorChartT: number
  /** Last emitted note chart time (gap floor). */
  lastEmitT: number
  /** Remaining zig-zag steps after a ladder start (0 = idle). */
  zigLeft: number
  zigLaneA: number
  zigLaneB: number
  zigFlip: boolean
}

export function createGeneratorState(
  profile: DifficultyProfile,
  seed: ProceduralSeed = Date.now(),
  grid: BeatGridConfig = { bpm: 120, offsetSec: 0, musicFilePosSec: 0 },
): GeneratorState {
  const nextT = nextBeatChartTime({
    bpm: grid.bpm,
    offsetSec: grid.offsetSec,
    musicFilePosSec: grid.musicFilePosSec,
    minChartT: 0.35,
  })
  return {
    nextT,
    lastLane: 1,
    rng: createRng(seed),
    profile,
    notesEmitted: 0,
    bpm: grid.bpm,
    offsetSec: grid.offsetSec,
    musicFilePosSec: grid.musicFilePosSec,
    onsets: [],
    fileDurationSec: 0,
    onsetIdx: 0,
    loopIndex: 0,
    loopAnchorChartT: 0,
    lastEmitT: -1,
    zigLeft: 0,
    zigLaneA: 0,
    zigLaneB: 1,
    zigFlip: false,
  }
}

/** Attach (or replace) waveform onsets for this run. */
export function setGeneratorOnsets(
  state: GeneratorState,
  onsets: Onset[],
  fileDurationSec: number,
): void {
  state.onsets = onsets
  state.fileDurationSec = Math.max(0, fileDurationSec)
  state.onsetIdx = 0
  state.loopIndex = 0
  state.loopAnchorChartT = 0
  // Start from the first onset at/after a short lead-in.
  if (onsets.length) {
    let i = 0
    while (i < onsets.length && onsets[i]!.t < 0.35) i++
    state.onsetIdx = Math.min(i, onsets.length)
    state.nextT =
      onsets.length && i < onsets.length
        ? chartTForOnset(state, i)
        : 0.35
  }
}

/**
 * Re-phase the stream to the live bed (beginRun / post-revive / loop boundary).
 * When onsets are active, maps file playhead → onset cursor + loop anchor.
 */
export function syncGeneratorToMusic(
  state: GeneratorState,
  grid: BeatGridConfig,
  minChartT = 0.35,
): void {
  state.bpm = grid.bpm
  state.offsetSec = grid.offsetSec
  state.musicFilePosSec = grid.musicFilePosSec

  if (state.onsets.length && state.fileDurationSec > 1) {
    const filePos = ((grid.musicFilePosSec % state.fileDurationSec) +
      state.fileDurationSec) %
      state.fileDurationSec
    // Keep current loopIndex; re-anchor so file t=0 maps correctly.
    // At beginRun loopIndex is 0 and loopAnchor is 0 — filePos is where music is.
    // Chart t for a file time f: loopAnchor + (f - 0) / rate, but we started mid-file.
    // Simpler: find next onset at/after filePos and set nextT from minChartT.
    let i = 0
    while (i < state.onsets.length && state.onsets[i]!.t < filePos - 1e-4) {
      i++
    }
    if (i >= state.onsets.length) {
      // Past last onset this loop — wrap to next loop.
      state.loopIndex += 1
      const rate = speedMultForLoop(
        state.loopIndex - 1,
        state.profile.maxSpeedMult,
      )
      const remain = Math.max(0, state.fileDurationSec - filePos)
      state.loopAnchorChartT = minChartT + remain / rate
      state.onsetIdx = 0
      state.nextT = Math.max(minChartT, chartTForOnset(state, 0))
    } else {
      state.onsetIdx = i
      const rate = speedMultForLoop(state.loopIndex, state.profile.maxSpeedMult)
      // Chart time of this onset relative to current file playhead at chart=minChartT.
      const fileDelta = state.onsets[i]!.t - filePos
      state.nextT = Math.max(minChartT, minChartT + fileDelta / rate)
      // Anchor so chartTForOnset stays consistent for subsequent onsets.
      state.loopAnchorChartT =
        state.nextT - state.onsets[i]!.t / rate
    }
    return
  }

  const aligned = nextBeatChartTime({
    bpm: grid.bpm,
    offsetSec: grid.offsetSec,
    musicFilePosSec: grid.musicFilePosSec,
    minChartT,
  })
  if (aligned >= state.nextT - 1e-6) {
    state.nextT = aligned
  } else {
    const beatSec = beatSecForBpm(grid.bpm)
    let t = aligned
    while (t < state.nextT - 1e-6) t += beatSec
    state.nextT = t
  }
}

/**
 * Absolute loop sync after the playfield levels up.
 * `loopIndex` is completed loops (same as playfield.loopsCompleted).
 * Does not increment — foresight wrap in pullNotes may already be here.
 */
export function advanceGeneratorLoop(
  state: GeneratorState,
  loopIndex: number,
  loopAnchorChartT: number,
): void {
  state.loopIndex = Math.max(0, Math.floor(loopIndex))
  state.loopAnchorChartT = loopAnchorChartT
  state.onsetIdx = 0
  state.zigLeft = 0
  if (state.onsets.length) {
    state.nextT = Math.max(loopAnchorChartT, chartTForOnset(state, 0))
  }
}

function chartTForOnset(state: GeneratorState, idx: number): number {
  const o = state.onsets[idx]
  if (!o) return state.loopAnchorChartT
  const rate = speedMultForLoop(state.loopIndex, state.profile.maxSpeedMult)
  return state.loopAnchorChartT + o.t / Math.max(0.05, rate)
}

function pickLane(rng: () => number, last: number, avoid?: number): number {
  const lanes = [0, 1, 2, 3].filter((l) => l !== avoid)
  // Prefer adjacent / nearby for fair thumb travel; allow jumps later via rng.
  if (rng() < 0.65) {
    const near = lanes.filter((l) => Math.abs(l - last) <= 1)
    if (near.length) return near[Math.floor(rng() * near.length)]!
  }
  return lanes[Math.floor(rng() * lanes.length)]!
}

/** Left thumb {0,1} + right thumb {2,3}. */
function pickDoubleLanes(rng: () => number): [number, number] {
  const left = rng() < 0.5 ? 0 : 1
  const right = rng() < 0.5 ? 2 : 3
  return [left, right]
}

function pickAdjacentPair(rng: () => number, last: number): [number, number] {
  const starts = [0, 1, 2]
  let a = starts[Math.floor(rng() * starts.length)]!
  if (rng() < 0.7 && last >= 0 && last <= 2) a = Math.min(2, Math.max(0, last))
  return [a, a + 1]
}

function gapSec(state: GeneratorState, speedMult: number): number {
  return gapSecForBeats({
    bpm: state.bpm,
    speedMult,
    baseGapBeats: state.profile.baseGapBeats,
    minGapBeats: state.profile.minGapBeats,
  })
}

function minGapChartSec(state: GeneratorState, speedMult: number): number {
  const beatSec = beatSecForBpm(state.bpm)
  return Math.max(0.18, (state.profile.minGapBeats * beatSec) / Math.max(1, speedMult))
}

/**
 * Strength threshold for emitting a tile.
 * Onsets are normalized to the track's global p95, so quiet verses sit ~0.1–0.3
 * while drops hit ~1.0. A high floor (e.g. 0.55) blanks the whole intro —
 * keep this low; the gap floor already caps unplayable density.
 */
function strengthThreshold(speedMult: number): number {
  return Math.max(0.08, 0.14 - (speedMult - 1) * 0.03)
}

function emitSingle(
  state: GeneratorState,
  t: number,
  aggressive: boolean,
): ChartNote {
  const lane = pickLane(state.rng, state.lastLane)
  const modRoll = state.rng()
  const note: ChartNote =
    aggressive && modRoll < 0.08
      ? { t, lane: lane as 0 | 1 | 2 | 3, type: 'tap', mod: 'gold' }
      : aggressive && modRoll < 0.14
        ? { t, lane: lane as 0 | 1 | 2 | 3, type: 'tap', mod: 'ice' }
        : { t, lane: lane as 0 | 1 | 2 | 3, type: 'tap' }
  state.lastLane = lane
  state.notesEmitted += 1
  return note
}

function pullNotesOnsets(
  state: GeneratorState,
  untilT: number,
  speedMult: number,
): ChartNote[] {
  const out: ChartNote[] = []
  const aggressive = speedMult >= state.profile.aggressiveAtMult
  const gapFloor = minGapChartSec(state, speedMult)
  const thresh = strengthThreshold(speedMult)
  const maxLoops = 64 // safety: don't infinite-loop empty/sparse tracks
  /** Force a single after this many consecutive strength skips — never go blank. */
  const maxStrengthSkips = 3
  let strengthSkips = 0

  let guard = 0
  while (guard++ < 5000) {
    if (state.onsetIdx >= state.onsets.length) {
      // Wrap to next file loop.
      if (state.fileDurationSec <= 1 || state.onsets.length === 0) break
      const rate = speedMultForLoop(state.loopIndex, state.profile.maxSpeedMult)
      const nextAnchor =
        state.loopAnchorChartT + state.fileDurationSec / Math.max(0.05, rate)
      if (nextAnchor > untilT + 0.01) {
        state.nextT = nextAnchor
        break
      }
      state.loopIndex += 1
      state.loopAnchorChartT = nextAnchor
      state.onsetIdx = 0
      state.zigLeft = 0
      if (state.loopIndex > maxLoops) break
      continue
    }

    const t = chartTForOnset(state, state.onsetIdx)
    if (t > untilT) {
      state.nextT = t
      break
    }

    const onset = state.onsets[state.onsetIdx]!
    state.onsetIdx += 1

    if (state.lastEmitT >= 0 && t - state.lastEmitT < gapFloor) {
      continue
    }
    if (onset.strength < thresh && state.zigLeft <= 0) {
      strengthSkips += 1
      if (strengthSkips < maxStrengthSkips) continue
      // Fall through: emit a single so quiet stretches still have tiles.
    }
    strengthSkips = 0

    // Zig-zag continuation consumes consecutive accepted onsets.
    if (state.zigLeft > 0) {
      const lane = state.zigFlip ? state.zigLaneB : state.zigLaneA
      state.zigFlip = !state.zigFlip
      state.zigLeft -= 1
      out.push({ t, lane: lane as 0 | 1 | 2 | 3, type: 'tap' })
      state.lastLane = lane
      state.notesEmitted += 1
      state.lastEmitT = t
      state.nextT = t + gapFloor
      continue
    }

    const roll = state.rng()
    const strong = onset.strength >= 0.72

    if (aggressive && strong && roll < 0.14) {
      // Simultaneous double — left thumb + right thumb.
      const [a, b] = pickDoubleLanes(state.rng)
      out.push({ t, lane: a as 0 | 1 | 2 | 3, type: 'tap' })
      out.push({ t, lane: b as 0 | 1 | 2 | 3, type: 'tap' })
      state.lastLane = b
      state.notesEmitted += 2
      state.lastEmitT = t
    } else if (aggressive && strong && roll < 0.28) {
      // Zig-zag ladder start (3–6 taps across following onsets).
      const [a, b] = pickAdjacentPair(state.rng, state.lastLane)
      const len = 3 + Math.floor(state.rng() * 4)
      state.zigLaneA = a
      state.zigLaneB = b
      state.zigFlip = true
      state.zigLeft = len - 1
      out.push({ t, lane: a as 0 | 1 | 2 | 3, type: 'tap' })
      state.lastLane = a
      state.notesEmitted += 1
      state.lastEmitT = t
    } else if (aggressive && roll < 0.38 && strong) {
      const start = state.rng() < 0.5 ? 0 : 1
      const bridgeLane = Math.min(2, start + (state.rng() < 0.5 ? 0 : 1)) as
        | 0
        | 1
        | 2
      out.push({ t, lane: bridgeLane, type: 'bridge' })
      state.lastLane = bridgeLane
      state.notesEmitted += 1
      state.lastEmitT = t
    } else if (aggressive && roll < 0.48) {
      const lane = pickLane(state.rng, state.lastLane)
      const bombLane = pickLane(state.rng, lane, lane)
      out.push({ t, lane: lane as 0 | 1 | 2 | 3, type: 'tap' })
      out.push({ t, lane: bombLane as 0 | 1 | 2 | 3, type: 'bomb' })
      state.lastLane = lane
      state.notesEmitted += 2
      state.lastEmitT = t
    } else if (roll < 0.06) {
      out.push({
        t,
        lane: pickLane(state.rng, state.lastLane) as 0 | 1 | 2 | 3,
        type: 'bomb',
      })
      state.notesEmitted += 1
      state.lastEmitT = t
    } else {
      out.push(emitSingle(state, t, aggressive))
      state.lastEmitT = t
    }

    state.nextT = t + gapFloor
  }

  return out
}

function pullNotesBeatGrid(
  state: GeneratorState,
  untilT: number,
  speedMult: number,
): ChartNote[] {
  const out: ChartNote[] = []
  const aggressive = speedMult >= state.profile.aggressiveAtMult
  const eighth = beatSecForBpm(state.bpm) * 0.5

  while (state.nextT <= untilT) {
    const t = state.nextT
    const roll = state.rng()

    if (aggressive && roll < 0.1) {
      // Simultaneous double — left + right thumbs.
      const [a, b] = pickDoubleLanes(state.rng)
      out.push({ t, lane: a as 0 | 1 | 2 | 3, type: 'tap' })
      out.push({ t, lane: b as 0 | 1 | 2 | 3, type: 'tap' })
      state.lastLane = b
      state.notesEmitted += 2
    } else if (aggressive && roll < 0.2) {
      // Staggered double on beat + eighth — never a 3+ wall
      const laneA = pickLane(state.rng, state.lastLane)
      let laneB = pickLane(state.rng, laneA, laneA)
      if (laneB === laneA) laneB = (laneA + 1) % 4
      out.push({ t, lane: laneA as 0 | 1 | 2 | 3, type: 'tap' })
      out.push({
        t: t + eighth,
        lane: laneB as 0 | 1 | 2 | 3,
        type: 'tap',
      })
      state.lastLane = laneB
      state.notesEmitted += 2
    } else if (aggressive && roll < 0.3) {
      // Zig-zag: three taps alternating adjacent lanes on eighths.
      const [a, b] = pickAdjacentPair(state.rng, state.lastLane)
      out.push({ t, lane: a as 0 | 1 | 2 | 3, type: 'tap' })
      out.push({ t: t + eighth, lane: b as 0 | 1 | 2 | 3, type: 'tap' })
      out.push({
        t: t + eighth * 2,
        lane: a as 0 | 1 | 2 | 3,
        type: 'tap',
      })
      state.lastLane = a
      state.notesEmitted += 3
    } else if (aggressive && roll < 0.38) {
      const lane = state.rng() < 0.5 ? 0 : 1
      const start = lane + (state.rng() < 0.5 ? 0 : 1)
      const bridgeLane = Math.min(2, start) as 0 | 1 | 2
      out.push({ t, lane: bridgeLane, type: 'bridge' })
      state.lastLane = bridgeLane
      state.notesEmitted += 1
    } else if (aggressive && roll < 0.46) {
      // Trap: safe tap + Don't Tap on the same beat
      const lane = pickLane(state.rng, state.lastLane)
      const bombLane = pickLane(state.rng, lane, lane)
      out.push({ t, lane: lane as 0 | 1 | 2 | 3, type: 'tap' })
      out.push({
        t,
        lane: bombLane as 0 | 1 | 2 | 3,
        type: 'bomb',
      })
      state.lastLane = lane
      state.notesEmitted += 2
    } else if (roll < 0.06) {
      out.push({
        t,
        lane: pickLane(state.rng, state.lastLane) as 0 | 1 | 2 | 3,
        type: 'bomb',
      })
      state.notesEmitted += 1
    } else {
      out.push(emitSingle(state, t, aggressive))
    }

    state.lastEmitT = out[out.length - 1]?.t ?? t
    state.nextT = t + gapSec(state, speedMult)
    if (out.length >= 2 && out[out.length - 1]!.t > t) {
      state.nextT = out[out.length - 1]!.t + gapSec(state, speedMult)
    }
  }

  return out
}

/**
 * Emit notes due at or before `untilT` (lead foresight handled by caller).
 * Uses waveform onsets when set; otherwise the bed beat grid.
 */
export function pullNotes(
  state: GeneratorState,
  untilT: number,
  speedMult: number,
): ChartNote[] {
  if (state.onsets.length > 0 && state.fileDurationSec > 1) {
    return pullNotesOnsets(state, untilT, speedMult)
  }
  return pullNotesBeatGrid(state, untilT, speedMult)
}

/** Assert generator never produces illegal patterns (for tests). */
export function assertLegalNotes(notes: ChartNote[]): void {
  for (const n of notes) {
    if (n.type === 'triple' || n.type === 'l_hook' || n.type === 'fake_gap') {
      throw new Error(`Illegal procedural note type: ${n.type}`)
    }
    if (n.type === 'bridge' && n.lane > 2) {
      throw new Error('Bridge would overflow lanes')
    }
  }
  const byT = new Map<number, ChartNote[]>()
  for (const n of notes) {
    const list = byT.get(n.t) ?? []
    list.push(n)
    byT.set(n.t, list)
  }
  for (const [t, group] of byT) {
    let covered = 0
    for (const n of group) {
      if (n.type === 'bridge') covered += 2
      else covered += 1
    }
    if (covered > 2) {
      throw new Error(`t=${t} covers ${covered} lanes (max 2 simultaneous)`)
    }
  }
}
