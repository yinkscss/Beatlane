/**
 * Procedural Classic endless note stream.
 * Never emits triple/four-lane walls or hold/long_hold tiles.
 */

import type { ChartNote } from '@/charts/schema'
import type { DifficultyProfile } from '@/game/difficultyProfiles'

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

export type GeneratorState = {
  nextT: number
  lastLane: number
  rng: () => number
  profile: DifficultyProfile
  notesEmitted: number
}

export function createGeneratorState(
  profile: DifficultyProfile,
  seed: ProceduralSeed = Date.now(),
): GeneratorState {
  return {
    nextT: 0.35,
    lastLane: 1,
    rng: createRng(seed),
    profile,
    notesEmitted: 0,
  }
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

function gapFor(speedMult: number, profile: DifficultyProfile): number {
  const g = profile.baseGapSec / Math.max(1, speedMult * 0.92)
  return Math.max(profile.minGapSec, g)
}

/**
 * Emit notes due at or before `songTime` (with lead foresight handled by caller).
 * Returns newly generated notes and mutates state.
 */
export function pullNotes(
  state: GeneratorState,
  untilT: number,
  speedMult: number,
): ChartNote[] {
  const out: ChartNote[] = []
  const aggressive = speedMult >= state.profile.aggressiveAtMult

  while (state.nextT <= untilT) {
    const t = state.nextT
    const roll = state.rng()

    if (aggressive && roll < 0.12) {
      // Staggered double: two taps close in time, different lanes (never same beat wall of 3+)
      const laneA = pickLane(state.rng, state.lastLane)
      let laneB = pickLane(state.rng, laneA, laneA)
      if (laneB === laneA) laneB = (laneA + 1) % 4
      out.push({ t, lane: laneA as 0 | 1 | 2 | 3, type: 'tap' })
      out.push({
        t: t + 0.08,
        lane: laneB as 0 | 1 | 2 | 3,
        type: 'tap',
      })
      state.lastLane = laneB
      state.notesEmitted += 2
    } else if (aggressive && roll < 0.2) {
      // Bridge (2-wide) — fair; never triple
      const lane = state.rng() < 0.5 ? 0 : 1
      const start = lane + (state.rng() < 0.5 ? 0 : 1)
      const bridgeLane = Math.min(2, start) as 0 | 1 | 2
      out.push({ t, lane: bridgeLane, type: 'bridge' })
      state.lastLane = bridgeLane
      state.notesEmitted += 1
    } else if (aggressive && roll < 0.28) {
      // Fake / bomb distraction in empty lane + real tap
      const lane = pickLane(state.rng, state.lastLane)
      const bombLane = pickLane(state.rng, lane, lane)
      out.push({ t, lane: lane as 0 | 1 | 2 | 3, type: 'tap' })
      out.push({
        t: t + 0.02,
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
      const lane = pickLane(state.rng, state.lastLane)
      const modRoll = state.rng()
      const note: ChartNote =
        aggressive && modRoll < 0.08
          ? { t, lane: lane as 0 | 1 | 2 | 3, type: 'tap', mod: 'gold' }
          : aggressive && modRoll < 0.14
            ? { t, lane: lane as 0 | 1 | 2 | 3, type: 'tap', mod: 'ice' }
            : { t, lane: lane as 0 | 1 | 2 | 3, type: 'tap' }
      out.push(note)
      state.lastLane = lane
      state.notesEmitted += 1
    }

    state.nextT = t + gapFor(speedMult, state.profile)
    // Staggered double already advanced conceptually; ensure next gap from last note
    if (out.length >= 2 && out[out.length - 1]!.t > t) {
      state.nextT = out[out.length - 1]!.t + gapFor(speedMult, state.profile)
    }
  }

  return out
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
  // Same timestamp: at most 2 lanes covered
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
