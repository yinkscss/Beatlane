/**
 * G17 Season Pass — progress UI + grant schedule.
 *
 * Auth: Magic DID (verify_jwt OFF).
 * Purchase money path: Celo Mainnet cUSD via record-purchase (sku season_pass_<slug>).
 * Grants: on status fetch (and optional cron action=grant_due with CRON_SECRET).
 * Rewards: continues + chart unlocks only — no cosmetics (Q23).
 * Duration: 4 weeks (Q20). Price: $2.99 cUSD.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { captureEdgeException } from '../_shared/sentry.ts'
import {
  assertDidClaim,
  parseDidClaim,
  profileIdFromIssuer,
} from '../_shared/magicProfile.ts'
import {
  daysRemaining,
  grantDueSeasonRewards,
  seasonDayElapsed,
  seasonPassSku,
  SEASON_DURATION_DAYS,
  SEASON_PASS_PRICE,
  type SeasonRewardRow,
  type SeasonRow,
} from '../_shared/seasonPassGrants.ts'

type Body = {
  issuer?: string
  action?: 'status' | 'grant' | 'grant_due'
  slug?: string
}

const DEFAULT_SLUG = 'season-1'

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, req)
  }

  try {
    const body = (await req.json()) as Body
    const action = body.action ?? 'status'
    const slug = body.slug?.trim() || DEFAULT_SLUG

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service env')
    }
    const admin = createClient(supabaseUrl, serviceKey)

    // Cron / scheduled grant for all holders (optional).
    if (action === 'grant_due') {
      const cronSecret = Deno.env.get('SEASON_PASS_CRON_SECRET')
      const authHeader = req.headers.get('Authorization') ?? ''
      const bearer = authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : ''
      if (!cronSecret || bearer !== cronSecret) {
        return jsonResponse({ ok: false, error: 'Unauthorized cron' }, 401, req)
      }

      const { data: season, error: seasonErr } = await admin
        .from('seasons')
        .select('id, slug, title, price_cusd, starts_at, ends_at, status, metadata')
        .eq('slug', slug)
        .maybeSingle()
      if (seasonErr) throw seasonErr
      if (!season) {
        return jsonResponse({ ok: false, error: 'Unknown season' }, 404, req)
      }

      const { data: rewards, error: rewardsErr } = await admin
        .from('season_rewards')
        .select(
          'id, season_id, day_offset, sort_order, reward_type, continue_count, track_key, label',
        )
        .eq('season_id', season.id)
        .order('sort_order', { ascending: true })
      if (rewardsErr) throw rewardsErr

      const { data: holders, error: holdersErr } = await admin
        .from('unlocks')
        .select('user_id, source_purchase_id')
        .eq('unlock_type', 'season_pass')
        .eq('unlock_key', season.slug)
      if (holdersErr) throw holdersErr

      let holdersProcessed = 0
      let totalGranted = 0
      for (const h of holders ?? []) {
        const result = await grantDueSeasonRewards(admin, {
          userId: h.user_id as string,
          season: season as SeasonRow,
          rewards: (rewards ?? []) as SeasonRewardRow[],
          purchaseId: (h.source_purchase_id as string | null) ?? null,
        })
        holdersProcessed += 1
        totalGranted += result.grantedRewardIds.length
      }

      return jsonResponse(
        {
          ok: true,
          action: 'grant_due',
          slug: season.slug,
          holdersProcessed,
          totalGranted,
          dayElapsed: seasonDayElapsed(season.starts_at),
          network: 'celo-mainnet',
        },
        200,
        req,
      )
    }

    // Player paths require Magic DID.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, error: 'Missing DID token' }, 401, req)
    }
    const didToken = authHeader.slice('Bearer '.length).trim()
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

    const userId = await profileIdFromIssuer(issuer)
    await admin.from('profiles').upsert(
      { id: userId, magic_issuer: issuer },
      { onConflict: 'id' },
    )

    const { data: season, error: seasonErr } = await admin
      .from('seasons')
      .select('id, slug, title, price_cusd, starts_at, ends_at, status, metadata')
      .eq('slug', slug)
      .maybeSingle()
    if (seasonErr) throw seasonErr
    if (!season) {
      return jsonResponse({ ok: false, error: 'Unknown season' }, 404, req)
    }

    const { data: rewards, error: rewardsErr } = await admin
      .from('season_rewards')
      .select(
        'id, season_id, day_offset, sort_order, reward_type, continue_count, track_key, label',
      )
      .eq('season_id', season.id)
      .order('sort_order', { ascending: true })
    if (rewardsErr) throw rewardsErr

    const rewardList = (rewards ?? []) as SeasonRewardRow[]

    // Cosmetic ban: reject schedule rows that are not continue/chart.
    const bad = rewardList.some(
      (r) => r.reward_type !== 'continue' && r.reward_type !== 'chart',
    )
    if (bad) {
      return jsonResponse(
        { ok: false, error: 'Invalid reward schedule (cosmetics banned)' },
        500,
        req,
      )
    }

    const { data: passUnlock } = await admin
      .from('unlocks')
      .select('id, source_purchase_id, created_at')
      .eq('user_id', userId)
      .eq('unlock_type', 'season_pass')
      .eq('unlock_key', season.slug)
      .maybeSingle()

    const owned = !!passUnlock
    let newlyGranted: string[] = []
    const dayElapsed = seasonDayElapsed(season.starts_at)

    if (owned && (action === 'status' || action === 'grant')) {
      const result = await grantDueSeasonRewards(admin, {
        userId,
        season: season as SeasonRow,
        rewards: rewardList,
        purchaseId: (passUnlock?.source_purchase_id as string | null) ?? null,
      })
      newlyGranted = result.grantedRewardIds
    }

    const { data: grants } = await admin
      .from('season_reward_grants')
      .select('reward_id, granted_at')
      .eq('user_id', userId)
      .eq('season_id', season.id)

    const grantedSet = new Set((grants ?? []).map((g) => g.reward_id as string))

    const nodes = rewardList.map((r) => {
      const unlocked = owned && r.day_offset <= dayElapsed
      const claimed = grantedSet.has(r.id)
      const state: 'locked' | 'available' | 'claimed' | 'upcoming' = !owned
        ? 'locked'
        : claimed
          ? 'claimed'
          : unlocked
            ? 'available'
            : 'upcoming'
      return {
        id: r.id,
        dayOffset: r.day_offset,
        sortOrder: r.sort_order,
        rewardType: r.reward_type,
        continueCount: r.continue_count,
        trackKey: r.track_key,
        label: r.label,
        state,
        claimed,
      }
    })

    const claimedCount = nodes.filter((n) => n.claimed).length
    const unlockedCount = nodes.filter(
      (n) => n.state === 'claimed' || n.state === 'available',
    ).length

    return jsonResponse(
      {
        ok: true,
        season: {
          id: season.id,
          slug: season.slug,
          title: season.title,
          priceCusd: Number(season.price_cusd),
          startsAt: season.starts_at,
          endsAt: season.ends_at,
          status: season.status,
          durationDays: SEASON_DURATION_DAYS,
          daysRemaining: daysRemaining(season.ends_at),
          dayElapsed,
          blurb:
            typeof (season.metadata as Record<string, unknown>)?.blurb ===
            'string'
              ? ((season.metadata as Record<string, unknown>).blurb as string)
              : 'Bonus continues + track unlocks — no skins.',
        },
        sku: seasonPassSku(season.slug),
        priceCusd: SEASON_PASS_PRICE,
        owned,
        purchasedAt: passUnlock?.created_at ?? null,
        nodes,
        progress: {
          claimed: claimedCount,
          unlocked: unlockedCount,
          total: nodes.length,
        },
        newlyGranted,
        network: 'celo-mainnet',
        chainId: 42220,
        networkNote:
          'Season Pass purchases settle in cUSD on Celo Mainnet (Q07). Staging uses the same Mainnet path.',
        noCosmetics: true,
      },
      200,
      req,
    )
  } catch (err) {
    void captureEdgeException(err, { function: 'season-pass' })
    const message = err instanceof Error ? err.message : 'Season pass failed'
    const status =
      message.includes('DID') ||
      message.includes('issuer') ||
      message.includes('token')
        ? 401
        : 500
    return jsonResponse({ ok: false, error: message }, status, req)
  }
})
