/**
 * G9: Upsert profiles from a Magic session.
 *
 * Client sends Magic DID token + issuer/email/wallet from magic.user.getInfo().
 * verify_jwt is OFF — auth is Magic DID, not Supabase JWT.
 * When MAGIC_SECRET_KEY is set, DID is validated via Magic Admin SDK.
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
    if (!issuer) {
      return jsonResponse({ ok: false, error: 'Missing issuer' }, 400, req)
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
    const id = await profileIdFromIssuer(issuer)
    const email = body.email?.trim() || null
    const wallet = body.walletAddress?.trim() || null
    const displayName =
      body.displayName?.trim() ||
      (email ? email.split('@')[0] : null) ||
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

    if (error) throw error

    return jsonResponse(
      {
        ok: true,
        profile: data,
        didVerified: Boolean(magicSecret),
      },
      200,
      req,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upsert failed'
    const status =
      message.includes('DID') || message.includes('issuer') || message.includes('token')
        ? 401
        : 500
    return jsonResponse({ ok: false, error: message }, status, req)
  }
})
