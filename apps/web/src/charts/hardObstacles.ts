/**
 * G11 hard obstacle catalog — for smoke coverage checks + authoring reference.
 * Zig / split / cascade / trap_double are chart patterns (notes + banner);
 * other shapes have dedicated note types.
 */

import type { Chart, ChartNoteType, ChartObstacleEventType } from '@/charts/schema'

/** Hard shape note types that require dedicated playfield logic. */
export const HARD_SHAPE_NOTES = [
  'bridge',
  'triple',
  'l_hook',
  'fake_gap',
  'slide',
] as const satisfies readonly ChartNoteType[]

/** Banner-only hard patterns (authored as taps/bombs + event). */
export const HARD_PATTERN_EVENTS = [
  'zig',
  'split',
  'cascade',
  'trap_double',
] as const satisfies readonly ChartObstacleEventType[]

/** Modifier events (tempo / bonus / visibility / lane-flip). */
export const MODIFIER_EVENTS = [
  'ice',
  'gold',
  'fog',
  'reverse',
] as const satisfies readonly ChartObstacleEventType[]

/** Full G11 hard set names for acceptance checks. */
export const G11_HARD_SET = [
  'BRIDGE',
  'TRIPLE',
  'L-HOOK',
  'ZIG',
  'SPLIT',
  'FAKE GAP',
  'SLIDE',
  'CASCADE',
  'TRAP DOUBLE',
] as const

export type HardCoverage = {
  notes: Set<string>
  events: Set<string>
  /** Human labels present via note type and/or banner event. */
  labels: Set<string>
}

const NOTE_TO_LABEL: Record<string, string> = {
  bridge: 'BRIDGE',
  triple: 'TRIPLE',
  l_hook: 'L-HOOK',
  fake_gap: 'FAKE GAP',
  slide: 'SLIDE',
}

const EVENT_TO_LABEL: Record<string, string> = {
  bridge: 'BRIDGE',
  triple: 'TRIPLE',
  l_hook: 'L-HOOK',
  zig: 'ZIG',
  split: 'SPLIT',
  fake_gap: 'FAKE GAP',
  slide: 'SLIDE',
  cascade: 'CASCADE',
  trap_double: 'TRAP DOUBLE',
}

export function hardCoverage(chart: Chart): HardCoverage {
  const notes = new Set(chart.notes.map((n) => n.type))
  const events = new Set(chart.events.map((e) => e.type))
  const labels = new Set<string>()
  for (const t of notes) {
    const label = NOTE_TO_LABEL[t]
    if (label) labels.add(label)
  }
  for (const t of events) {
    const label = EVENT_TO_LABEL[t]
    if (label) labels.add(label)
  }
  return { notes, events, labels }
}

/** True if Hard chart exercises a non-empty subset of the G11 hard set. */
export function exercisesHardSubset(chart: Chart, min = 1): boolean {
  return hardCoverage(chart).labels.size >= min
}

export function hasAllModifiers(chart: Chart): boolean {
  const events = new Set(chart.events.map((e) => e.type))
  return MODIFIER_EVENTS.every((m) => events.has(m))
}
