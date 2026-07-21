/**
 * G12 catalog: packs, track groups, unlock SKUs, signed asset resolve.
 */

import { getMagic } from '@/lib/magic'
import {
  edgeFunctionErrorMessage,
  getSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase'
import type { ChartDifficulty, ChartRow, UnlockType } from '@/lib/database.types'

export type PackRow = {
  id: string
  title: string
  description: string | null
  price_cusd: number
  art_gradient: string | null
  created_at: string
}

export type UnlockRow = {
  id: string
  unlock_type: UnlockType
  unlock_key: string
  source_purchase_id: string | null
  created_at: string
}

export type CatalogTrack = {
  trackKey: string
  title: string
  artGradient: string
  isPublic: boolean
  packId: string | null
  /** Single-track unlock price; null if pack-only / free. */
  priceCusd: number | null
  charts: Partial<Record<ChartDifficulty, ChartRow>>
}

export type ResolvedChartAssets = {
  chartId: string
  title: string
  difficulty: string
  bpm: number
  audioUrl: string
  chartUrl: string
}

const CHART_SELECT =
  'id, title, difficulty, bpm, duration_ms, is_public, is_listed, track_key, pack_id, price_cusd, art_gradient, audio_path, chart_path, created_at, updated_at'

export function packSku(packId: string): string {
  return `pack_${packId}`
}

export function trackSku(trackKey: string): string {
  return `track_${trackKey}`
}

export function formatCusd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export async function fetchPacks(): Promise<PackRow[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  const { data, error } = await getSupabase()
    .from('packs')
    .select('id, title, description, price_cusd, art_gradient, created_at')
    .order('title', { ascending: true })
  if (error) throw error
  return (data ?? []) as PackRow[]
}

export async function fetchListedCharts(): Promise<ChartRow[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  const { data, error } = await getSupabase()
    .from('charts')
    .select(CHART_SELECT)
    .eq('is_listed', true)
    .order('title', { ascending: true })
  if (error) throw error
  return (data ?? []) as ChartRow[]
}

export function groupChartsIntoTracks(charts: ChartRow[]): CatalogTrack[] {
  const map = new Map<string, CatalogTrack>()
  for (const c of charts) {
    const key = c.track_key ?? c.id
    let track = map.get(key)
    if (!track) {
      track = {
        trackKey: key,
        title: c.title,
        artGradient: c.art_gradient ?? 'linear-gradient(135deg,#ff8a3d,#1a1424)',
        isPublic: c.is_public,
        packId: c.pack_id,
        priceCusd: c.price_cusd,
        charts: {},
      }
      map.set(key, track)
    }
    track.charts[c.difficulty] = c
    // Prefer non-null single price / pack id from any difficulty row.
    if (c.price_cusd != null) track.priceCusd = c.price_cusd
    if (c.pack_id) track.packId = c.pack_id
    if (!c.is_public) track.isPublic = false
  }
  return [...map.values()].sort((a, b) => {
    if (a.isPublic !== b.isPublic) return a.isPublic ? -1 : 1
    return a.title.localeCompare(b.title)
  })
}

export function isTrackUnlocked(
  track: CatalogTrack,
  unlocks: UnlockRow[],
): boolean {
  if (track.isPublic) return true
  return unlocks.some((u) => {
    if (u.unlock_type === 'pack' && track.packId && u.unlock_key === track.packId) {
      return true
    }
    if (u.unlock_type === 'chart' && u.unlock_key === track.trackKey) {
      return true
    }
    return false
  })
}

export async function fetchMyUnlocks(): Promise<UnlockRow[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  const magic = getMagic()
  const info = await magic.user.getInfo()
  if (!info.issuer) throw new Error('Magic session missing issuer')
  const did = await magic.user.getIdToken()

  const { data, error } = await getSupabase().functions.invoke<{
    ok: boolean
    unlocks?: UnlockRow[]
    error?: string
  }>('my-unlocks', {
    body: { issuer: info.issuer },
    headers: { Authorization: `Bearer ${did}` },
  })

  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error, 'Unlocks fetch failed'))
  }
  if (!data?.ok) throw new Error(data?.error ?? 'Unlocks fetch failed')
  return data.unlocks ?? []
}

export async function resolveChartAssets(
  chartId: string,
): Promise<ResolvedChartAssets> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')

  const headers: Record<string, string> = {}
  let issuer: string | undefined
  try {
    const magic = getMagic()
    const loggedIn = await magic.user.isLoggedIn()
    if (loggedIn) {
      const info = await magic.user.getInfo()
      if (info.issuer) {
        issuer = info.issuer
        const did = await magic.user.getIdToken()
        headers.Authorization = `Bearer ${did}`
      }
    }
  } catch {
    /* public charts may resolve without Magic */
  }

  const { data, error } = await getSupabase().functions.invoke<{
    ok: boolean
    error?: string
    chartId?: string
    title?: string
    difficulty?: string
    bpm?: number
    audioUrl?: string
    chartUrl?: string
  }>('resolve-chart-assets', {
    body: { chartId, issuer },
    headers,
  })

  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error, 'Chart resolve failed'))
  }
  if (
    !data?.ok ||
    !data.audioUrl ||
    !data.chartUrl ||
    !data.chartId ||
    !data.title ||
    !data.difficulty ||
    data.bpm == null
  ) {
    throw new Error(data?.error ?? 'Chart resolve failed')
  }

  return {
    chartId: data.chartId,
    title: data.title,
    difficulty: data.difficulty,
    bpm: data.bpm,
    audioUrl: data.audioUrl,
    chartUrl: data.chartUrl,
  }
}

/** @deprecated G8 stub — use fetchListedCharts / groupChartsIntoTracks. */
export async function fetchPublicCatalog(): Promise<ChartRow[]> {
  return fetchListedCharts().then((rows) => rows.filter((r) => r.is_public))
}
