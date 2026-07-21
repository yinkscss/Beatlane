#!/usr/bin/env node
/**
 * G19 Vercel Hobby deploy helper.
 * - Never prints secret values
 * - Syncs VITE_* from apps/web/.env → Vercel production (if logged in)
 * - Deploys production from repo root (vercel.json → apps/web)
 *
 * Human prerequisite: `npx vercel login` then re-run this script.
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = join(__dirname, '..')
const repoRoot = join(webRoot, '../..')
const envPath = join(webRoot, '.env')

/** Required for a playable shell + Supabase blockblast. */
const REQUIRED = [
  'VITE_MAGIC_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]

/** Strongly recommended — payments fail soft until set. */
const RECOMMENDED = ['VITE_TREASURY_ADDRESS']

const OPTIONAL = [
  'VITE_CELO_RPC_URL',
  'VITE_CELO_CHAIN_ID',
  'VITE_CUSD_TOKEN_ADDRESS',
  'VITE_SENTRY_DSN',
  'VITE_POSTHOG_KEY',
  'VITE_POSTHOG_HOST',
  'VITE_BOAST_CONTRACT_ADDRESS',
  'VITE_BOAST_CHAIN_ID',
  'VITE_BOAST_RPC_URL',
  'VITE_BOAST_CUSD_ADDRESS',
  'VITE_BOAST_TREASURY_ADDRESS',
  'VITE_TOURNAMENT_CONTRACT_ADDRESS',
  'VITE_TOURNAMENT_CHAIN_ID',
  'VITE_TOURNAMENT_RPC_URL',
]

function parseEnv(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function mask(key) {
  return `${key}=<set>`
}

function vercel(args, opts = {}) {
  return execFileSync('npx', ['vercel', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
}

console.log('G19 deploy — secrets are never printed')

try {
  const who = vercel(['whoami']).trim()
  console.log(`Logged in as: ${who}`)
} catch {
  console.error(`
BLOCKED: Vercel CLI not authenticated.
Run interactively, then re-run this script:

  cd ${repoRoot}
  npx vercel login
  node apps/web/scripts/deploy-g19-vercel.mjs

Or set VERCEL_TOKEN in the environment (never commit it).
`)
  process.exit(2)
}

if (!existsSync(envPath)) {
  console.error('Missing apps/web/.env — copy from .env.example and fill values.')
  process.exit(1)
}

const env = parseEnv(readFileSync(envPath, 'utf8'))
const missing = REQUIRED.filter((k) => !env[k])
if (missing.length) {
  console.error(`Missing required keys in apps/web/.env: ${missing.join(', ')}`)
  process.exit(1)
}
const missingRec = RECOMMENDED.filter((k) => !env[k])
if (missingRec.length) {
  console.warn(
    `WARN: ${missingRec.join(', ')} empty — continue/helper/pack payments disabled until set in Vercel + local .env`,
  )
}

console.log('Env keys present:')
for (const k of [...REQUIRED, ...RECOMMENDED, ...OPTIONAL]) {
  if (env[k]) console.log(`  ${mask(k)}`)
  else if (RECOMMENDED.includes(k) || REQUIRED.includes(k))
    console.log(`  ${k}=<missing>`)
}

// Link project if needed
if (!existsSync(join(repoRoot, '.vercel/project.json'))) {
  console.log('Linking Vercel project (non-interactive)…')
  try {
    vercel(['link', '--yes', '--project', 'beatlane'], { stdio: 'inherit' })
  } catch {
    console.error(
      'vercel link failed — run `npx vercel link` interactively at repo root.',
    )
    process.exit(1)
  }
}

function pushEnv(key, value) {
  // Remove then add to avoid interactive prompt on duplicate
  try {
    execSync(`npx vercel env rm ${key} production -y`, {
      cwd: repoRoot,
      stdio: 'ignore',
    })
  } catch {
    /* not present */
  }
  execFileSync('npx', ['vercel', 'env', 'add', key, 'production'], {
    cwd: repoRoot,
    input: `${value}\n`,
    stdio: ['pipe', 'ignore', 'pipe'],
    env: process.env,
  })
  console.log(`  synced ${key}`)
}

console.log('Syncing production env (values hidden)…')
for (const k of [...REQUIRED, ...RECOMMENDED, ...OPTIONAL]) {
  if (env[k]) pushEnv(k, env[k])
}

console.log('Deploying production…')
const out = vercel(['deploy', '--prod', '--yes'], { stdio: 'pipe' })
const urlMatch = out.match(/https:\/\/[^\s]+\.vercel\.app[^\s]*/g)
const url = urlMatch?.[urlMatch.length - 1] ?? out.trim().split('\n').pop()
console.log(`Production URL: ${url}`)
console.log('Done. Smoke: open URL → Home MiniPay CTA → Wallet sign-in.')
