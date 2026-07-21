/**
 * G18 Sentry browser wiring — env-gated.
 * Never hardcode DSNs; set VITE_SENTRY_DSN in apps/web/.env only.
 */

import * as Sentry from '@sentry/react'

let initialized = false

export function isSentryConfigured(): boolean {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  return typeof dsn === 'string' && dsn.trim().length > 0
}

/** Init once before React mount. No-op (and does not throw) without DSN. */
export function initSentry(): boolean {
  if (initialized) return isSentryConfigured()
  initialized = true
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (typeof dsn !== 'string' || !dsn.trim()) return false

  try {
    Sentry.init({
      dsn: dsn.trim(),
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
      sendDefaultPii: false,
    })
  } catch {
    return false
  }
  return true
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!isSentryConfigured()) return
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context)
    }
    Sentry.captureException(error)
  })
}

/** Manual test event for verifying the project after human creates DSN. */
export function captureTestMessage(message = 'beatlane_g18_sentry_smoke'): void {
  if (!isSentryConfigured()) return
  Sentry.captureMessage(message, 'info')
}
