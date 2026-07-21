/**
 * G16 Blitz tournaments — entry fee cups, 15% rake, ranking, payout stub.
 *
 * Entry fees: Celo Mainnet cUSD via transferCusdToTreasury (Q07).
 * Optional TournamentVault on Celo Sepolia (configurable address) — escrow/payout stub.
 * Helpers must stay off: helpersDisabled('blitz') === true.
 */

import { isTreasuryConfigured, transferCusdToTreasury } from '@/lib/celo'
import { getMagic } from '@/lib/magic'
import { recordPurchaseReceipt } from '@/lib/purchases'
import { assertSpendAllowed, recordSpend } from '@/lib/spendCaps'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export const TOURNAMENT_RAKE_BPS = 1500
export const BLITZ_DURATION_SEC = 60
export const BLITZ_DURATION_MS = BLITZ_DURATION_SEC * 1000
export const DEFAULT_CUP_SLUG = 'friday-finger'

export function tournamentEntrySku(tournamentIdOrSlug: string): string {
  return `tournament_entry_${tournamentIdOrSlug}`
}

export function getTournamentContractAddress(): string | null {
  const raw = (
    import.meta.env.VITE_TOURNAMENT_CONTRACT_ADDRESS as string | undefined
  )?.trim()
  if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) return null
  return raw
}

export function isTournamentContractConfigured(): boolean {
  return getTournamentContractAddress() != null
}

export type TournamentRow = {
  id: string
  slug: string
  title: string
  status: string
  entry_fee_cusd: number
  rake_bps: number
  duration_sec: number
  chart_id: string
  capacity: number
  starts_at: string | null
  ends_at: string | null
  metadata: Record<string, unknown>
}

export type TournamentLobby = {
  tournament: TournamentRow
  entrants: number
  capacity: number
  grossPoolCusd: number
  rakeCusd: number
  prizePoolCusd: number
  rakeBps: number
  helpersDisabled: boolean
  bannedObstacles: string[]
  myEntry: {
    id: string
    tx_hash: string
    amount_cusd: number
    created_at: string
  } | null
  myRun: {
    id: string
    tiles: number
    score: number
    combo_max: number
    created_at: string
  } | null
  contractAddress: string | null
  networkNote: string
}

export type TournamentBoardEntry = {
  rank: number
  userId: string
  displayName: string
  tiles: number
  score: number
  comboMax: number
  isYou: boolean
  payoutStubCusd: number
}

export type TournamentRank = {
  tournamentId: string
  slug: string
  entrants: number
  grossPoolCusd: number
  rakeCusd: number
  prizePoolCusd: number
  rakeBps: number
  board: TournamentBoardEntry[]
  you: TournamentBoardEntry | null
}

async function magicAuth(): Promise<{ issuer: string; did: string }> {
  const magic = getMagic()
  const info = await magic.user.getInfo()
  if (!info.issuer) throw new Error('Magic session missing issuer')
  const did = await magic.user.getIdToken()
  return { issuer: info.issuer, did }
}

async function invokeCup<T>(
  body: Record<string, unknown>,
): Promise<T & { ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }
  const { issuer, did } = await magicAuth()
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke<
    T & { ok: boolean; error?: string }
  >('tournament-cup', {
    body: { issuer, ...body },
    headers: { Authorization: `Bearer ${did}` },
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error ?? 'Tournament request failed')
  return data
}

export async function fetchTournamentLobby(
  slug: string = DEFAULT_CUP_SLUG,
): Promise<TournamentLobby> {
  return invokeCup<TournamentLobby>({ action: 'lobby', slug })
}

export async function submitBlitzRun(input: {
  tournamentId: string
  tiles: number
  score: number
  comboMax: number
  durationMs?: number
  chartId?: string
  taps?: { t: number; lane: number }[]
}): Promise<{ run: { id: string; tiles: number }; kept: boolean }> {
  const data = await invokeCup<{
    run: { id: string; tiles: number }
    kept: boolean
  }>({
    action: 'submit',
    tournamentId: input.tournamentId,
    tiles: input.tiles,
    score: input.score,
    comboMax: input.comboMax,
    durationMs: input.durationMs,
    chartId: input.chartId,
    taps: input.taps,
  })
  return { run: data.run, kept: data.kept }
}

export async function fetchTournamentRank(
  slug: string = DEFAULT_CUP_SLUG,
): Promise<TournamentRank> {
  return invokeCup<TournamentRank>({ action: 'rank', slug })
}

export async function runPayoutStub(
  slug: string = DEFAULT_CUP_SLUG,
): Promise<{ stub: boolean; payouts: unknown[] }> {
  return invokeCup<{ stub: boolean; payouts: unknown[] }>({
    action: 'payout_stub',
    slug,
  })
}

/**
 * Pay Mainnet entry fee → record purchase → tournament_entries row.
 * On-chain vault enter (Sepolia) is optional and separate from this path.
 */
export async function enterTournament(lobby: TournamentLobby): Promise<{
  txHash: string
  entryFee: number
}> {
  if (!isTreasuryConfigured()) {
    throw new Error(
      'Set VITE_TREASURY_ADDRESS for Mainnet cUSD entry fees (Q07).',
    )
  }
  const entryFee = Number(lobby.tournament.entry_fee_cusd)
  const spendGate = assertSpendAllowed('tournament', entryFee)
  if (!spendGate.ok) throw new Error(spendGate.reason)
  const sku = tournamentEntrySku(lobby.tournament.slug)
  const { txHash } = await transferCusdToTreasury(entryFee)
  await recordPurchaseReceipt({
    sku,
    amountCusd: entryFee,
    txHash,
    metadata: {
      tournamentId: lobby.tournament.id,
      slug: lobby.tournament.slug,
      rakeBps: TOURNAMENT_RAKE_BPS,
      product: 'tournament_entry',
    },
  })
  recordSpend('tournament', entryFee)
  return { txHash, entryFee }
}

export function formatBlitzClock(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
