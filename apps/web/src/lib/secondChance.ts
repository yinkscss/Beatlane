/** Second Chance pricing + SKUs (G10). Escalates in-run; caps at $0.99. */

export const SECOND_CHANCE_PRICES = [0.49, 0.79, 0.99] as const

/** Post-revive shield — Q15: enable, default ON, ~2s. */
export const SECOND_CHANCE_SHIELD_MS = 2000
export const SECOND_CHANCE_SHIELD_DEFAULT_ON = true

export type SecondChanceTier = 0 | 1 | 2

/** 0-based revive index → price in cUSD. Index ≥2 stays at $0.99. */
export function secondChancePrice(reviveIndex: number): number {
  const i = Math.max(0, Math.min(reviveIndex, SECOND_CHANCE_PRICES.length - 1))
  return SECOND_CHANCE_PRICES[i]
}

export function secondChanceSku(reviveIndex: number): string {
  const n = Math.min(reviveIndex, SECOND_CHANCE_PRICES.length - 1) + 1
  return `second_chance_${n}`
}

export function formatCusdPrice(amount: number): string {
  return `$${amount.toFixed(2)} cUSD`
}
