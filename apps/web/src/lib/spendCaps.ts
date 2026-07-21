/**
 * G19 soft spend caps — client-side responsible spending UX (PRD §8).
 * UTC day buckets in localStorage. Not a security boundary; Edge still records receipts.
 */

export type SpendCategory = 'continue' | 'helper' | 'tournament' | 'pack' | 'pass'

const STORAGE_KEY = 'beatlane:spendCaps:v1'

/** Soft daily caps (cUSD). Continues escalate 0.49→0.99; helpers ~0.19–0.29. */
export const DAILY_CONTINUE_CAP_CUSD = 9.99
export const DAILY_HELPER_CAP_CUSD = 4.99
export const DAILY_TOURNAMENT_CAP_CUSD = 9.99
export const DAILY_TOURNAMENT_CAP_COUNT = 5
export const DAILY_TOTAL_CAP_CUSD = 24.99

export type SpendDay = {
  day: string
  continueCusd: number
  helperCusd: number
  tournamentCusd: number
  tournamentCount: number
  packCusd: number
  passCusd: number
}

export type SpendGate =
  | { ok: true; remainingTotal: number }
  | {
      ok: false
      reason: string
      spent: number
      cap: number
      remainingTotal: number
    }

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function emptyDay(day: string): SpendDay {
  return {
    day,
    continueCusd: 0,
    helperCusd: 0,
    tournamentCusd: 0,
    tournamentCount: 0,
    packCusd: 0,
    passCusd: 0,
  }
}

function totalSpent(s: SpendDay): number {
  return (
    s.continueCusd +
    s.helperCusd +
    s.tournamentCusd +
    s.packCusd +
    s.passCusd
  )
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

/** Test seam — inject storage. */
export function readSpendDay(
  storage?: Pick<Storage, 'getItem'>,
  now = new Date(),
): SpendDay {
  const day = utcDay(now)
  try {
    const s = storage ?? browserStorage()
    if (!s) return emptyDay(day)
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return emptyDay(day)
    const parsed = JSON.parse(raw) as SpendDay
    if (!parsed || parsed.day !== day) return emptyDay(day)
    return {
      ...emptyDay(day),
      ...parsed,
      day,
    }
  } catch {
    return emptyDay(day)
  }
}

function writeSpendDay(
  next: SpendDay,
  storage?: Pick<Storage, 'setItem'>,
): void {
  const s = storage ?? browserStorage()
  if (!s) return
  s.setItem(STORAGE_KEY, JSON.stringify(next))
}

function categorySpent(s: SpendDay, category: SpendCategory): number {
  switch (category) {
    case 'continue':
      return s.continueCusd
    case 'helper':
      return s.helperCusd
    case 'tournament':
      return s.tournamentCusd
    case 'pack':
      return s.packCusd
    case 'pass':
      return s.passCusd
  }
}

function categoryCap(category: SpendCategory): number | null {
  switch (category) {
    case 'continue':
      return DAILY_CONTINUE_CAP_CUSD
    case 'helper':
      return DAILY_HELPER_CAP_CUSD
    case 'tournament':
      return DAILY_TOURNAMENT_CAP_CUSD
    case 'pack':
    case 'pass':
      return null
  }
}

export function assertSpendAllowed(
  category: SpendCategory,
  amountCusd: number,
  storage?: Pick<Storage, 'getItem'>,
  now = new Date(),
): SpendGate {
  const s = readSpendDay(storage, now)
  const remainingTotal = Math.max(0, DAILY_TOTAL_CAP_CUSD - totalSpent(s))

  if (amountCusd > remainingTotal + 1e-9) {
    return {
      ok: false,
      reason: `Daily spend cap reached ($${DAILY_TOTAL_CAP_CUSD.toFixed(2)} cUSD). Try again tomorrow.`,
      spent: totalSpent(s),
      cap: DAILY_TOTAL_CAP_CUSD,
      remainingTotal,
    }
  }

  if (category === 'tournament') {
    if (s.tournamentCount >= DAILY_TOURNAMENT_CAP_COUNT) {
      return {
        ok: false,
        reason: `Daily Blitz entry cap (${DAILY_TOURNAMENT_CAP_COUNT}) reached. Try again tomorrow.`,
        spent: s.tournamentCount,
        cap: DAILY_TOURNAMENT_CAP_COUNT,
        remainingTotal,
      }
    }
  }

  const cap = categoryCap(category)
  if (cap != null) {
    const spent = categorySpent(s, category)
    if (spent + amountCusd > cap + 1e-9) {
      const label =
        category === 'continue'
          ? 'continues'
          : category === 'helper'
            ? 'helpers'
            : 'Blitz entries'
      return {
        ok: false,
        reason: `Daily ${label} spend cap ($${cap.toFixed(2)} cUSD) reached. Try again tomorrow.`,
        spent,
        cap,
        remainingTotal,
      }
    }
  }

  return { ok: true, remainingTotal: remainingTotal - amountCusd }
}

export function recordSpend(
  category: SpendCategory,
  amountCusd: number,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
  now = new Date(),
): SpendDay {
  const s = readSpendDay(storage, now)
  const next: SpendDay = { ...s }
  switch (category) {
    case 'continue':
      next.continueCusd += amountCusd
      break
    case 'helper':
      next.helperCusd += amountCusd
      break
    case 'tournament':
      next.tournamentCusd += amountCusd
      next.tournamentCount += 1
      break
    case 'pack':
      next.packCusd += amountCusd
      break
    case 'pass':
      next.passCusd += amountCusd
      break
  }
  writeSpendDay(next, storage)
  return next
}

export function formatSpendSummary(
  storage?: Pick<Storage, 'getItem'>,
  now = new Date(),
): string {
  const s = readSpendDay(storage, now)
  const t = totalSpent(s)
  return `Today $${t.toFixed(2)} / $${DAILY_TOTAL_CAP_CUSD.toFixed(2)} cUSD`
}
