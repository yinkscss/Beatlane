/**
 * Tournament Blitz fair-obstacle whitelist (G16 enforced).
 * Fair subset examples: Speed Up, Hold, Bridge.
 * Banned: Reverse, Fog, Fake Gap (stripped via sanitizeBlitzChart).
 */

import type { ChartObstacleEventType, ChartNoteType } from '@/charts/schema'

/** Obstacle / modifier event types banned from tournament Blitz. */
export const BLITZ_BANNED_EVENTS = [
  'reverse',
  'fog',
  'fake_gap',
] as const satisfies readonly ChartObstacleEventType[]

export type BlitzBannedEvent = (typeof BLITZ_BANNED_EVENTS)[number]

/** Note shapes that must not appear in Blitz charts. */
export const BLITZ_BANNED_NOTES = ['fake_gap'] as const satisfies readonly ChartNoteType[]

export type BlitzBannedNote = (typeof BLITZ_BANNED_NOTES)[number]

const BANNED_EVENT_SET = new Set<string>(BLITZ_BANNED_EVENTS)
const BANNED_NOTE_SET = new Set<string>(BLITZ_BANNED_NOTES)

export function isBlitzBannedEvent(type: string): boolean {
  return BANNED_EVENT_SET.has(type)
}

export function isBlitzBannedNote(type: string): boolean {
  return BANNED_NOTE_SET.has(type)
}

/** True when a chart uses any Blitz-banned obstacle (for validators / G16). */
export function chartHasBlitzBannedContent(chart: {
  notes: { type: string }[]
  events: { type: string }[]
}): boolean {
  return (
    chart.notes.some((n) => isBlitzBannedNote(n.type)) ||
    chart.events.some((e) => isBlitzBannedEvent(e.type))
  )
}

/**
 * Strip banned Reverse / Fog / Fake Gap content for tournament Blitz.
 * Fair subset remains (Speed Up, Hold, Bridge, etc.).
 */
export function sanitizeBlitzChart<T extends {
  notes: { type: string }[]
  events: { type: string }[]
}>(chart: T): T {
  return {
    ...chart,
    notes: chart.notes.filter((n) => !isBlitzBannedNote(n.type)),
    events: chart.events.filter((e) => !isBlitzBannedEvent(e.type)),
  }
}
