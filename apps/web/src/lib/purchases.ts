/**
 * Record a chain purchase receipt in Postgres via Edge Function.
 * App writes + chain receipt (tx hash) — stack lock.
 */

import { getMagic } from '@/lib/magic'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type PurchaseRow = Database['public']['Tables']['purchases']['Row']
export type BoastRow = Database['public']['Tables']['boasts']['Row']

type RecordResponse = {
  ok: boolean
  purchase?: PurchaseRow
  boast?: Pick<
    BoastRow,
    | 'id'
    | 'share_slug'
    | 'tx_hash'
    | 'receipt_hash'
    | 'combo'
    | 'score'
    | 'chart_title'
    | 'mode'
    | 'on_chain_id'
    | 'created_at'
  >
  shareSlug?: string
  error?: string
}

export type RecordPurchaseInput = {
  sku: string
  amountCusd: number
  txHash: string
  metadata?: Record<string, unknown>
}

export type RecordPurchaseResult = {
  purchase: PurchaseRow
  boast?: RecordResponse['boast']
  shareSlug?: string
}

export async function recordPurchaseReceipt(
  input: RecordPurchaseInput,
): Promise<RecordPurchaseResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const magic = getMagic()
  const info = await magic.user.getInfo()
  if (!info.issuer) throw new Error('Magic session missing issuer')
  const did = await magic.user.getIdToken()

  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke<RecordResponse>(
    'record-purchase',
    {
      body: {
        issuer: info.issuer,
        sku: input.sku,
        amountCusd: input.amountCusd,
        txHash: input.txHash,
        metadata: input.metadata ?? {},
      },
      headers: {
        Authorization: `Bearer ${did}`,
      },
    },
  )

  if (error) throw error
  if (!data?.ok || !data.purchase) {
    throw new Error(data?.error ?? 'Purchase receipt failed')
  }
  return {
    purchase: data.purchase,
    boast: data.boast,
    shareSlug: data.shareSlug ?? data.boast?.share_slug,
  }
}
