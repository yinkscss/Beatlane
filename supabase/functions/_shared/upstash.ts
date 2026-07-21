/**
 * Upstash Redis REST rate limit for Edge Functions.
 * When URL/TOKEN unset: degrade open (allow) so code path verifies without live Redis.
 * Set secrets for live anti-spam: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 */

export type RateLimitResult = {
  allowed: boolean
  /** true when Redis env missing — submit proceeds without hard limit */
  degraded: boolean
  remaining?: number
  limit?: number
  error?: string
}

const DEFAULT_LIMIT = 12
const WINDOW_SEC = 60

export async function rateLimitSubmit(
  key: string,
  limit = DEFAULT_LIMIT,
  windowSec = WINDOW_SEC,
): Promise<RateLimitResult> {
  const url = Deno.env.get('UPSTASH_REDIS_REST_URL')?.trim()
  const token = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')?.trim()

  if (!url || !token) {
    return { allowed: true, degraded: true }
  }

  const redisKey = `beatlane:rl:submit:${key}`
  try {
    // INCR + expire on first hit (pipeline)
    const pipe = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['EXPIRE', redisKey, String(windowSec), 'NX'],
      ]),
    })

    if (!pipe.ok) {
      const text = await pipe.text()
      console.error('Upstash pipeline error', pipe.status, text)
      // Fail open with degraded flag so a Redis blip does not brick Daily
      return { allowed: true, degraded: true, error: `upstash ${pipe.status}` }
    }

    const results = (await pipe.json()) as Array<{ result?: number | string }>
    const count = Number(results?.[0]?.result ?? 0)
    const remaining = Math.max(0, limit - count)
    if (count > limit) {
      return {
        allowed: false,
        degraded: false,
        remaining: 0,
        limit,
      }
    }
    return {
      allowed: true,
      degraded: false,
      remaining,
      limit,
    }
  } catch (err) {
    console.error('Upstash rate limit failed', err)
    return { allowed: true, degraded: true, error: String(err) }
  }
}
