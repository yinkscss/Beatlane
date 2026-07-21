/** Beatlane chart schema v1 — see `public/charts/SCHEMA.md`. */

export const CHART_SCHEMA_VERSION = 1 as const

/** Obstacle banner display window (seconds). */
export const BANNER_DURATION_MIN = 3
export const BANNER_DURATION_MAX = 8
export const BANNER_DURATION_DEFAULT = 4

export type ChartDifficulty = 'easy' | 'normal' | 'hard'

/** Optional per-note visual/score modifier (G11). */
export type ChartNoteMod = 'ice' | 'gold'

/** G5 tap; G6 bomb; G11 hard shapes. (No hold / long_hold — removed.) */
export type ChartNoteType =
  | 'tap'
  | 'bomb'
  | 'bridge'
  | 'triple'
  | 'l_hook'
  | 'fake_gap'
  | 'slide'

export type ChartTapNote = {
  t: number
  lane: 0 | 1 | 2 | 3
  type: 'tap'
  mod?: ChartNoteMod
}

export type ChartBombNote = {
  t: number
  lane: 0 | 1 | 2 | 3
  type: 'bomb'
  mod?: ChartNoteMod
}

/** 2-wide bar; `lane` is leftmost. */
export type ChartBridgeNote = {
  t: number
  lane: 0 | 1 | 2
  type: 'bridge'
  mod?: ChartNoteMod
}

/** 3-wide bar; `lane` is leftmost (0 or 1). */
export type ChartTripleNote = {
  t: number
  lane: 0 | 1
  type: 'triple'
  mod?: ChartNoteMod
}

/** Vertical stem + foot into neighbor. */
export type ChartLHookNote = {
  t: number
  lane: 0 | 1 | 2 | 3
  type: 'l_hook'
  /** Foot direction relative to stem lane. */
  foot: -1 | 1
  length: number
  mod?: ChartNoteMod
}

/**
 * Long tile with a white “don’t tap” gap mid-body.
 * Hold black segments only; re-press after the gap.
 */
export type ChartFakeGapNote = {
  t: number
  lane: 0 | 1 | 2 | 3
  type: 'fake_gap'
  length: number
  /** Gap start as fraction of length (0–1). Default 0.4. */
  gapAt?: number
  /** Gap length as fraction of hold length. Default 0.2. */
  gapLen?: number
  mod?: ChartNoteMod
}

/** Starts in `lane`, slides to `endLane` before the hit line. */
export type ChartSlideNote = {
  t: number
  lane: 0 | 1 | 2 | 3
  type: 'slide'
  endLane: 0 | 1 | 2 | 3
  mod?: ChartNoteMod
}

export type ChartNote =
  | ChartTapNote
  | ChartBombNote
  | ChartBridgeNote
  | ChartTripleNote
  | ChartLHookNote
  | ChartFakeGapNote
  | ChartSlideNote

export type ChartSpeedUpEvent = {
  t: number
  type: 'speed_up'
  /** Scroll rate multiplier applied after banner + countdown. Default 1.35. */
  mult?: number
}

/** G6 basic + G11 hard/modifier banners. */
export type ChartObstacleEventType =
  | 'dont_tap'
  | 'double'
  | 'ice'
  | 'gold'
  | 'fog'
  | 'reverse'
  | 'bridge'
  | 'triple'
  | 'l_hook'
  | 'zig'
  | 'split'
  | 'fake_gap'
  | 'slide'
  | 'cascade'
  | 'trap_double'

export type ChartObstacleEvent = {
  t: number
  type: ChartObstacleEventType
  /** Banner seconds; clamped to 3–8. Default 4. */
  duration?: number
}

export type ChartEvent = ChartSpeedUpEvent | ChartObstacleEvent

export type Chart = {
  schemaVersion: typeof CHART_SCHEMA_VERSION
  id: string
  title: string
  difficulty: ChartDifficulty
  bpm: number
  /** Seconds added to music clock before comparing note/event times. */
  offset: number
  audio: string
  /** Optional override for base scroll (playfield heights / sec). */
  scrollHeightsPerSec?: number
  notes: ChartNote[]
  events: ChartEvent[]
}

const OBSTACLE_EVENT_TYPES = new Set<string>([
  'dont_tap',
  'double',
  'ice',
  'gold',
  'fog',
  'reverse',
  'bridge',
  'triple',
  'l_hook',
  'zig',
  'split',
  'fake_gap',
  'slide',
  'cascade',
  'trap_double',
])

export function isLane(n: unknown): n is 0 | 1 | 2 | 3 {
  return n === 0 || n === 1 || n === 2 || n === 3
}

export function clampBannerDuration(sec: number | undefined): number {
  const v = sec === undefined ? BANNER_DURATION_DEFAULT : sec
  return Math.min(BANNER_DURATION_MAX, Math.max(BANNER_DURATION_MIN, v))
}

function parseMod(raw: unknown, i: number): ChartNoteMod | undefined {
  if (raw === undefined) return undefined
  if (raw === 'ice' || raw === 'gold') return raw
  throw new Error(`Chart: note[${i}].mod must be ice|gold`)
}

function requireLength(note: Record<string, unknown>, i: number): number {
  if (typeof note.length !== 'number' || !(note.length > 0)) {
    throw new Error(`Chart: note[${i}].length required`)
  }
  return note.length
}

/** Lanes a note occupies at chart time `t` (bridge=2, triple=3, l_hook=stem+foot). */
export function lanesCoveredByNote(note: ChartNote): number[] {
  if (note.type === 'bridge') return [note.lane, note.lane + 1]
  if (note.type === 'triple') return [note.lane, note.lane + 1, note.lane + 2]
  if (note.type === 'l_hook') return [note.lane, note.lane + note.foot]
  return [note.lane]
}

/** True when notes at the same `t` would cover all 4 lanes. */
export function coversAllFourLanesAtSameT(notes: ChartNote[]): boolean {
  const byT = new Map<number, Set<number>>()
  for (const note of notes) {
    let set = byT.get(note.t)
    if (!set) {
      set = new Set()
      byT.set(note.t, set)
    }
    for (const lane of lanesCoveredByNote(note)) set.add(lane)
    if (set.size >= 4) return true
  }
  return false
}

function assertMaxLaneCover(notes: ChartNote[]) {
  const byT = new Map<number, Set<number>>()
  for (const note of notes) {
    let set = byT.get(note.t)
    if (!set) {
      set = new Set()
      byT.set(note.t, set)
    }
    for (const lane of lanesCoveredByNote(note)) set.add(lane)
    if (set.size > 3) {
      throw new Error(
        `Chart: at most 3 lanes may be covered at the same t (t=${note.t})`,
      )
    }
  }
}

/** Lightweight runtime validation for fetched JSON. */
export function parseChart(raw: unknown): Chart {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Chart: expected object')
  }
  const o = raw as Record<string, unknown>

  if (o.schemaVersion !== CHART_SCHEMA_VERSION) {
    throw new Error(`Chart: unsupported schemaVersion ${String(o.schemaVersion)}`)
  }
  if (typeof o.id !== 'string' || !o.id) throw new Error('Chart: id required')
  if (typeof o.title !== 'string') throw new Error('Chart: title required')
  if (o.difficulty !== 'easy' && o.difficulty !== 'normal' && o.difficulty !== 'hard') {
    throw new Error('Chart: invalid difficulty')
  }
  if (typeof o.bpm !== 'number' || !(o.bpm > 0)) throw new Error('Chart: bpm required')
  if (typeof o.offset !== 'number') throw new Error('Chart: offset required')
  if (typeof o.audio !== 'string' || !o.audio) throw new Error('Chart: audio required')

  if (!Array.isArray(o.notes)) throw new Error('Chart: notes array required')
  if (!Array.isArray(o.events)) throw new Error('Chart: events array required')

  const notes: ChartNote[] = o.notes.map((n, i) => {
    if (!n || typeof n !== 'object') throw new Error(`Chart: note[${i}] invalid`)
    const note = n as Record<string, unknown>
    if (typeof note.t !== 'number') throw new Error(`Chart: note[${i}].t required`)
    if (!isLane(note.lane)) throw new Error(`Chart: note[${i}].lane must be 0–3`)
    const mod = parseMod(note.mod, i)

    if (note.type === 'tap') {
      return mod ? { t: note.t, lane: note.lane, type: 'tap', mod } : { t: note.t, lane: note.lane, type: 'tap' }
    }
    if (note.type === 'bomb') {
      return mod
        ? { t: note.t, lane: note.lane, type: 'bomb', mod }
        : { t: note.t, lane: note.lane, type: 'bomb' }
    }
    if (note.type === 'bridge') {
      if (note.lane > 2) throw new Error(`Chart: note[${i}] bridge lane must be 0–2`)
      return mod
        ? { t: note.t, lane: note.lane as 0 | 1 | 2, type: 'bridge', mod }
        : { t: note.t, lane: note.lane as 0 | 1 | 2, type: 'bridge' }
    }
    if (note.type === 'triple') {
      if (note.lane > 1) throw new Error(`Chart: note[${i}] triple lane must be 0–1`)
      return mod
        ? { t: note.t, lane: note.lane as 0 | 1, type: 'triple', mod }
        : { t: note.t, lane: note.lane as 0 | 1, type: 'triple' }
    }
    if (note.type === 'l_hook') {
      const length = requireLength(note, i)
      if (note.foot !== -1 && note.foot !== 1) {
        throw new Error(`Chart: note[${i}].foot must be -1|1`)
      }
      const footLane = note.lane + note.foot
      if (!isLane(footLane)) {
        throw new Error(`Chart: note[${i}] l_hook foot out of lanes`)
      }
      return mod
        ? { t: note.t, lane: note.lane, type: 'l_hook', foot: note.foot, length, mod }
        : { t: note.t, lane: note.lane, type: 'l_hook', foot: note.foot, length }
    }
    if (note.type === 'fake_gap') {
      const length = requireLength(note, i)
      const gapAt = note.gapAt === undefined ? 0.4 : note.gapAt
      const gapLen = note.gapLen === undefined ? 0.2 : note.gapLen
      if (typeof gapAt !== 'number' || gapAt < 0 || gapAt >= 1) {
        throw new Error(`Chart: note[${i}].gapAt invalid`)
      }
      if (typeof gapLen !== 'number' || gapLen <= 0 || gapAt + gapLen > 1) {
        throw new Error(`Chart: note[${i}].gapLen invalid`)
      }
      const base = {
        t: note.t,
        lane: note.lane,
        type: 'fake_gap' as const,
        length,
        gapAt,
        gapLen,
      }
      return mod ? { ...base, mod } : base
    }
    if (note.type === 'slide') {
      if (!isLane(note.endLane)) {
        throw new Error(`Chart: note[${i}].endLane must be 0–3`)
      }
      if (note.endLane === note.lane) {
        throw new Error(`Chart: note[${i}] slide endLane must differ`)
      }
      return mod
        ? {
            t: note.t,
            lane: note.lane,
            type: 'slide',
            endLane: note.endLane,
            mod,
          }
        : {
            t: note.t,
            lane: note.lane,
            type: 'slide',
            endLane: note.endLane,
          }
    }
    throw new Error(`Chart: note[${i}].type unsupported`)
  })

  const events: ChartEvent[] = o.events.map((e, i) => {
    if (!e || typeof e !== 'object') throw new Error(`Chart: event[${i}] invalid`)
    const ev = e as Record<string, unknown>
    if (typeof ev.t !== 'number') throw new Error(`Chart: event[${i}].t required`)

    if (ev.type === 'speed_up') {
      const mult = ev.mult
      if (mult !== undefined && (typeof mult !== 'number' || !(mult > 0))) {
        throw new Error(`Chart: event[${i}].mult invalid`)
      }
      return mult === undefined
        ? { t: ev.t, type: 'speed_up' }
        : { t: ev.t, type: 'speed_up', mult }
    }

    if (typeof ev.type === 'string' && OBSTACLE_EVENT_TYPES.has(ev.type)) {
      const duration = ev.duration
      if (
        duration !== undefined &&
        (typeof duration !== 'number' || !(duration > 0))
      ) {
        throw new Error(`Chart: event[${i}].duration invalid`)
      }
      const type = ev.type as ChartObstacleEventType
      return duration === undefined
        ? { t: ev.t, type }
        : { t: ev.t, type, duration }
    }

    throw new Error(`Chart: event[${i}].type unsupported`)
  })

  notes.sort((a, b) => a.t - b.t || a.lane - b.lane)
  events.sort((a, b) => a.t - b.t)
  assertMaxLaneCover(notes)

  const chart: Chart = {
    schemaVersion: CHART_SCHEMA_VERSION,
    id: o.id,
    title: o.title,
    difficulty: o.difficulty,
    bpm: o.bpm,
    offset: o.offset,
    audio: o.audio,
    notes,
    events,
  }

  if (typeof o.scrollHeightsPerSec === 'number' && o.scrollHeightsPerSec > 0) {
    chart.scrollHeightsPerSec = o.scrollHeightsPerSec
  }

  return chart
}
