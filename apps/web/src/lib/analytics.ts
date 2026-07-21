/**
 * G18 PostHog product analytics — env-gated funnels.
 * Never hardcode keys; set VITE_POSTHOG_KEY (phc_ project token) in apps/web/.env only.
 * Personal API keys (phx_) are for private API setup — not for the browser SDK.
 */

import posthog from 'posthog-js'

/** Locked funnel event names (ROADMAP G18). */
export const FUNNEL_EVENTS = {
  start_run: 'start_run',
  miss: 'miss',
  purchase_continue: 'purchase_continue',
  unlock_pack: 'unlock_pack',
} as const

export type FunnelEvent = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS]

let initialized = false

/** Project API keys start with phc_; personal tokens (phx_) must not be used client-side. */
export function isProjectApiKey(key: string): boolean {
  return key.trim().startsWith('phc_')
}

export function isPostHogConfigured(): boolean {
  const key = import.meta.env.VITE_POSTHOG_KEY
  return typeof key === 'string' && isProjectApiKey(key)
}

/** Init once before React mount. No-op (and does not throw) without a phc_ key. */
export function initAnalytics(): boolean {
  if (initialized) return isPostHogConfigured()
  initialized = true
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (typeof key !== 'string' || !key.trim()) return false
  if (!isProjectApiKey(key)) {
    console.warn(
      '[analytics] VITE_POSTHOG_KEY must be a project API key (phc_…), not a personal token',
    )
    return false
  }

  const host =
    typeof import.meta.env.VITE_POSTHOG_HOST === 'string' &&
    import.meta.env.VITE_POSTHOG_HOST.trim()
      ? import.meta.env.VITE_POSTHOG_HOST.trim()
      : 'https://us.i.posthog.com'

  try {
    posthog.init(key.trim(), {
      api_host: host,
      autocapture: false,
      capture_pageview: true,
      persistence: 'localStorage+cookie',
    })
  } catch {
    return false
  }
  return true
}

export function track(
  event: FunnelEvent | string,
  properties?: Record<string, unknown>,
): void {
  if (!isPostHogConfigured()) return
  try {
    posthog.capture(event, properties)
  } catch {
    // Never break gameplay for analytics
  }
}

export function trackStartRun(props: {
  mode: string
  chartId: string
}): void {
  track(FUNNEL_EVENTS.start_run, props)
}

export function trackMiss(props: {
  mode: string
  reason: string
  score: number
}): void {
  track(FUNNEL_EVENTS.miss, props)
}

export function trackPurchaseContinue(props: {
  sku: string
  amountCusd: number
  reviveIndex: number
}): void {
  track(FUNNEL_EVENTS.purchase_continue, props)
}

export function trackUnlockPack(props: {
  packId: string
  sku: string
  amountCusd: number
}): void {
  track(FUNNEL_EVENTS.unlock_pack, props)
}
