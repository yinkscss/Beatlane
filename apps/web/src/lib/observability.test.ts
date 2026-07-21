import { describe, expect, it } from 'vitest'
import {
  FUNNEL_EVENTS,
  isPostHogConfigured,
  isProjectApiKey,
  track,
  trackMiss,
  trackPurchaseContinue,
  trackStartRun,
  trackUnlockPack,
} from '@/lib/analytics'
import {
  captureException,
  captureTestMessage,
  isSentryConfigured,
} from '@/lib/sentry'

describe('observability — env gating (no secrets in CI)', () => {
  it('exposes locked PostHog funnel event names', () => {
    expect(FUNNEL_EVENTS).toEqual({
      start_run: 'start_run',
      miss: 'miss',
      purchase_continue: 'purchase_continue',
      unlock_pack: 'unlock_pack',
    })
  })

  it('accepts only phc_ project API keys (rejects personal phx_)', () => {
    expect(isProjectApiKey('phc_example_project_token')).toBe(true)
    expect(isProjectApiKey('phx_example_personal_token')).toBe(false)
    expect(isProjectApiKey('')).toBe(false)
  })

  it('reports unconfigured when keys/DSN unset', () => {
    // CI has empty VITE_* — SDKs must stay dormant
    expect(isPostHogConfigured()).toBe(false)
    expect(isSentryConfigured()).toBe(false)
  })

  it('track helpers and Sentry capture do not throw without keys', () => {
    expect(() => trackStartRun({ mode: 'classic', chartId: 'x' })).not.toThrow()
    expect(() =>
      trackMiss({ mode: 'classic', reason: 'miss', score: 0 }),
    ).not.toThrow()
    expect(() =>
      trackPurchaseContinue({ sku: 'second_chance_1', amountCusd: 0.49, reviveIndex: 0 }),
    ).not.toThrow()
    expect(() =>
      trackUnlockPack({ packId: 'afrobeats', sku: 'pack_afrobeats', amountCusd: 1.99 }),
    ).not.toThrow()
    expect(() => track(FUNNEL_EVENTS.start_run)).not.toThrow()
    expect(() => captureException(new Error('g18 smoke'))).not.toThrow()
    expect(() => captureTestMessage('beatlane_g18_sentry_smoke')).not.toThrow()
  })
})
