/**
 * G17 Season Pass grant schedule — continues + chart unlocks only (no cosmetics).
 * Shared by record-purchase (on buy) and season-pass (status / cron-style grant).
 */

export type SeasonRow = {
  id: string
  slug: string
  title: string
  price_cusd: number
  starts_at: string
  ends_at: string
  status: string
  metadata: Record<string, unknown>
}

export type SeasonRewardRow = {
  id: string
  season_id: string
  day_offset: number
  sort_order: number
  reward_type: 'continue' | 'chart'
  continue_count: number
  track_key: string | null
  label: string
}

export const SEASON_PASS_SKU_PREFIX = 'season_pass_'
export const SEASON_PASS_PRICE = 2.99
export const SEASON_DURATION_DAYS = 28

export function isSeasonPassSku(sku: string): boolean {
  return sku === 'season_pass' || sku.startsWith(SEASON_PASS_SKU_PREFIX)
}

export function seasonSlugFromSku(sku: string): string | null {
  if (sku === 'season_pass') return null
  if (sku.startsWith(SEASON_PASS_SKU_PREFIX)) {
    return sku.slice(SEASON_PASS_SKU_PREFIX.length) || null
  }
  return null
}

export function seasonPassSku(slug: string): string {
  return `${SEASON_PASS_SKU_PREFIX}${slug}`
}

/** Whole days elapsed since season start (UTC), clamped ≥ 0. */
export function seasonDayElapsed(startsAt: string, now = new Date()): number {
  const start = new Date(startsAt).getTime()
  if (!Number.isFinite(start)) return 0
  const ms = now.getTime() - start
  if (ms < 0) return 0
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

export function daysRemaining(endsAt: string, now = new Date()): number {
  const end = new Date(endsAt).getTime()
  if (!Number.isFinite(end)) return 0
  const ms = end - now.getTime()
  if (ms <= 0) return 0
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

type SupabaseLike = {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any
}

/**
 * Grant all due rewards for a pass holder (day_offset <= days elapsed).
 * Idempotent via season_reward_grants unique (user_id, reward_id).
 */
export async function grantDueSeasonRewards(
  admin: SupabaseLike,
  opts: {
    userId: string
    season: SeasonRow
    rewards: SeasonRewardRow[]
    purchaseId: string | null
    now?: Date
  },
): Promise<{ grantedRewardIds: string[]; dayElapsed: number }> {
  const now = opts.now ?? new Date()
  const dayElapsed = seasonDayElapsed(opts.season.starts_at, now)
  const due = opts.rewards.filter((r) => r.day_offset <= dayElapsed)
  const grantedRewardIds: string[] = []

  for (const reward of due) {
    // Soft ban: never grant cosmetic reward types.
    if (reward.reward_type !== 'continue' && reward.reward_type !== 'chart') {
      continue
    }

    if (reward.reward_type === 'continue') {
      const n = Math.max(0, Math.floor(reward.continue_count))
      for (let i = 1; i <= n; i++) {
        const { error } = await admin.from('unlocks').upsert(
          {
            user_id: opts.userId,
            unlock_type: 'continue',
            unlock_key: `season:${opts.season.slug}:${reward.id}:${i}`,
            source_purchase_id: opts.purchaseId,
          },
          { onConflict: 'user_id,unlock_type,unlock_key' },
        )
        if (error) throw new Error(error.message)
      }
    } else if (reward.reward_type === 'chart' && reward.track_key) {
      const { error } = await admin.from('unlocks').upsert(
        {
          user_id: opts.userId,
          unlock_type: 'chart',
          unlock_key: reward.track_key,
          source_purchase_id: opts.purchaseId,
        },
        { onConflict: 'user_id,unlock_type,unlock_key' },
      )
      if (error) throw new Error(error.message)
    }

    const { error: grantErr } = await admin.from('season_reward_grants').insert({
      season_id: opts.season.id,
      reward_id: reward.id,
      user_id: opts.userId,
      source_purchase_id: opts.purchaseId,
    })
    if (grantErr) {
      if (grantErr.code === '23505') continue
      throw new Error(grantErr.message)
    }
    grantedRewardIds.push(reward.id)
  }

  return { grantedRewardIds, dayElapsed }
}
