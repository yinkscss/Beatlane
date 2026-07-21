/**
 * G17 Season Pass — $2.99 cUSD on Celo Mainnet (Q07).
 * Continues + track unlocks over 4 weeks (Q20). No cosmetics (Q23).
 */

import { isTreasuryConfigured, transferCusdToTreasury } from '@/lib/celo'
import { getMagic } from '@/lib/magic'
import { recordPurchaseReceipt } from '@/lib/purchases'
import { assertSpendAllowed, recordSpend } from '@/lib/spendCaps'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export const SEASON_PASS_PRICE = 2.99
export const SEASON_DURATION_DAYS = 28
export const DEFAULT_SEASON_SLUG = 'season-1'

export function seasonPassSku(slug: string): string {
  return `season_pass_${slug}`
}

export type PassNodeState = 'locked' | 'available' | 'claimed' | 'upcoming'

export type PassNode = {
  id: string
  dayOffset: number
  sortOrder: number
  rewardType: 'continue' | 'chart'
  continueCount: number
  trackKey: string | null
  label: string
  state: PassNodeState
  claimed: boolean
}

export type SeasonPassStatus = {
  season: {
    id: string
    slug: string
    title: string
    priceCusd: number
    startsAt: string
    endsAt: string
    status: string
    durationDays: number
    daysRemaining: number
    dayElapsed: number
    blurb: string
  }
  sku: string
  priceCusd: number
  owned: boolean
  purchasedAt: string | null
  nodes: PassNode[]
  progress: { claimed: number; unlocked: number; total: number }
  newlyGranted: string[]
  network: string
  chainId: number
  networkNote: string
  noCosmetics: boolean
}

async function magicAuth(): Promise<{ issuer: string; did: string }> {
  const magic = getMagic()
  const info = await magic.user.getInfo()
  if (!info.issuer) throw new Error('Magic session missing issuer')
  const did = await magic.user.getIdToken()
  return { issuer: info.issuer, did }
}

export async function fetchSeasonPassStatus(
  slug = DEFAULT_SEASON_SLUG,
): Promise<SeasonPassStatus> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  const { issuer, did } = await magicAuth()
  const { data, error } = await getSupabase().functions.invoke<
    SeasonPassStatus & { ok: boolean; error?: string }
  >('season-pass', {
    body: { issuer, action: 'status', slug },
    headers: { Authorization: `Bearer ${did}` },
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error ?? 'Season pass status failed')
  return data
}

/** Buy pass: Mainnet cUSD → record-purchase → entitlements + due grants. */
export async function purchaseSeasonPass(
  status: SeasonPassStatus,
): Promise<void> {
  if (!isTreasuryConfigured()) {
    throw new Error(
      'Set VITE_TREASURY_ADDRESS for Mainnet cUSD Season Pass (Q07).',
    )
  }
  const amountCusd = status.priceCusd
  if (amountCusd.toFixed(2) !== SEASON_PASS_PRICE.toFixed(2)) {
    throw new Error('Season Pass price mismatch')
  }
  const spendGate = assertSpendAllowed('pass', amountCusd)
  if (!spendGate.ok) throw new Error(spendGate.reason)
  const { txHash } = await transferCusdToTreasury(amountCusd)
  await recordPurchaseReceipt({
    sku: status.sku,
    amountCusd,
    txHash,
    metadata: {
      product: 'season_pass',
      seasonSlug: status.season.slug,
      network: 'celo-mainnet',
      chainId: 42220,
      noCosmetics: true,
    },
  })
  recordSpend('pass', amountCusd)
}
