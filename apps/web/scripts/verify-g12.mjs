/**
 * G12 smoke: catalog counts + free resolve + paid gate (no Magic / no spend).
 *
 *   node apps/web/scripts/verify-g12.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '../.env')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)

const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) throw new Error('Missing VITE_SUPABASE_* in apps/web/.env')

async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
  })
  if (!res.ok) throw new Error(`REST ${path} → ${res.status}`)
  return res.json()
}

async function resolve(chartId) {
  const res = await fetch(`${url}/functions/v1/resolve-chart-assets`, {
    method: 'POST',
    headers: {
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chartId }),
  })
  const body = await res.json()
  return { status: res.status, body }
}

const charts = await rest(
  'charts?is_listed=eq.true&select=id,track_key,is_public,difficulty',
)
const packs = await rest('packs?select=id,title,price_cusd')
const freeKeys = new Set(
  charts.filter((c) => c.is_public).map((c) => c.track_key),
)
const paidKeys = new Set(
  charts.filter((c) => !c.is_public).map((c) => c.track_key),
)

const freeResolve = await resolve('night-drive-normal')
const paidResolve = await resolve('lagos-after-normal')

let chartOk = false
if (freeResolve.body.ok && freeResolve.body.chartUrl) {
  const r = await fetch(freeResolve.body.chartUrl)
  chartOk = r.ok
  if (chartOk) {
    const j = await r.json()
    chartOk = j.id === 'night-drive-normal' && Array.isArray(j.notes)
  }
}

const report = {
  freeTracks: freeKeys.size,
  paidTracks: paidKeys.size,
  freeChartRows: charts.filter((c) => c.is_public).length,
  packs: packs.map((p) => ({ id: p.id, price: Number(p.price_cusd) })),
  freeResolveOk: freeResolve.body.ok === true && chartOk,
  paidGated: paidResolve.status === 403 || paidResolve.body?.error === 'Unlock required',
}

console.log(JSON.stringify(report, null, 2))

const pass =
  report.freeTracks === 8 &&
  report.paidTracks >= 1 &&
  report.packs.some((p) => p.id === 'afrobeats') &&
  report.freeResolveOk &&
  report.paidGated

if (!pass) {
  console.error('G12 verify FAILED')
  process.exit(1)
}
console.log('G12 verify PASS')
