/**
 * G13: Submit a run with tap timestamps; Daily revalidates vs chart.
 * Upstash rate limit on submit (degrades open when Redis unset).
 * Auth: Magic DID. verify_jwt OFF.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { utcDayString } from '../_shared/dailySeed.ts'
import {
  assertDidClaim,
  parseDidClaim,
  profileIdFromIssuer,
} from '../_shared/magicProfile.ts'
import {
  type ChartNoteLite,
  type TapInput,
  validateTapsAgainstChart,
} from '../_shared/tapValidate.ts'
import { rateLimitSubmit } from '../_shared/upstash.ts'

type Body = {
  issuer?: string
  mode?: string
  chartId?: string
  score?: number
  comboMax?: number
  perfects?: number
  goods?: number
  misses?: number
  durationMs?: number
  dailyDay?: string
  seed?: string
  taps?: TapInput[]
  outcome?: 'clear' | 'fail' | 'quit'
}

type ChartJson = {
  id?: string
  notes?: ChartNoteLite[]
  offset?: number
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

    const magicSecret = Deno.env.get('MAGIC_SECRET_KEY')
    if (magicSecret) {
      const { Magic } = await import('npm:@magic-sdk/admin@2')
      const magic = new Magic(magicSecret)
      magic.token.validate(didToken)
    }

    const userId = await profileIdFromIssuer(issuer)
    const rl = await rateLimitSubmit(userId)
    if (!rl.allowed) {
      return jsonResponse(
        {
          ok: false,
          error: 'Rate limit exceeded',
          rateLimit: { remaining: 0, limit: rl.limit, degraded: false },
        },
        429,
        req,
      )
    }

    const mode = body.mode?.trim()
    if (mode !== 'daily' && mode !== 'classic' && mode !== 'zen') {
      return jsonResponse({ ok: false, error: 'Invalid mode' }, 400, req)
    }

    const chartId = body.chartId?.trim()
    if (!chartId) {
      return jsonResponse({ ok: false, error: 'Missing chartId' }, 400, req)
    }

    const clientScore = body.score
    if (typeof clientScore !== 'number' || clientScore < 0 || !Number.isFinite(clientScore)) {
      return jsonResponse({ ok: false, error: 'Invalid score' }, 400, req)
    }

    const taps = Array.isArray(body.taps) ? body.taps : []
    for (const t of taps) {
      if (
        typeof t?.t !== 'number' ||
        !Number.isFinite(t.t) ||
        typeof t?.lane !== 'number' ||
        t.lane < 0 ||
        t.lane > 3
      ) {
        return jsonResponse({ ok: false, error: 'Invalid taps' }, 400, req)
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service env')
    }
    const admin = createClient(supabaseUrl, serviceKey)

    // Ensure profile
    const { error: profileErr } = await admin.from('profiles').upsert(
      { id: userId, magic_issuer: issuer },
      { onConflict: 'id' },
    )
    if (profileErr) throw profileErr

    let dailyDay: string | null = null
    let seed: string | null = null
    let validated = false
    let serverScore = clientScore
    let perfects = typeof body.perfects === 'number' ? body.perfects : 0
    let goods = typeof body.goods === 'number' ? body.goods : 0
    let misses = typeof body.misses === 'number' ? body.misses : 0
    let validation: ReturnType<typeof validateTapsAgainstChart> | null = null

    if (mode === 'daily') {
      dailyDay = body.dailyDay?.trim() || utcDayString()
      const { data: daily, error: dailyErr } = await admin
        .from('daily_tracks')
        .select('day, seed, chart_id')
        .eq('day', dailyDay)
        .maybeSingle()
      if (dailyErr) throw dailyErr
      if (!daily) {
        return jsonResponse({ ok: false, error: 'Daily challenge missing' }, 400, req)
      }
      if (daily.chart_id !== chartId) {
        return jsonResponse({ ok: false, error: 'chartId mismatch for daily' }, 400, req)
      }
      seed = daily.seed
      if (body.seed && body.seed !== seed) {
        return jsonResponse({ ok: false, error: 'seed mismatch' }, 400, req)
      }

      const { data: chartRow, error: chartErr } = await admin
        .from('charts')
        .select('chart_path')
        .eq('id', chartId)
        .maybeSingle()
      if (chartErr) throw chartErr
      if (!chartRow?.chart_path) {
        return jsonResponse({ ok: false, error: 'Chart assets missing' }, 404, req)
      }

      const { data: signed, error: signErr } = await admin.storage
        .from('charts')
        .createSignedUrl(chartRow.chart_path, 60)
      if (signErr || !signed?.signedUrl) {
        throw signErr ?? new Error('Signed URL failed')
      }

      const chartRes = await fetch(signed.signedUrl)
      if (!chartRes.ok) {
        throw new Error(`Chart fetch ${chartRes.status}`)
      }
      const chartJson = (await chartRes.json()) as ChartJson
      const notes = Array.isArray(chartJson.notes) ? chartJson.notes : []

      validation = validateTapsAgainstChart(notes, taps, clientScore)
      if (!validation.ok) {
        return jsonResponse(
          {
            ok: false,
            error: 'Tap validation failed',
            reason: validation.reason,
            validation,
            rateLimit: {
              remaining: rl.remaining,
              limit: rl.limit,
              degraded: rl.degraded,
            },
          },
          422,
          req,
        )
      }

      validated = true
      serverScore = validation.serverScore
      perfects = validation.perfects
      goods = validation.goods
      misses = validation.misses
    } else if (mode === 'classic') {
      // Classic board: accept client score but mark validated only if taps present
      // and pass a light check when taps provided.
      if (taps.length > 0) {
        const { data: chartRow, error: chartErr } = await admin
          .from('charts')
          .select('chart_path')
          .eq('id', chartId)
          .maybeSingle()
        if (!chartErr && chartRow?.chart_path) {
          const { data: signed } = await admin.storage
            .from('charts')
            .createSignedUrl(chartRow.chart_path, 60)
          if (signed?.signedUrl) {
            const chartRes = await fetch(signed.signedUrl)
            if (chartRes.ok) {
              const chartJson = (await chartRes.json()) as ChartJson
              const notes = Array.isArray(chartJson.notes) ? chartJson.notes : []
              validation = validateTapsAgainstChart(notes, taps, clientScore)
              if (validation.ok) {
                validated = true
                serverScore = validation.serverScore
                perfects = validation.perfects
                goods = validation.goods
                misses = validation.misses
              }
            }
          }
        }
      }
    }

    const comboMax =
      typeof body.comboMax === 'number' && body.comboMax >= 0
        ? Math.floor(body.comboMax)
        : 0
    const durationMs =
      typeof body.durationMs === 'number' && body.durationMs >= 0
        ? Math.floor(body.durationMs)
        : null

    const { data: run, error: runErr } = await admin
      .from('runs')
      .insert({
        user_id: userId,
        chart_id: chartId,
        mode,
        score: Math.floor(serverScore),
        combo_max: comboMax,
        perfects,
        goods,
        misses,
        duration_ms: durationMs,
        daily_day: dailyDay,
        seed,
        validated,
        client_score: Math.floor(clientScore),
        taps,
      })
      .select(
        'id, user_id, chart_id, mode, score, combo_max, perfects, goods, misses, daily_day, seed, validated, client_score, created_at',
      )
      .single()

    if (runErr) throw runErr

    return jsonResponse(
      {
        ok: true,
        run,
        validated,
        validation,
        rateLimit: {
          remaining: rl.remaining,
          limit: rl.limit,
          degraded: rl.degraded,
        },
      },
      200,
      req,
    )
  } catch (err) {
    console.error('submit-run error', err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      400,
      req,
    )
  }
})
