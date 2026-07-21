/**
 * G18 live cloud prove (local only). Reads gitignored apps/web/.env.
 * Never prints full DSN / phc_ / phx_ tokens.
 *
 *   node apps/web/scripts/prove-g18-cloud.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '../.env')

function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    out[line.slice(0, i)] = line.slice(i + 1).trim()
  }
  return out
}

function redact(s, keep = 4) {
  if (!s) return '(empty)'
  return `${s.slice(0, keep)}…[REDACTED]…len=${s.length}`
}

const env = loadEnv(envPath)
const dsn = env.VITE_SENTRY_DSN
const projectKey = env.VITE_POSTHOG_KEY
const pat = env.POSTHOG_PERSONAL_API_KEY || ''
const ingestHost = (env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com').replace(
  /\/$/,
  '',
)

let failed = false

// --- Sentry ---
if (!dsn?.startsWith('http')) {
  console.error('AC1 FAIL: VITE_SENTRY_DSN missing')
  failed = true
} else {
  const u = new URL(dsn)
  const eventId = randomUUID().replace(/-/g, '')
  const message = `beatlane_g18_sentry_smoke_${Date.now()}`
  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }),
    JSON.stringify({ type: 'event', content_type: 'application/json' }),
    JSON.stringify({
      event_id: eventId,
      timestamp: Math.floor(Date.now() / 1000),
      platform: 'javascript',
      level: 'info',
      message,
      logger: 'beatlane.g18',
      tags: { gate: 'G18' },
      environment: 'development',
    }),
    '',
  ].join('\n')
  const url = `https://${u.hostname}/api/${u.pathname.replace(/^\//, '')}/envelope/`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=beatlane-g18/1.0, sentry_key=${u.username}`,
    },
    body: envelope,
  })
  const body = await res.text()
  console.log('AC1 Sentry ingest status:', res.status)
  console.log('AC1 Sentry event_id:', eventId)
  console.log('AC1 Sentry host:', u.hostname)
  console.log('AC1 Sentry response id match:', body.includes(eventId))
  if (!res.ok || !body.includes(eventId)) {
    console.error('AC1 FAIL')
    failed = true
  } else {
    console.log('AC1 PASS')
  }
}

// --- PostHog ---
if (!projectKey?.startsWith('phc_')) {
  console.error('AC2 FAIL: VITE_POSTHOG_KEY must be phc_ project key, got', redact(projectKey || ''))
  failed = true
} else {
  const distinctId = `beatlane_g18_prove_${Date.now()}`
  const names = ['start_run', 'miss', 'purchase_continue', 'unlock_pack']
  for (const event of names) {
    const res = await fetch(`${ingestHost}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: projectKey,
        event,
        distinct_id: distinctId,
        properties: {
          distinct_id: distinctId,
          mode: 'classic',
          chartId: 'g18_prove',
          reason: 'miss',
          score: 1,
          sku: 'second_chance_1',
          amountCusd: 0.49,
          reviveIndex: 0,
          packId: 'afrobeats',
          gate: 'G18',
        },
      }),
    })
    console.log('AC2 capture', event, res.status)
    if (!res.ok) failed = true
  }

  if (!pat.startsWith('phx_')) {
    console.log('AC2 WARN: POSTHOG_PERSONAL_API_KEY unset — cannot query-back; capture HTTP 200 only')
  } else {
    const appHost = ingestHost.includes('eu.')
      ? 'https://eu.posthog.com'
      : 'https://us.posthog.com'
    const projects = await fetch(`${appHost}/api/projects/`, {
      headers: { Authorization: `Bearer ${pat}` },
    })
    const projBody = await projects.json()
    const list = projBody.results || projBody
    const project = Array.isArray(list) ? list[0] : null
    if (!project?.id) {
      console.error('AC2 FAIL: cannot list projects with PAT')
      failed = true
    } else {
      let found = []
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 4000))
        const q = await fetch(`${appHost}/api/projects/${project.id}/query/`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pat}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: {
              kind: 'HogQLQuery',
              query: `SELECT event FROM events WHERE distinct_id = '${distinctId}' AND event IN ('start_run','miss','purchase_continue','unlock_pack') LIMIT 20`,
            },
            name: 'beatlane_g18_prove',
          }),
        })
        const body = await q.json()
        found = (body.results || []).map((r) => r[0])
        console.log(`AC2 poll ${i + 1}: rows=${found.length}`)
        if (new Set(found).size >= 4) break
      }
      const unique = [...new Set(found)]
      console.log('AC2 events found:', unique.join(', ') || '(none)')
      console.log('AC2 distinct_id:', distinctId)
      console.log('AC2 project_id:', project.id)
      console.log('AC2 key:', redact(projectKey))
      const missing = names.filter((e) => !unique.includes(e))
      if (missing.length) {
        console.error('AC2 FAIL missing:', missing.join(', '))
        failed = true
      } else {
        console.log('AC2 PASS')
      }
    }
  }
}

if (failed) process.exit(1)
console.log('\nG18 cloud prove PASS')
