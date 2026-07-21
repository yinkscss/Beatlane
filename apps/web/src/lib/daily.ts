/**
 * G13 Daily Track + run submit + leaderboard poll helpers.
 */

import { getMagic } from '@/lib/magic'
import {
  edgeFunctionErrorMessage,
  getSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase'

export type DailyChallenge = {
  day: string
  seed: string
  chartId: string
  chart: {
    id: string
    title: string
    difficulty: string
    bpm: number
  } | null
}

export type TapPayload = {
  t: number
  lane: number
}

export type SubmitRunInput = {
  mode: 'daily' | 'classic' | 'zen'
  chartId: string
  score: number
  comboMax: number
  perfects?: number
  goods?: number
  misses?: number
  durationMs?: number
  dailyDay?: string
  seed?: string
  taps: TapPayload[]
  outcome?: 'clear' | 'fail' | 'quit'
}

export type SubmitRunResult = {
  ok: boolean
  run?: {
    id: string
    score: number
    validated: boolean
    daily_day: string | null
  }
  validated?: boolean
  rateLimit?: { remaining?: number; limit?: number; degraded?: boolean }
  error?: string
  reason?: string
}

export type LeaderboardEntry = {
  rank: number
  userId: string
  displayName: string
  score: number
  comboMax: number
  chartId: string
  runId: string
  isYou: boolean
}

export type LeaderboardResponse = {
  ok: boolean
  board: 'daily' | 'classic'
  day: string | null
  polledAt: string
  entries: LeaderboardEntry[]
  you: LeaderboardEntry | null
  error?: string
}

async function magicAuth(): Promise<{ issuer: string; did: string }> {
  const magic = getMagic()
  const info = await magic.user.getInfo()
  if (!info.issuer) throw new Error('Magic session missing issuer')
  const did = await magic.user.getIdToken()
  return { issuer: info.issuer, did }
}

export async function fetchDailyChallenge(): Promise<DailyChallenge> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }
  const { issuer, did } = await magicAuth()
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean
    day?: string
    seed?: string
    chartId?: string
    chart?: DailyChallenge['chart']
    error?: string
  }>('daily-challenge', {
    body: { issuer },
    headers: { Authorization: `Bearer ${did}` },
  })
  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error, 'Daily challenge failed'))
  }
  if (!data?.ok || !data.day || !data.seed || !data.chartId) {
    throw new Error(data?.error ?? 'Daily challenge failed')
  }
  return {
    day: data.day,
    seed: data.seed,
    chartId: data.chartId,
    chart: data.chart ?? null,
  }
}

export async function submitRun(
  input: SubmitRunInput,
): Promise<SubmitRunResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }
  const { issuer, did } = await magicAuth()
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke<SubmitRunResult>(
    'submit-run',
    {
      body: { issuer, ...input },
      headers: { Authorization: `Bearer ${did}` },
    },
  )
  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error, 'Submit failed'))
  }
  if (!data) throw new Error('Empty submit-run response')
  return data
}

export async function fetchLeaderboard(opts: {
  board: 'daily' | 'classic'
  day?: string
  limit?: number
}): Promise<LeaderboardResponse> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  let issuer: string | undefined
  let did: string | undefined
  try {
    const auth = await magicAuth()
    issuer = auth.issuer
    did = auth.did
  } catch {
    // anonymous poll OK
  }

  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke<LeaderboardResponse>(
    'leaderboard',
    {
      body: {
        board: opts.board,
        day: opts.day,
        limit: opts.limit ?? 50,
        issuer,
      },
      headers: did ? { Authorization: `Bearer ${did}` } : undefined,
    },
  )
  if (error) throw error
  if (!data?.ok) {
    throw new Error(data?.error ?? 'Leaderboard failed')
  }
  return data
}

/** HTTP polling interval for boards (STACK: no websockets). */
export const LEADERBOARD_POLL_MS = 5000
