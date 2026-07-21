/**
 * G12: List unlocks for a Magic user (service role — no Supabase JWT).
 * verify_jwt OFF — auth is Magic DID.
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
    const body = (await req.json()) as Body
    const issuer = body.issuer?.trim()
    if (!issuer) {
      return jsonResponse({ ok: false, error: 'Missing issuer' }, 400, req)
    }

    const claim = parseDidClaim(didToken)
    assertDidClaim(claim, issuer)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service env')
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const userId = await profileIdFromIssuer(issuer)

    const { data, error } = await admin
      .from('unlocks')
      .select('id, unlock_type, unlock_key, source_purchase_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return jsonResponse({ ok: true, unlocks: data ?? [] }, 200, req)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List failed'
    const status =
      message.includes('DID') ||
      message.includes('issuer') ||
      message.includes('token')
        ? 401
        : 500
    return jsonResponse({ ok: false, error: message }, status, req)
  }
})
