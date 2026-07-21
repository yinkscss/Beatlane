/** Beatlane chart schema v1 — see `public/charts/SCHEMA.md`. */

export const CHART_SCHEMA_VERSION = 1 as const

export type ChartDifficulty = 'easy' | 'normal' | 'hard'

/** G5 tap notes; G6+ extends with hold / bomb. */
export type ChartNoteType = 'tap'

export type ChartNote = {
  /** Hit time (seconds) on the song clock after `offset`. */
  t: number
  lane: 0 | 1 | 2 | 3
  type: ChartNoteType
}

export type ChartSpeedUpEvent = {
  t: number
  type: 'speed_up'
  /** Scroll rate multiplier applied after banner + countdown. Default 1.35. */
  mult?: number
}

export type ChartEvent = ChartSpeedUpEvent

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

export function isLane(n: unknown): n is 0 | 1 | 2 | 3 {
  return n === 0 || n === 1 || n === 2 || n === 3
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
    if (note.type !== 'tap') throw new Error(`Chart: note[${i}].type unsupported`)
    return { t: note.t, lane: note.lane, type: 'tap' }
  })

  const events: ChartEvent[] = o.events.map((e, i) => {
    if (!e || typeof e !== 'object') throw new Error(`Chart: event[${i}] invalid`)
    const ev = e as Record<string, unknown>
    if (typeof ev.t !== 'number') throw new Error(`Chart: event[${i}].t required`)
    if (ev.type !== 'speed_up') throw new Error(`Chart: event[${i}].type unsupported`)
    const mult = ev.mult
    if (mult !== undefined && (typeof mult !== 'number' || !(mult > 0))) {
      throw new Error(`Chart: event[${i}].mult invalid`)
    }
    return mult === undefined
      ? { t: ev.t, type: 'speed_up' }
      : { t: ev.t, type: 'speed_up', mult }
  })

  notes.sort((a, b) => a.t - b.t)
  events.sort((a, b) => a.t - b.t)

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
