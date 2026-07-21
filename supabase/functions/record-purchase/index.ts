/**
 * G10/G12: Record cUSD purchase receipt after on-chain transfer.
 *
 * Client sends Magic DID + sku/amount/txHash.
 * verify_jwt is OFF — auth is Magic DID (same as magic-profile).
 * Inserts purchases row (status=confirmed) + unlocks for continues / packs / tracks.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import {
  assertDidClaim,
  parseDidClaim,
  profileIdFromIssuer,
} from '../_shared/magicProfile.ts'

type Body = {
  issuer?: string
  sku?: string
  amountCusd?: number
  txHash?: string
  metadata?: Record<string, unknown>
}

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, req)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, error: 'Missing DID token' }, 401, req)
    }
    const didToken = authHeader.slice('Bearer '.length).trim()
    if (!didToken) {
      return jsonResponse({ ok: false, error: 'Missing DID token' }, 401, req)
    }

    const body = (await req.json()) as Body
    const issuer = body.issuer?.trim()
    const sku = body.sku?.trim()
    const txHash = body.txHash?.trim()
    const amountCusd = body.amountCusd

    if (!issuer) {
      return jsonResponse({ ok: false, error: 'Missing issuer' }, 400, req)
    }
    if (!sku) {
      return jsonResponse({ ok: false, error: 'Missing sku' }, 400, req)
    }
    if (typeof amountCusd !== 'number' || !(amountCusd >= 0)) {
      return jsonResponse({ ok: false, error: 'Invalid amountCusd' }, 400, req)
    }
    if (!txHash || !TX_HASH_RE.test(txHash)) {
      return jsonResponse({ ok: false, error: 'Invalid txHash' }, 400, req)
    }

    const claim = parseDidClaim(didToken)
    assertDidClaim(claim, issuer)

    const magicSecret = Deno.env.get('MAGIC_SECRET_KEY')
    if (magicSecret) {
      const { Magic } = await import('npm:@magic-sdk/admin@2')
      const magic = new Magic(magicSecret)
      magic.token.validate(didToken)
      const meta = await magic.users.getMetadataByToken(didToken)
      if (meta.issuer && meta.issuer !== issuer) {
        return jsonResponse({ ok: false, error: 'Issuer mismatch' }, 401, req)
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service env')
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const userId = await profileIdFromIssuer(issuer)

    // Ensure profile row exists (purchase FK).
    const { error: profileErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        magic_issuer: issuer,
      },
      { onConflict: 'id' },
    )
    if (profileErr) throw profileErr

    // Price check for catalog SKUs.
    if (sku.startsWith('pack_')) {
      const packId = sku.slice('pack_'.length)
      const { data: pack, error: packErr } = await admin
        .from('packs')
        .select('id, price_cusd')
        .eq('id', packId)
        .maybeSingle()
      if (packErr) throw packErr
      if (!pack) {
        return jsonResponse({ ok: false, error: 'Unknown pack sku' }, 400, req)
      }
      if (Number(pack.price_cusd).toFixed(2) !== amountCusd.toFixed(2)) {
        return jsonResponse(
          { ok: false, error: 'amountCusd does not match pack price' },
          400,
          req,
        )
      }
    } else if (sku.startsWith('track_')) {
      const trackKey = sku.slice('track_'.length)
      const { data: chart, error: chartErr } = await admin
        .from('charts')
        .select('track_key, price_cusd')
        .eq('track_key', trackKey)
        .not('price_cusd', 'is', null)
        .limit(1)
        .maybeSingle()
      if (chartErr) throw chartErr
      if (!chart?.price_cusd) {
        return jsonResponse({ ok: false, error: 'Unknown track sku' }, 400, req)
      }
      if (Number(chart.price_cusd).toFixed(2) !== amountCusd.toFixed(2)) {
        return jsonResponse(
          { ok: false, error: 'amountCusd does not match track price' },
          400,
          req,
        )
      }
    }

    const metadata = {
      ...(body.metadata ?? {}),
      network: 'celo-mainnet',
      chainId: 42220,
    }

    const { data: purchase, error: purchaseErr } = await admin
      .from('purchases')
      .insert({
        user_id: userId,
        sku,
        amount_cusd: amountCusd,
        tx_hash: txHash.toLowerCase(),
        status: 'confirmed',
        metadata,
      })
      .select(
        'id, user_id, sku, amount_cusd, tx_hash, status, metadata, created_at, updated_at',
      )
      .single()

    if (purchaseErr) {
      if (purchaseErr.code === '23505') {
        return jsonResponse(
          { ok: false, error: 'Duplicate tx_hash' },
          409,
          req,
        )
      }
      throw purchaseErr
    }

    if (sku.startsWith('second_chance_')) {
      await admin.from('unlocks').upsert(
        {
          user_id: userId,
          unlock_type: 'continue',
          unlock_key: purchase.id,
          source_purchase_id: purchase.id,
        },
        { onConflict: 'user_id,unlock_type,unlock_key' },
      )
    } else if (sku.startsWith('pack_')) {
      const packId = sku.slice('pack_'.length)
      await admin.from('unlocks').upsert(
        {
          user_id: userId,
          unlock_type: 'pack',
          unlock_key: packId,
          source_purchase_id: purchase.id,
        },
        { onConflict: 'user_id,unlock_type,unlock_key' },
      )
    } else if (sku.startsWith('track_')) {
      const trackKey = sku.slice('track_'.length)
      await admin.from('unlocks').upsert(
        {
          user_id: userId,
          unlock_type: 'chart',
          unlock_key: trackKey,
          source_purchase_id: purchase.id,
        },
        { onConflict: 'user_id,unlock_type,unlock_key' },
      )
    }

    return jsonResponse({ ok: true, purchase }, 200, req)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Record failed'
    const status =
      message.includes('DID') ||
      message.includes('issuer') ||
      message.includes('token')
        ? 401
        : 500
    return jsonResponse({ ok: false, error: message }, status, req)
  }
})
