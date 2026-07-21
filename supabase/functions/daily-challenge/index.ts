/**
 * G13: Ensure + return today's seeded Daily Track (UTC).
 * Auth: Magic DID required (auth_all — Daily needs session).
 * verify_jwt OFF.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import {
  chartIdForDailySeed,
  dailySeedForDay,
  utcDayString,
} from '../_shared/dailySeed.ts'
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
    const body = (await req.json().catch(() => ({}))) as Body
    const issuer = body.issuer?.trim()
    if (!issuer) {
      return jsonResponse({ ok: false, error: 'Missing issuer' }, 400, req)
    }

    const claim = parseDidClaim(didToken)
    assertDidClaim(claim, issuer)
    await profileIdFromIssuer(issuer)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service env')
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const day = utcDayString()
    const seed = dailySeedForDay(day)
    const chartId = chartIdForDailySeed(seed)

    const { data: existing, error: selErr } = await admin
      .from('daily_tracks')
      .select('day, seed, chart_id')
      .eq('day', day)
      .maybeSingle()
    if (selErr) throw selErr

    let row = existing
    if (!row) {
      const { data: inserted, error: insErr } = await admin
        .from('daily_tracks')
        .insert({ day, seed, chart_id: chartId })
        .select('day, seed, chart_id')
        .single()
      if (insErr) {
        // Race: another request inserted — re-read
        const { data: raced, error: raceErr } = await admin
          .from('daily_tracks')
          .select('day, seed, chart_id')
          .eq('day', day)
          .maybeSingle()
        if (raceErr) throw raceErr
        if (!raced) throw insErr
        row = raced
      } else {
        row = inserted
      }
    }

    const { data: chart, error: chartErr } = await admin
      .from('charts')
      .select('id, title, difficulty, bpm')
      .eq('id', row.chart_id)
      .maybeSingle()
    if (chartErr) throw chartErr

    return jsonResponse(
      {
        ok: true,
        day: row.day,
        seed: row.seed,
        chartId: row.chart_id,
        chart: chart
          ? {
              id: chart.id,
              title: chart.title,
              difficulty: chart.difficulty,
              bpm: Number(chart.bpm),
            }
          : null,
      },
      200,
      req,
    )
  } catch (err) {
    console.error('daily-challenge error', err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      400,
      req,
    )
  }
})
