/**
 * Deterministic Daily Track picker from UTC day + free public normal charts.
 */

const FREE_NORMAL_POOL = [
  'night-drive-normal',
  'soft-lights-normal',
  'pulse-market-normal',
  'skyline-tap-normal',
  'lavender-rush-normal',
  'orange-beat-normal',
  'four-lane-dream-normal',
  'quiet-keys-normal',
] as const

/** UTC calendar day YYYY-MM-DD */
export function utcDayString(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** FNV-1a 32-bit hash → stable index */
export function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function chartIdForDailySeed(seed: string): string {
  const idx = hashSeed(seed) % FREE_NORMAL_POOL.length
  return FREE_NORMAL_POOL[idx]
}

export function dailySeedForDay(day: string): string {
  return `beatlane-daily-${day}`
}

export { FREE_NORMAL_POOL }
