/**
 * G14 panic helpers — Slow-mo ($0.19 / 3s) and Shield one-miss ($0.29).
 * Classic / Daily only; disabled in tournament Blitz (and Zen).
 * Network: Celo Mainnet cUSD (same path as Second Chance / G10).
 */

import type { PlayMode } from '@/game/classicPlayfield'

export const SLOW_MO_PRICE = 0.19
export const SHIELD_PRICE = 0.29

export const SLOW_MO_SKU = 'slow_mo'
export const SHIELD_SKU = 'shield'

/** Slow-mo duration — tiles crawl for 3 seconds. */
export const SLOW_MO_MS = 3000

/** Scroll multiplier while Slow-mo is active (does not touch speedMult). */
export const SLOW_MO_SCROLL_MULT = 0.45

export type HelperSku = typeof SLOW_MO_SKU | typeof SHIELD_SKU

export type HelperMode = PlayMode | 'blitz'

/**
 * Blitz-disabled flag (G14 / G16). True when helpers must not be offered.
 * Classic + Daily allow; Zen + Blitz block.
 */
export function helpersDisabled(mode: HelperMode): boolean {
  return mode === 'blitz' || mode === 'zen'
}

export function helpersAllowed(mode: HelperMode): boolean {
  return !helpersDisabled(mode)
}

export function helperPrice(sku: HelperSku): number {
  return sku === SLOW_MO_SKU ? SLOW_MO_PRICE : SHIELD_PRICE
}

/** Count helper unlocks by SKU prefix (`slow_mo:<id>` / `shield:<id>`). */
export function countHelperUnlocks(
  unlocks: { unlock_type: string; unlock_key: string }[],
): { slowMo: number; shield: number; continues: number } {
  let slowMo = 0
  let shield = 0
  let continues = 0
  for (const u of unlocks) {
    if (u.unlock_type === 'continue') {
      continues += 1
      continue
    }
    if (u.unlock_type !== 'helper') continue
    if (u.unlock_key.startsWith(`${SLOW_MO_SKU}:`)) slowMo += 1
    else if (u.unlock_key.startsWith(`${SHIELD_SKU}:`)) shield += 1
  }
  return { slowMo, shield, continues }
}
