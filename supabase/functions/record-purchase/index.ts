/**
 * G10/G12/G14/G15: Record cUSD purchase receipt after on-chain transfer.
 *
 * Client sends Magic DID + sku/amount/txHash.
 * verify_jwt is OFF — auth is Magic DID (same as magic-profile).
 * Inserts purchases row (status=confirmed) + unlocks for continues / packs / tracks / helpers.
 * Boast (sku=boast): also inserts public.boasts + returns shareSlug.
 * Network metadata: Celo Mainnet (chainId 42220) for shop SKUs — locked Q07.
 * Boast mint is Celo Sepolia (11142220) — Alfajores 44787 sunset Sep 2025.
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

/** G14 helper catalog prices (cUSD). */
const HELPER_PRICES: Record<string, number> = {
  slow_mo: 0.19,
  shield: 0.29,
}

/** G15 Boast mint price (cUSD) — Celo Sepolia attestation. */
const BOAST_PRICE = 0.29

function shareSlugFromTx(txHash: string): string {
  // Short share id from tx hash (design-pack style /b/4c2…).
  return txHash.slice(2, 10).toLowerCase()
}

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

    // Price check for catalog / helper / boast SKUs.
    if (sku === 'boast') {
      if (BOAST_PRICE.toFixed(2) !== amountCusd.toFixed(2)) {
        return jsonResponse(
          { ok: false, error: 'amountCusd does not match boast price' },
          400,
          req,
        )
      }
    } else if (sku in HELPER_PRICES) {
      const want = HELPER_PRICES[sku]
      if (want.toFixed(2) !== amountCusd.toFixed(2)) {
        return jsonResponse(
          { ok: false, error: 'amountCusd does not match helper price' },
          400,
          req,
        )
      }
    } else if (sku.startsWith('pack_')) {
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

    const isBoast = sku === 'boast'
    const metadata = {
      ...(body.metadata ?? {}),
      network: isBoast ? 'celo-sepolia' : 'celo-mainnet',
      chainId: isBoast ? 11142220 : 42220,
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
    } else if (sku in HELPER_PRICES) {
      await admin.from('unlocks').upsert(
        {
          user_id: userId,
          unlock_type: 'helper',
          unlock_key: `${sku}:${purchase.id}`,
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

    if (isBoast) {
      const meta = (body.metadata ?? {}) as Record<string, unknown>
      const combo = Number(meta.combo ?? 0)
      const score = Number(meta.score ?? 0)
      const chartTitle =
        typeof meta.chartTitle === 'string' ? meta.chartTitle : null
      const mode = typeof meta.mode === 'string' ? meta.mode : 'classic'
      const onChainId =
        meta.onChainId != null && meta.onChainId !== ''
          ? Number(meta.onChainId)
          : null
      const receiptHash =
        typeof meta.receiptHash === 'string' ? meta.receiptHash : null
      const slug =
        typeof meta.shareSlug === 'string' && meta.shareSlug.length >= 4
          ? meta.shareSlug
          : shareSlugFromTx(txHash)

      const { data: boast, error: boastErr } = await admin
        .from('boasts')
        .insert({
          user_id: userId,
          purchase_id: purchase.id,
          combo: Number.isFinite(combo) ? Math.max(0, Math.floor(combo)) : 0,
          score: Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0,
          chart_title: chartTitle,
          mode,
          on_chain_id: onChainId,
          tx_hash: txHash.toLowerCase(),
          receipt_hash: receiptHash,
          share_slug: slug,
          metadata,
        })
        .select(
          'id, share_slug, tx_hash, receipt_hash, combo, score, chart_title, mode, on_chain_id, created_at',
        )
        .single()

      if (boastErr) {
        if (boastErr.code === '23505') {
          // Duplicate tx — return existing boast if present.
          const { data: existing } = await admin
            .from('boasts')
            .select(
              'id, share_slug, tx_hash, receipt_hash, combo, score, chart_title, mode, on_chain_id, created_at',
            )
            .eq('tx_hash', txHash.toLowerCase())
            .maybeSingle()
          return jsonResponse(
            { ok: true, purchase, boast: existing, shareSlug: existing?.share_slug },
            200,
            req,
          )
        }
        throw boastErr
      }

      return jsonResponse(
        { ok: true, purchase, boast, shareSlug: boast.share_slug },
        200,
        req,
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
