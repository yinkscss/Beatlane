/**
 * Upsert profiles from Magic DID or MiniPay wallet session.
 *
 * Client sends Authorization: Bearer <Magic DID | minipay:0x…>
 * plus issuer/email/wallet. verify_jwt is OFF.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { profileIdFromIssuer } from '../_shared/magicProfile.ts'
import { resolveSessionAuth } from '../_shared/sessionAuth.ts'

type Body = {
  issuer?: string
  email?: string | null
  walletAddress?: string | null
  displayName?: string | null
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, req)
  }

  try {
    const body = (await req.json()) as Body
    const session = await resolveSessionAuth(req, body.issuer)
    const issuer = session.issuer

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service env')
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const id = await profileIdFromIssuer(issuer)
    const email = body.email?.trim() || null
    const wallet =
      body.walletAddress?.trim() || session.walletAddress || null
    const displayName =
      body.displayName?.trim() ||
      (email ? email.split('@')[0] : null) ||
      (wallet ? `player-${wallet.slice(2, 6)}` : null) ||
      'player'

    const { data, error } = await admin
      .from('profiles')
      .upsert(
        {
          id,
          magic_issuer: issuer,
          display_name: displayName,
          wallet_address: wallet,
        },
        { onConflict: 'id' },
      )
      .select(
        'id, display_name, wallet_address, magic_issuer, created_at, updated_at',
      )
      .single()

    if (error) {
      const detail = [error.message, error.details, error.hint, error.code]
        .filter((x) => typeof x === 'string' && x.trim())
        .join(' · ')
      throw new Error(detail || 'Profile upsert failed')
    }

    if (!data) {
      throw new Error('Profile upsert returned no row')
    }

    return jsonResponse(
      {
        ok: true,
        profile: data,
        didVerified: session.mode === 'magic',
        authMode: session.mode,
      },
      200,
      req,
    )
  } catch (err) {
    const message = errorMessage(err)
    const status =
      message.includes('DID') ||
      message.includes('issuer') ||
      message.includes('token') ||
      message.includes('expired') ||
      message.includes('MiniPay') ||
      message.includes('mismatch')
        ? 401
        : 500
    return jsonResponse({ ok: false, error: message }, status, req)
  }
})

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; details?: unknown; code?: unknown }
    const parts = [o.message, o.details, o.code]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    if (parts.length) return parts.join(' · ')
  }
  return 'Profile upsert failed'
}
