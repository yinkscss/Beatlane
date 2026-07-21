#!/usr/bin/env node
/**
 * G19 offline verify — build sizes, MiniPay stub presence, spend caps, vercel.json.
 * Does not print secrets. Production URL check is optional via BEATLANE_PROD_URL.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = join(__dirname, '..')
const repoRoot = join(webRoot, '../..')

const JS_GZIP_BUDGET_KB = 550
let failed = 0

function ok(msg) {
  console.log(`PASS  ${msg}`)
}
function fail(msg) {
  console.error(`FAIL  ${msg}`)
  failed += 1
}

// 1. vercel.json
const vercelPath = join(repoRoot, 'vercel.json')
if (!existsSync(vercelPath)) {
  fail('vercel.json missing at repo root')
} else {
  const v = JSON.parse(readFileSync(vercelPath, 'utf8'))
  if (v.outputDirectory === 'apps/web/dist' && v.buildCommand?.includes('web')) {
    ok('vercel.json points at apps/web build')
  } else {
    fail('vercel.json build/output not wired to apps/web')
  }
  if (Array.isArray(v.rewrites) && v.rewrites.length > 0) {
    ok('SPA rewrites present')
  } else {
    fail('SPA rewrites missing')
  }
}

// 2. Checklist docs
for (const rel of [
  'docs/mainnet-cutover-checklist.md',
  'docs/g19-perf-budget.md',
]) {
  if (existsSync(join(repoRoot, rel))) ok(`${rel} present`)
  else fail(`${rel} missing`)
}

// 3. Source markers
const markers = [
  ['src/components/MiniPayCta.tsx', 'Play with MiniPay'],
  ['src/lib/spendCaps.ts', 'DAILY_CONTINUE_CAP_CUSD'],
  ['src/lib/mutePref.ts', 'beatlane:muted'],
  ['src/pages/Home.tsx', 'MiniPayCta'],
  ['src/pages/Wallet.tsx', 'MiniPayCta'],
]
for (const [rel, needle] of markers) {
  const p = join(webRoot, rel)
  const src = existsSync(p) ? readFileSync(p, 'utf8') : ''
  if (src.includes(needle)) ok(`${rel} contains ${needle}`)
  else fail(`${rel} missing ${needle}`)
}

// 4. Unit tests (spend caps)
try {
  execSync('npm run test -w web -- --run src/lib/spendCaps.test.ts', {
    cwd: repoRoot,
    stdio: 'pipe',
  })
  ok('spendCaps vitest')
} catch (err) {
  fail(`spendCaps vitest: ${err.message}`)
}

// 5. Production build + size budget
try {
  execSync('npm run build -w web', { cwd: repoRoot, stdio: 'pipe' })
  ok('production build')
} catch (err) {
  fail(`production build: ${err.stderr?.toString?.() || err.message}`)
}

const assetsDir = join(webRoot, 'dist/assets')
if (existsSync(assetsDir)) {
  const { gzipSync } = await import('node:zlib')
  let totalGzip = 0
  for (const name of readdirSync(assetsDir)) {
    if (!name.endsWith('.js')) continue
    const buf = readFileSync(join(assetsDir, name))
    totalGzip += gzipSync(buf).length
  }
  const kb = totalGzip / 1024
  if (kb <= JS_GZIP_BUDGET_KB) {
    ok(`JS gzip ${kb.toFixed(1)} KB ≤ ${JS_GZIP_BUDGET_KB} KB budget`)
  } else {
    fail(`JS gzip ${kb.toFixed(1)} KB > ${JS_GZIP_BUDGET_KB} KB budget`)
  }
  const indexHtml = join(webRoot, 'dist/index.html')
  if (existsSync(indexHtml) && statSync(indexHtml).size > 0) {
    ok('dist/index.html present')
  } else {
    fail('dist/index.html missing')
  }
} else {
  fail('dist/assets missing after build')
}

// 6. Optional live URL
const prodUrl = process.env.BEATLANE_PROD_URL?.trim()
if (prodUrl) {
  try {
    const res = await fetch(prodUrl, { redirect: 'follow' })
    if (res.ok) ok(`prod URL reachable ${prodUrl} (${res.status})`)
    else fail(`prod URL ${prodUrl} → ${res.status}`)
  } catch (err) {
    fail(`prod URL fetch: ${err.message}`)
  }
} else {
  console.log('SKIP  BEATLANE_PROD_URL unset — set after Vercel deploy')
}

console.log(failed === 0 ? '\nG19 verify: PASS' : `\nG19 verify: FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
