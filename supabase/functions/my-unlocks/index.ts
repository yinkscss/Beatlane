/**
 * G12: List unlocks for a session user (service role — no Supabase JWT).
 * verify_jwt OFF — auth is Magic DID or MiniPay wallet.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { profileIdFromIssuer } from '../_shared/magicProfile.ts'
import { resolveSessionAuth } from '../_shared/sessionAuth.ts'

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
    const body = (await req.json()) as Body
    const session = await resolveSessionAuth(req, body.issuer)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service env')
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const userId = await profileIdFromIssuer(session.issuer)

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
