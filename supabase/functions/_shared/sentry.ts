/**
 * G18 Edge error capture — env-gated via SENTRY_DSN secret.
 * Uses Sentry envelope HTTP API (no npm dep in Deno).
 * Set: supabase secrets set SENTRY_DSN=https://…@….ingest.sentry.io/…
 * Never commit real DSNs.
 */

type ParsedDsn = {
  publicKey: string
  host: string
  projectId: string
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn)
    const publicKey = url.username
    const projectId = url.pathname.replace(/^\//, '').split('/')[0]
    if (!publicKey || !projectId || !url.host) return null
    return { publicKey, host: url.host, projectId }
  } catch {
    return null
  }
}

function eventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Fire-and-forget; never throws to callers. */
export async function captureEdgeException(
  err: unknown,
  context?: { function?: string; [key: string]: unknown },
): Promise<void> {
  const dsn = Deno.env.get('SENTRY_DSN')?.trim()
  if (!dsn) return

  const parsed = parseDsn(dsn)
  if (!parsed) return

  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Edge error'
  const stack = err instanceof Error ? err.stack : undefined
  const id = eventId()
  const ts = Math.floor(Date.now() / 1000)

  const payload = {
    event_id: id,
    timestamp: ts,
    platform: 'javascript',
    level: 'error',
    server_name: 'supabase-edge',
    environment: Deno.env.get('SENTRY_ENVIRONMENT') ?? 'edge',
    tags: {
      runtime: 'deno',
      ...(context?.function ? { function: String(context.function) } : {}),
    },
    extra: context ?? {},
    exception: {
      values: [
        {
          type: err instanceof Error ? err.name : 'Error',
          value: message,
          stacktrace: stack
            ? {
                frames: stack
                  .split('\n')
                  .slice(1, 12)
                  .map((line) => ({ filename: line.trim(), in_app: true })),
              }
            : undefined,
        },
      ],
    },
  }

  const envelopeHeader = JSON.stringify({
    event_id: id,
    dsn,
    sent_at: new Date().toISOString(),
  })
  const itemHeader = JSON.stringify({ type: 'event', content_type: 'application/json' })
  const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(payload)}`

  const url = `https://${parsed.host}/api/${parsed.projectId}/envelope/`
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=beatlane-edge/1.0`,
      },
      body,
    })
  } catch {
    // Swallow — observability must not fail the request
  }
}
