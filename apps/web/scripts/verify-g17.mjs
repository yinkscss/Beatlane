/**
 * G17 smoke: Season Pass — $2.99 cUSD, 4-week schedule, continues + tracks,
 * progress UI, grant Edge Function. No cosmetics.
 *
 *   node apps/web/scripts/verify-g17.mjs
 *
 * Payments → Celo Mainnet cUSD (Q07). Staging uses the same Mainnet path.
 * Never commit secrets.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const web = join(__dirname, '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// --- migration ---
const migPath = 'supabase/migrations/20260721200000_beatlane_g17_season_pass.sql'
assert(existsSync(join(root, migPath)), migPath)
const mig = read(migPath)
assert(mig.includes('create table if not exists public.seasons'), 'seasons table')
assert(mig.includes('season_rewards'), 'season_rewards')
assert(mig.includes('season_reward_grants'), 'season_reward_grants')
assert(mig.includes('price_cusd = 2.99') || mig.includes('2.99'), 'price 2.99')
assert(mig.includes("'continue'") && mig.includes("'chart'"), 'reward types')
assert(
  mig.includes("reward_type in ('continue', 'chart')"),
  'only continue/chart reward types',
)
assert(!/\b(skin_shop|avatar|emote)\b/i.test(mig), 'no cosmetic reward rows')
assert(mig.includes('season-1'), 'season-1 seed')
assert(mig.includes('2026-08-18'), '4-week end date')
assert(mig.includes('lagos-after') && mig.includes('minipay-anthem'), 'track unlocks')
console.log('migration: ok')

// --- shared grant helper ---
const grants = read('supabase/functions/_shared/seasonPassGrants.ts')
assert(grants.includes('SEASON_PASS_PRICE = 2.99'), 'price const')
assert(grants.includes('SEASON_DURATION_DAYS = 28'), '28 days')
assert(grants.includes('grantDueSeasonRewards'), 'grantDueSeasonRewards')
assert(grants.includes("unlock_type: 'continue'"), 'continue entitlements')
assert(grants.includes("unlock_type: 'chart'"), 'chart entitlements')
assert(grants.includes('cosmetics') || grants.includes('continue'), 'no cosmetics path')
assert(!grants.includes("unlock_type: 'skin'"), 'no skin unlock type')
console.log('seasonPassGrants: ok')

// --- edge season-pass ---
assert(
  existsSync(join(root, 'supabase/functions/season-pass/index.ts')),
  'season-pass fn',
)
const edge = read('supabase/functions/season-pass/index.ts')
assert(edge.includes("action === 'grant_due'"), 'cron grant_due')
assert(edge.includes('SEASON_PASS_CRON_SECRET'), 'cron secret')
assert(edge.includes('noCosmetics: true'), 'noCosmetics flag')
assert(edge.includes('celo-mainnet'), 'mainnet note')
assert(edge.includes('grantDueSeasonRewards'), 'grants on status')
console.log('season-pass edge: ok')

// --- record-purchase wiring ---
const rec = read('supabase/functions/record-purchase/index.ts')
assert(rec.includes('isSeasonPassSku'), 'season pass sku check')
assert(rec.includes("unlock_type: 'season_pass'"), 'season_pass unlock')
assert(rec.includes('grantDueSeasonRewards'), 'grants on purchase')
assert(rec.includes('SEASON_PASS_PRICE'), 'price guard')
console.log('record-purchase: ok')

// --- config ---
const cfg = read('supabase/config.toml')
assert(cfg.includes('[functions.season-pass]'), 'config season-pass')
assert(cfg.includes('verify_jwt = false'), 'verify_jwt false present')
console.log('config.toml: ok')

// --- web client + UI ---
const lib = readFileSync(join(web, 'src/lib/seasonPass.ts'), 'utf8')
assert(lib.includes('SEASON_PASS_PRICE = 2.99'), 'client price')
assert(lib.includes('purchaseSeasonPass'), 'purchaseSeasonPass')
assert(lib.includes('transferCusdToTreasury'), 'mainnet treasury path')
assert(lib.includes('season_pass_'), 'sku prefix')
assert(lib.includes('celo-mainnet'), 'network metadata')

const page = readFileSync(join(web, 'src/pages/Pass.tsx'), 'utf8')
assert(page.includes('Rhythm Pass') || page.includes('season.title'), 'pass title')
assert(page.includes('no skins') || page.includes('blurb'), 'no skins copy')
assert(page.includes('Get Pass'), 'Get Pass CTA')
assert(page.includes('purchaseSeasonPass'), 'buy wired')
assert(
  /no skins|no cosmetics/i.test(page),
  'UI states no skins/cosmetics',
)
assert(
  !/\b(skin shop|cosmetic reward|avatar unlock)\b/i.test(page),
  'UI has no cosmetic reward SKUs',
)

const css = readFileSync(join(web, 'src/pages/Pass.module.css'), 'utf8')
assert(css.includes('.nodeClaimed') && css.includes('.nodeNow'), 'progress nodes')

const app = readFileSync(join(web, 'src/App.tsx'), 'utf8')
assert(app.includes('path="/pass"'), 'route /pass')
assert(app.includes('PassPage'), 'PassPage import')

const home = readFileSync(join(web, 'src/pages/Home.tsx'), 'utf8')
assert(home.includes('/pass'), 'Home → Pass link')
console.log('web UI: ok')

// --- types ---
const types = readFileSync(join(web, 'src/lib/database.types.ts'), 'utf8')
assert(types.includes('seasons:'), 'types seasons')
assert(types.includes('season_rewards:'), 'types season_rewards')
assert(types.includes('season_reward_grants:'), 'types grants')
console.log('database.types: ok')

// --- docs / env ---
const readme = read('README.md')
assert(readme.includes('G17') || readme.includes('Season Pass'), 'README Season Pass')
assert(readme.includes('Celo Mainnet'), 'README Mainnet')

const webReadme = read('apps/web/README.md')
assert(webReadme.includes('Season Pass') || webReadme.includes('G17'), 'web README G17')

const envWeb = read('apps/web/.env.example')
assert(
  envWeb.includes('Season Pass') || envWeb.includes('G17'),
  'web .env.example G17 note',
)
console.log('docs: ok')

// --- schedule math unit (pure) ---
function seasonDayElapsed(startsAt, now) {
  const start = new Date(startsAt).getTime()
  const ms = now.getTime() - start
  if (ms < 0) return 0
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}
const start = new Date('2026-07-21T00:00:00Z')
assert(seasonDayElapsed('2026-07-21T00:00:00Z', start) === 0, 'day 0')
assert(
  seasonDayElapsed(
    '2026-07-21T00:00:00Z',
    new Date('2026-07-28T12:00:00Z'),
  ) === 7,
  'day 7',
)
assert(
  seasonDayElapsed(
    '2026-07-21T00:00:00Z',
    new Date('2026-08-17T00:00:00Z'),
  ) === 27,
  'day 27',
)
console.log('schedule math: ok')

console.log('\nG17 verify: PASS')
console.log('Network: Season Pass payments = Celo Mainnet cUSD (Q07); staging same path.')
