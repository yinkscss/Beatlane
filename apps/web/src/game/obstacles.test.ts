import { describe, expect, it } from 'vitest'
import {
  exercisesHardSubset,
  G11_HARD_SET,
  hardCoverage,
  HARD_PATTERN_EVENTS,
  HARD_SHAPE_NOTES,
  hasAllModifiers,
  MODIFIER_EVENTS,
} from '@/charts/hardObstacles'
import { CHART_SCHEMA_VERSION, type Chart } from '@/charts/schema'
import {
  BLITZ_BANNED_EVENTS,
  BLITZ_BANNED_NOTES,
  chartHasBlitzBannedContent,
  isBlitzBannedEvent,
  isBlitzBannedNote,
  sanitizeBlitzChart,
} from '@/game/blitzWhitelist'

function chart(partial: {
  notes?: Chart['notes']
  events?: Chart['events']
}): Chart {
  return {
    schemaVersion: CHART_SCHEMA_VERSION,
    id: 'test',
    title: 'Test',
    difficulty: 'hard',
    bpm: 120,
    offset: 0,
    audio: 'silence',
    notes: partial.notes ?? [],
    events: partial.events ?? [],
  }
}

describe('obstacle rules — G11 hard catalog', () => {
  it('lists dedicated hard shapes + banner patterns', () => {
    expect(HARD_SHAPE_NOTES).toContain('long_hold')
    expect(HARD_SHAPE_NOTES).toContain('fake_gap')
    expect(HARD_PATTERN_EVENTS).toContain('zig')
    expect(HARD_PATTERN_EVENTS).toContain('trap_double')
    expect(MODIFIER_EVENTS).toEqual(
      expect.arrayContaining(['ice', 'gold', 'fog', 'reverse']),
    )
    expect(G11_HARD_SET.length).toBe(10)
  })

  it('detects hard coverage labels from notes + events', () => {
    const c = chart({
      notes: [
        { t: 0, lane: 0, type: 'long_hold', length: 1 },
        { t: 1, lane: 0, type: 'bridge' },
        { t: 2, lane: 1, type: 'fake_gap', length: 0.5 },
      ],
      events: [
        { t: 3, type: 'zig', duration: 1 },
        { t: 4, type: 'cascade', duration: 1 },
      ],
    })
    const cov = hardCoverage(c)
    expect(cov.labels.has('LONG HOLD')).toBe(true)
    expect(cov.labels.has('BRIDGE')).toBe(true)
    expect(cov.labels.has('FAKE GAP')).toBe(true)
    expect(cov.labels.has('ZIG')).toBe(true)
    expect(cov.labels.has('CASCADE')).toBe(true)
    expect(exercisesHardSubset(c, 3)).toBe(true)
  })

  it('requires all modifiers present', () => {
    const empty = chart({})
    expect(hasAllModifiers(empty)).toBe(false)
    const full = chart({
      events: MODIFIER_EVENTS.map((type, i) => ({
        t: i,
        type,
        duration: 1,
      })),
    })
    expect(hasAllModifiers(full)).toBe(true)
  })
})

describe('obstacle rules — Blitz fair whitelist (G16)', () => {
  it('bans reverse, fog, and fake_gap', () => {
    expect(isBlitzBannedEvent('reverse')).toBe(true)
    expect(isBlitzBannedEvent('fog')).toBe(true)
    expect(isBlitzBannedEvent('fake_gap')).toBe(true)
    expect(isBlitzBannedEvent('speed_up')).toBe(false)
    expect(isBlitzBannedNote('fake_gap')).toBe(true)
    expect(isBlitzBannedNote('bridge')).toBe(false)
    expect([...BLITZ_BANNED_EVENTS]).toEqual(['reverse', 'fog', 'fake_gap'])
    expect([...BLITZ_BANNED_NOTES]).toEqual(['fake_gap'])
  })

  it('sanitizeBlitzChart strips banned content only', () => {
    const dirty = chart({
      notes: [
        { t: 0, lane: 0, type: 'tap' },
        { t: 1, lane: 1, type: 'fake_gap', length: 0.4 },
        { t: 2, lane: 0, type: 'bridge' },
      ],
      events: [
        { t: 0.5, type: 'speed_up', mult: 1.35 },
        { t: 1.5, type: 'fog', duration: 1 },
        { t: 2.5, type: 'reverse', duration: 1 },
      ],
    })
    expect(chartHasBlitzBannedContent(dirty)).toBe(true)
    const clean = sanitizeBlitzChart(dirty)
    expect(chartHasBlitzBannedContent(clean)).toBe(false)
    expect(clean.notes.map((n) => n.type)).toEqual(['tap', 'bridge'])
    expect(clean.events.map((e) => e.type)).toEqual(['speed_up'])
  })
})
