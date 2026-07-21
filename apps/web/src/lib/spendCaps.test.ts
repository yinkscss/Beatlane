import { describe, expect, it } from 'vitest'
import {
  assertSpendAllowed,
  DAILY_CONTINUE_CAP_CUSD,
  DAILY_TOURNAMENT_CAP_COUNT,
  DAILY_TOTAL_CAP_CUSD,
  readSpendDay,
  recordSpend,
} from '@/lib/spendCaps'

function memoryStorage(seed?: string): Storage {
  let data = seed ?? ''
  return {
    get length() {
      return data ? 1 : 0
    },
    clear() {
      data = ''
    },
    getItem(key: string) {
      return key === 'beatlane:spendCaps:v1' ? data || null : null
    },
    setItem(key: string, value: string) {
      if (key === 'beatlane:spendCaps:v1') data = value
    },
    removeItem() {
      data = ''
    },
    key() {
      return null
    },
  }
}

describe('spendCaps', () => {
  it('allows spend under category and total caps', () => {
    const storage = memoryStorage()
    const gate = assertSpendAllowed('continue', 0.49, storage)
    expect(gate.ok).toBe(true)
  })

  it('blocks when continue daily cap would be exceeded', () => {
    const storage = memoryStorage()
    recordSpend('continue', DAILY_CONTINUE_CAP_CUSD, storage)
    const gate = assertSpendAllowed('continue', 0.49, storage)
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.reason).toMatch(/continues/i)
    }
  })

  it('blocks tournament after entry count cap', () => {
    const storage = memoryStorage()
    for (let i = 0; i < DAILY_TOURNAMENT_CAP_COUNT; i++) {
      recordSpend('tournament', 1, storage)
    }
    const gate = assertSpendAllowed('tournament', 1, storage)
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.reason).toMatch(/Blitz entry/i)
    }
  })

  it('blocks when total daily cap exceeded', () => {
    const storage = memoryStorage()
    recordSpend('pack', DAILY_TOTAL_CAP_CUSD, storage)
    const gate = assertSpendAllowed('helper', 0.19, storage)
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.cap).toBe(DAILY_TOTAL_CAP_CUSD)
    }
  })

  it('resets on new UTC day', () => {
    const storage = memoryStorage(
      JSON.stringify({
        day: '2020-01-01',
        continueCusd: 9,
        helperCusd: 0,
        tournamentCusd: 0,
        tournamentCount: 0,
        packCusd: 0,
        passCusd: 0,
      }),
    )
    const day = readSpendDay(storage, new Date('2026-07-21T12:00:00Z'))
    expect(day.continueCusd).toBe(0)
    expect(day.day).toBe('2026-07-21')
  })
})
