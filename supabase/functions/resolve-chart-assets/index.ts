/**
 * G12: Resolve signed Storage URLs for a chart after access check.
 *
 * Public charts: no auth required.
 * Paid charts: Magic DID + pack/track unlock required.
 * verify_jwt OFF — Magic DID when present.
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
  chartId?: string
  issuer?: string
}

type ChartRow = {
  id: string
  title: string
  difficulty: string
  bpm: number
  is_public: boolean
  track_key: string | null
  pack_id: string | null
  audio_path: string | null
  chart_path: string | null
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, req)
  }

  try {
    const body = (await req.json()) as Body
    const chartId = body.chartId?.trim()
    if (!chartId) {
      return jsonResponse({ ok: false, error: 'Missing chartId' }, 400, req)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service env')
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: chart, error: chartErr } = await admin
      .from('charts')
      .select(
        'id, title, difficulty, bpm, is_public, track_key, pack_id, audio_path, chart_path',
      )
      .eq('id', chartId)
      .maybeSingle()

    if (chartErr) throw chartErr
    if (!chart) {
      return jsonResponse({ ok: false, error: 'Chart not found' }, 404, req)
    }

    const row = chart as ChartRow
    if (!row.audio_path || !row.chart_path) {
      return jsonResponse({ ok: false, error: 'Chart assets missing' }, 404, req)
    }

    let allowed = row.is_public === true

    if (!allowed) {
      const authHeader = req.headers.get('Authorization')
      const issuer = body.issuer?.trim()
      if (!authHeader?.startsWith('Bearer ') || !issuer) {
        return jsonResponse(
          { ok: false, error: 'Unlock required' },
          403,
          req,
        )
      }
      const didToken = authHeader.slice('Bearer '.length).trim()
      const claim = parseDidClaim(didToken)
      assertDidClaim(claim, issuer)

      const userId = await profileIdFromIssuer(issuer)
      const { data: unlocks, error: unlockErr } = await admin
        .from('unlocks')
        .select('unlock_type, unlock_key')
        .eq('user_id', userId)
        .in('unlock_type', ['chart', 'pack'])

      if (unlockErr) throw unlockErr

      allowed = (unlocks ?? []).some((u) => {
        if (u.unlock_type === 'pack' && row.pack_id && u.unlock_key === row.pack_id) {
          return true
        }
        if (
          u.unlock_type === 'chart' &&
          row.track_key &&
          u.unlock_key === row.track_key
        ) {
          return true
        }
        if (u.unlock_type === 'chart' && u.unlock_key === row.id) {
          return true
        }
        return false
      })

      if (!allowed) {
        return jsonResponse(
          { ok: false, error: 'Unlock required' },
          403,
          req,
        )
      }
    }

    const [audioSigned, chartSigned] = await Promise.all([
      admin.storage.from('audio').createSignedUrl(row.audio_path, 3600),
      admin.storage.from('charts').createSignedUrl(row.chart_path, 3600),
    ])

    if (audioSigned.error) throw audioSigned.error
    if (chartSigned.error) throw chartSigned.error

    return jsonResponse(
      {
        ok: true,
        chartId: row.id,
        title: row.title,
        difficulty: row.difficulty,
        bpm: row.bpm,
        audioUrl: audioSigned.data.signedUrl,
        chartUrl: chartSigned.data.signedUrl,
      },
      200,
      req,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Resolve failed'
    const status =
      message.includes('DID') ||
      message.includes('issuer') ||
      message.includes('token')
        ? 401
        : 500
    return jsonResponse({ ok: false, error: message }, status, req)
  }
})
