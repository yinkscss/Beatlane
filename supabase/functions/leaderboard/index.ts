/**
 * G13: HTTP-pollable leaderboard (Daily / Classic).
 * Public read of validated scores; optional Magic DID for "you" row.
 * verify_jwt OFF.
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

type Body = {
  board?: string
  day?: string
  limit?: number
  issuer?: string
}

type BoardRow = {
  rank: number
  userId: string
  displayName: string
  score: number
  comboMax: number
  chartId: string
  runId: string
  isYou: boolean
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, req)
  }

  try {
    let board = 'daily'
    let day = utcDayString()
    let limit = 50
    let issuer: string | undefined

    if (req.method === 'GET') {
      const url = new URL(req.url)
      board = url.searchParams.get('board') ?? 'daily'
      day = url.searchParams.get('day') ?? day
      const lim = Number(url.searchParams.get('limit') ?? '50')
      if (Number.isFinite(lim)) limit = Math.min(100, Math.max(1, Math.floor(lim)))
    } else {
      const body = (await req.json().catch(() => ({}))) as Body
      board = body.board?.trim() || 'daily'
      if (body.day?.trim()) day = body.day.trim()
      if (typeof body.limit === 'number' && Number.isFinite(body.limit)) {
        limit = Math.min(100, Math.max(1, Math.floor(body.limit)))
      }
      issuer = body.issuer?.trim()
    }

    if (board !== 'daily' && board !== 'classic') {
      return jsonResponse({ ok: false, error: 'Invalid board' }, 400, req)
    }

    let youId: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ') && issuer) {
      try {
        const didToken = authHeader.slice('Bearer '.length).trim()
        const claim = parseDidClaim(didToken)
        assertDidClaim(claim, issuer)
        youId = await profileIdFromIssuer(issuer)
      } catch {
        youId = null
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service env')
    }
    const admin = createClient(supabaseUrl, serviceKey)

    let query = admin
      .from('runs')
      .select('id, user_id, chart_id, score, combo_max, created_at')
      .eq('validated', true)
      .eq('mode', board === 'daily' ? 'daily' : 'classic')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(400)

    if (board === 'daily') {
      query = query.eq('daily_day', day)
    }

    const { data: rows, error } = await query
    if (error) throw error

    // Best score per user
    const best = new Map<
      string,
      {
        id: string
        user_id: string
        chart_id: string
        score: number
        combo_max: number
        display_name: string | null
      }
    >()

    for (const r of rows ?? []) {
      const uid = r.user_id as string
      if (best.has(uid)) continue
      best.set(uid, {
        id: r.id as string,
        user_id: uid,
        chart_id: r.chart_id as string,
        score: r.score as number,
        combo_max: r.combo_max as number,
        display_name: null,
      })
    }

    const userIds = [...best.keys()]
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)
      for (const p of profiles ?? []) {
        const row = best.get(p.id as string)
        if (row) row.display_name = (p.display_name as string | null) ?? null
      }
    }

    const ranked = [...best.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    const entries: BoardRow[] = ranked.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      displayName: r.display_name?.trim() || `player-${r.user_id.slice(0, 6)}`,
      score: r.score,
      comboMax: r.combo_max,
      chartId: r.chart_id,
      runId: r.id,
      isYou: youId != null && r.user_id === youId,
    }))

    let you: BoardRow | null = entries.find((e) => e.isYou) ?? null
    if (!you && youId) {
      const all = [...best.values()].sort((a, b) => b.score - a.score)
      const idx = all.findIndex((r) => r.user_id === youId)
      if (idx >= 0) {
        const r = all[idx]
        you = {
          rank: idx + 1,
          userId: r.user_id,
          displayName: r.display_name?.trim() || `player-${r.user_id.slice(0, 6)}`,
          score: r.score,
          comboMax: r.combo_max,
          chartId: r.chart_id,
          runId: r.id,
          isYou: true,
        }
      }
    }

    return jsonResponse(
      {
        ok: true,
        board,
        day: board === 'daily' ? day : null,
        polledAt: new Date().toISOString(),
        entries,
        you,
      },
      200,
      req,
    )
  } catch (err) {
    console.error('leaderboard error', err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      400,
      req,
    )
  }
})
