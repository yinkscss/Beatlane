/**
 * G18 smoke: Sentry + PostHog wiring, judge/obstacle tests path, CI required check.
 *
 *   node apps/web/scripts/verify-g18.mjs
 *
 * Honest: this environment cannot create Sentry/PostHog cloud projects
 * (no sentry-cli / PostHog API tokens). SDKs are wired; human sets keys.
 * Never commit secrets.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const web = join(__dirname, '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// --- client observability modules ---
assert(existsSync(join(web, 'src/lib/sentry.ts')), 'sentry.ts')
assert(existsSync(join(web, 'src/lib/analytics.ts')), 'analytics.ts')
const sentry = read('apps/web/src/lib/sentry.ts')
assert(sentry.includes('@sentry/react'), 'sentry sdk import')
assert(sentry.includes('VITE_SENTRY_DSN'), 'sentry env gate')
assert(sentry.includes('initSentry'), 'initSentry')
const analytics = read('apps/web/src/lib/analytics.ts')
assert(analytics.includes('posthog-js'), 'posthog sdk')
assert(analytics.includes('VITE_POSTHOG_KEY'), 'posthog env gate')
assert(analytics.includes('isProjectApiKey'), 'rejects non-phc keys')
assert(analytics.includes('phc_'), 'documents phc_ project key')
for (const ev of ['start_run', 'miss', 'purchase_continue', 'unlock_pack']) {
  assert(analytics.includes(`'${ev}'`), `funnel ${ev}`)
}
console.log('client observability modules: ok')

// --- main boot ---
const main = read('apps/web/src/main.tsx')
assert(main.includes('initSentry()'), 'main initSentry')
assert(main.includes('initAnalytics()'), 'main initAnalytics')
console.log('main boot: ok')

// --- call sites ---
const play = read('apps/web/src/pages/Play.tsx')
assert(play.includes('trackStartRun'), 'start_run call site')
assert(play.includes('trackMiss'), 'miss call site')
assert(play.includes('trackPurchaseContinue'), 'purchase_continue call site')
const music = read('apps/web/src/pages/Music.tsx')
assert(music.includes('trackUnlockPack'), 'unlock_pack call site')
console.log('funnel call sites: ok')

// --- edge capture ---
assert(
  existsSync(join(root, 'supabase/functions/_shared/sentry.ts')),
  'edge sentry helper',
)
const edgeSentry = read('supabase/functions/_shared/sentry.ts')
assert(edgeSentry.includes('SENTRY_DSN'), 'edge SENTRY_DSN')
assert(edgeSentry.includes('captureEdgeException'), 'captureEdgeException')
const rec = read('supabase/functions/record-purchase/index.ts')
assert(rec.includes('captureEdgeException'), 'record-purchase capture')
const submit = read('supabase/functions/submit-run/index.ts')
assert(submit.includes('captureEdgeException'), 'submit-run capture')
console.log('edge error capture: ok')

// --- judge helpers ---
const judging = read('apps/web/src/game/judging.ts')
assert(judging.includes('gradeSpatialHit'), 'gradeSpatialHit')
assert(judging.includes('withinHitWindow'), 'withinHitWindow')
const playfield = read('apps/web/src/game/classicPlayfield.ts')
assert(playfield.includes('gradeSpatialHit'), 'playfield uses gradeSpatialHit')
console.log('judge extraction: ok')

// --- env placeholders (no secrets) ---
const envEx = read('apps/web/.env.example')
assert(envEx.includes('VITE_SENTRY_DSN='), 'env sentry placeholder')
assert(envEx.includes('VITE_POSTHOG_KEY='), 'env posthog placeholder')
assert(!/VITE_SENTRY_DSN=https:\/\//.test(envEx), 'no real sentry dsn in example')
assert(!/VITE_POSTHOG_KEY=phc_/.test(envEx), 'no real posthog key in example')
console.log('env placeholders: ok')

// --- CI required checks path ---
const ci = read('.github/workflows/ci.yml')
assert(ci.includes('npm run lint'), 'ci lint')
assert(ci.includes('npm run typecheck'), 'ci typecheck')
assert(ci.includes('npm test'), 'ci unit tests')
assert(/name:\s*ci\b/.test(ci) || /name: CI/.test(ci), 'ci workflow name')
assert(ci.includes('Unit tests'), 'ci tests step')
console.log('CI workflow: ok')

// --- unit tests exist ---
assert(existsSync(join(web, 'src/game/judging.test.ts')), 'judging.test.ts')
assert(existsSync(join(web, 'src/game/obstacles.test.ts')), 'obstacles.test.ts')
assert(
  existsSync(join(web, 'src/lib/observability.test.ts')),
  'observability.test.ts',
)
console.log('unit test files: ok')

// --- run vitest ---
const test = spawnSync('npm', ['test'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env },
})
if (test.status !== 0) {
  console.error(test.stdout)
  console.error(test.stderr)
  throw new Error('npm test failed')
}
console.log('npm test: ok')

console.log('')
console.log('G18 verify PASS (wiring + unit tests).')
console.log('')
console.log('CLOUD PROVE (after keys in gitignored apps/web/.env):')
console.log('  node apps/web/scripts/prove-g18-cloud.mjs')
console.log('  VITE_POSTHOG_KEY must be phc_ (project). Keep phx_ as POSTHOG_PERSONAL_API_KEY only.')
console.log('HUMAN / ops:')
console.log('1) Optional Edge: supabase secrets set SENTRY_DSN=… --project-ref zxtwshhlicditrvqafzo')
console.log('2) GitHub → branch protection on master → require status check named "ci"')
