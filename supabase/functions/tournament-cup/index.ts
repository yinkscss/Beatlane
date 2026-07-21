/**
 * G16 Blitz tournaments — lobby, enter receipt hook, submit run, rank, payout stub.
 *
 * Auth: Magic DID (verify_jwt OFF).
 * Entry fee money path: Celo Mainnet cUSD via record-purchase (sku tournament_entry_<id>).
 * Optional TournamentVault (Celo Sepolia) address is informational / on-chain stub.
 * Rake: 15% (Q19). Helpers off — enforced client-side via helpersDisabled('blitz').
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
  action?: 'lobby' | 'submit' | 'rank' | 'payout_stub'
  tournamentId?: string
  slug?: string
  tiles?: number
  score?: number
  comboMax?: number
  durationMs?: number
  chartId?: string
  taps?: { t: number; lane: number }[]
}

const RAKE_BPS = 1500
const TOP_PAID = 10

/** Simple top-10 split of prize pool (stub — not legal advice). */
function stubPrizes(prizePool: number, places: number): number[] {
  const weights = [30, 20, 12, 8, 7, 6, 5, 5, 4, 3]
  const n = Math.min(places, TOP_PAID, weights.length)
  const slice = weights.slice(0, n)
  const sum = slice.reduce((a, b) => a + b, 0)
  return slice.map((w) => Math.round(((prizePool * w) / sum) * 100) / 100)
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
    const action = body.action ?? 'lobby'

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

    await admin.from('profiles').upsert(
      { id: userId, magic_issuer: issuer },
      { onConflict: 'id' },
    )

    // Resolve tournament
    let tournamentQuery = admin.from('tournaments').select('*')
    if (body.tournamentId) {
      tournamentQuery = tournamentQuery.eq('id', body.tournamentId)
    } else {
      tournamentQuery = tournamentQuery.eq(
        'slug',
        body.slug?.trim() || 'friday-finger',
      )
    }
    const { data: tournament, error: tErr } = await tournamentQuery.maybeSingle()
    if (tErr) throw tErr
    if (!tournament) {
      return jsonResponse({ ok: false, error: 'Tournament not found' }, 404, req)
    }

    if (action === 'lobby') {
      const { count: entrantCount } = await admin
        .from('tournament_entries')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)

      const { data: myEntry } = await admin
        .from('tournament_entries')
        .select('id, tx_hash, amount_cusd, created_at')
        .eq('tournament_id', tournament.id)
        .eq('user_id', userId)
        .maybeSingle()

      const { data: myRun } = await admin
        .from('tournament_runs')
        .select('id, tiles, score, combo_max, created_at')
        .eq('tournament_id', tournament.id)
        .eq('user_id', userId)
        .maybeSingle()

      const entrants = entrantCount ?? 0
      const gross = entrants * Number(tournament.entry_fee_cusd)
      const rake = Math.round(gross * (RAKE_BPS / 10_000) * 100) / 100
      const prizePool = Math.round((gross - rake) * 100) / 100

      return jsonResponse(
        {
          ok: true,
          tournament,
          entrants,
          capacity: tournament.capacity,
          grossPoolCusd: gross,
          rakeCusd: rake,
          prizePoolCusd: prizePool,
          rakeBps: RAKE_BPS,
          helpersDisabled: true,
          bannedObstacles: ['reverse', 'fog', 'fake_gap'],
          myEntry,
          myRun,
          contractAddress:
            Deno.env.get('TOURNAMENT_CONTRACT_ADDRESS') ??
            tournament.contract_address ??
            null,
          networkNote:
            'Entry fees: Celo Mainnet cUSD (Q07). Cup contract optional on Celo Sepolia.',
        },
        200,
        req,
      )
    }

    if (action === 'submit') {
      const { data: entry } = await admin
        .from('tournament_entries')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('user_id', userId)
        .maybeSingle()
      if (!entry) {
        return jsonResponse(
          { ok: false, error: 'Enter the cup before submitting a Blitz run' },
          403,
          req,
        )
      }

      const tiles = Math.max(0, Math.floor(Number(body.tiles ?? 0)))
      const score = Math.max(0, Math.floor(Number(body.score ?? tiles)))
      const comboMax = Math.max(0, Math.floor(Number(body.comboMax ?? 0)))
      const durationMs =
        body.durationMs != null ? Math.floor(Number(body.durationMs)) : null
      const chartId =
        typeof body.chartId === 'string' ? body.chartId : tournament.chart_id

      // Upsert best tiles for this cup (higher wins).
      const { data: existing } = await admin
        .from('tournament_runs')
        .select('id, tiles')
        .eq('tournament_id', tournament.id)
        .eq('user_id', userId)
        .maybeSingle()

      if (existing && existing.tiles >= tiles) {
        return jsonResponse(
          {
            ok: true,
            run: existing,
            kept: true,
            message: 'Existing better run kept',
          },
          200,
          req,
        )
      }

      const row = {
        tournament_id: tournament.id,
        entry_id: entry.id,
        user_id: userId,
        tiles,
        score,
        combo_max: comboMax,
        duration_ms: durationMs,
        chart_id: chartId,
        validated: false,
        taps: body.taps ?? [],
      }

      const { data: run, error: runErr } = existing
        ? await admin
            .from('tournament_runs')
            .update(row)
            .eq('id', existing.id)
            .select('id, tiles, score, combo_max, created_at')
            .single()
        : await admin
            .from('tournament_runs')
            .insert(row)
            .select('id, tiles, score, combo_max, created_at')
            .single()

      if (runErr) throw runErr
      return jsonResponse({ ok: true, run, kept: false }, 200, req)
    }

    if (action === 'rank') {
      const { data: runs, error: rErr } = await admin
        .from('tournament_runs')
        .select('user_id, tiles, score, combo_max, created_at')
        .eq('tournament_id', tournament.id)
        .order('tiles', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50)
      if (rErr) throw rErr

      const userIds = (runs ?? []).map((r) => r.user_id)
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])

      const nameById = new Map(
        (profiles ?? []).map((p) => [p.id, p.display_name ?? 'Player']),
      )

      const { count: entrantCount } = await admin
        .from('tournament_entries')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)

      const entrants = entrantCount ?? 0
      const gross = entrants * Number(tournament.entry_fee_cusd)
      const rake = Math.round(gross * (RAKE_BPS / 10_000) * 100) / 100
      const prizePool = Math.round((gross - rake) * 100) / 100
      const prizes = stubPrizes(prizePool, (runs ?? []).length)

      const board = (runs ?? []).map((r, i) => ({
        rank: i + 1,
        userId: r.user_id,
        displayName: nameById.get(r.user_id) ?? 'Player',
        tiles: r.tiles,
        score: r.score,
        comboMax: r.combo_max,
        isYou: r.user_id === userId,
        payoutStubCusd: i < prizes.length ? prizes[i] : 0,
      }))

      const you = board.find((b) => b.isYou) ?? null

      return jsonResponse(
        {
          ok: true,
          tournamentId: tournament.id,
          slug: tournament.slug,
          entrants,
          grossPoolCusd: gross,
          rakeCusd: rake,
          prizePoolCusd: prizePool,
          rakeBps: RAKE_BPS,
          board,
          you,
        },
        200,
        req,
      )
    }

    if (action === 'payout_stub') {
      // Materialize stub payout rows from current ranking (no on-chain transfer required).
      const { data: runs, error: rErr } = await admin
        .from('tournament_runs')
        .select('user_id, tiles')
        .eq('tournament_id', tournament.id)
        .order('tiles', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(TOP_PAID)
      if (rErr) throw rErr

      const { count: entrantCount } = await admin
        .from('tournament_entries')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)

      const entrants = entrantCount ?? 0
      const gross = entrants * Number(tournament.entry_fee_cusd)
      const rake = Math.round(gross * (RAKE_BPS / 10_000) * 100) / 100
      const prizePool = Math.round((gross - rake) * 100) / 100
      const prizes = stubPrizes(prizePool, (runs ?? []).length)

      const rows = (runs ?? []).map((r, i) => ({
        tournament_id: tournament.id,
        user_id: r.user_id,
        place: i + 1,
        tiles: r.tiles,
        gross_pool_cusd: gross,
        rake_cusd: rake,
        prize_cusd: prizes[i] ?? 0,
        status: 'stub' as const,
      }))

      if (rows.length) {
        const { error: upErr } = await admin
          .from('tournament_payouts')
          .upsert(rows, { onConflict: 'tournament_id,user_id' })
        if (upErr) throw upErr
      }

      await admin
        .from('tournaments')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', tournament.id)

      return jsonResponse(
        {
          ok: true,
          stub: true,
          payouts: rows,
          note:
            'Payout stub only — no Mainnet prize transfer. Optional Sepolia TournamentVault.payoutStub for on-chain demo.',
        },
        200,
        req,
      )
    }

    return jsonResponse({ ok: false, error: 'Unknown action' }, 400, req)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tournament failed'
    const status =
      message.includes('DID') ||
        message.includes('issuer') ||
        message.includes('token')
        ? 401
        : 500
    return jsonResponse({ ok: false, error: message }, status, req)
  }
})
