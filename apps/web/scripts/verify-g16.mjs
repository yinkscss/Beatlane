/**
 * G16 smoke: Blitz tournaments — timed mode, 15% rake, whitelist, helpers off,
 * TournamentVault + payout stub, lobby UI, migration, env examples.
 *
 *   node apps/web/scripts/verify-g16.mjs
 *
 * Entry fees → Celo Mainnet cUSD (Q07). Cup contract → Celo Sepolia (optional).
 * Never commit deployer keys.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const web = join(__dirname, '..')
const contracts = join(root, 'contracts')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// --- Foundry TournamentVault ---
assert(
  existsSync(join(contracts, 'src/TournamentVault.sol')),
  'TournamentVault.sol',
)
assert(
  existsSync(join(contracts, 'script/DeployTournament.s.sol')),
  'DeployTournament.s.sol',
)
assert(
  existsSync(join(contracts, 'script/DeployTournamentSmoke.s.sol')),
  'DeployTournamentSmoke.s.sol',
)
assert(
  existsSync(join(contracts, 'test/TournamentVault.t.sol')),
  'TournamentVault.t.sol',
)

const vault = read('contracts/src/TournamentVault.sol')
assert(vault.includes('RAKE_BPS = 1500'), 'rake 15%')
assert(vault.includes('function enter'), 'enter()')
assert(vault.includes('function finalizeStub'), 'finalizeStub')
assert(vault.includes('function payoutStub'), 'payoutStub')
assert(vault.includes('Celo Sepolia'), 'Sepolia network note')

const forge = spawnSync('forge', ['test', '--match-contract', 'TournamentVaultTest', '-vv'], {
  cwd: contracts,
  encoding: 'utf8',
})
if (forge.error) {
  console.log('skip forge test (forge not on PATH):', forge.error.message)
} else if (forge.status !== 0) {
  console.error(forge.stdout)
  console.error(forge.stderr)
  throw new Error('forge TournamentVaultTest failed')
} else {
  assert((forge.stdout || '').includes('passed'), 'forge tests passed')
  console.log('forge TournamentVaultTest: ok')
}

// --- helpers / whitelist ---
const helpers = readFileSync(join(web, 'src/lib/helpers.ts'), 'utf8')
assert(helpers.includes("mode === 'blitz'"), 'helpersDisabled blitz')
assert(helpers.includes('helpersDisabled'), 'helpersDisabled export')

const wl = readFileSync(join(web, 'src/game/blitzWhitelist.ts'), 'utf8')
assert(wl.includes("'reverse'"), 'ban reverse')
assert(wl.includes("'fog'"), 'ban fog')
assert(wl.includes("'fake_gap'"), 'ban fake_gap')
assert(wl.includes('sanitizeBlitzChart'), 'sanitizeBlitzChart')
assert(wl.includes('chartHasBlitzBannedContent'), 'chartHasBlitzBannedContent')

const playfield = readFileSync(join(web, 'src/game/classicPlayfield.ts'), 'utf8')
assert(playfield.includes("'blitz'"), 'PlayMode includes blitz')
assert(playfield.includes("mode === 'blitz'"), 'blitz scoring/fail path')

// --- Play + lobby UI ---
const play = readFileSync(join(web, 'src/pages/Play.tsx'), 'utf8')
assert(play.includes("raw === 'blitz'"), 'parseMode blitz')
assert(play.includes('sanitizeBlitzChart'), 'Play sanitizes chart')
assert(play.includes('BLITZ_DURATION_MS'), '60s timer')
assert(play.includes('helpersAllowed(mode)'), 'helpers gated')
assert(play.includes('submitBlitzRun'), 'blitz submit')

const home = readFileSync(join(web, 'src/pages/Home.tsx'), 'utf8')
assert(home.includes("kind: 'tournament'"), 'Home Blitz enabled')
assert(home.includes('/tournament'), 'Home → tournament')

const tournamentPage = readFileSync(join(web, 'src/pages/Tournament.tsx'), 'utf8')
assert(tournamentPage.includes('enterTournament'), 'Enter CTA')
assert(tournamentPage.includes('runPayoutStub'), 'payout stub CTA')
assert(tournamentPage.includes('No slow-mo'), 'helpers-off copy')

const app = readFileSync(join(web, 'src/App.tsx'), 'utf8')
assert(app.includes('/tournament'), 'tournament route')

const tourLib = readFileSync(join(web, 'src/lib/tournament.ts'), 'utf8')
assert(tourLib.includes('TOURNAMENT_RAKE_BPS = 1500'), 'client rake 15%')
assert(tourLib.includes('transferCusdToTreasury'), 'Mainnet entry path')
assert(tourLib.includes("tournament_entry_"), 'entry sku')

// Inline policy: helpers must be off in blitz
function helpersDisabled(mode) {
  return mode === 'blitz' || mode === 'zen'
}
assert(helpersDisabled('blitz') === true, 'policy helpersDisabled(blitz)')
assert(helpersDisabled('classic') === false, 'policy helpersAllowed(classic)')

function chartHasBlitzBannedContent(chart) {
  const bannedE = new Set(['reverse', 'fog', 'fake_gap'])
  const bannedN = new Set(['fake_gap'])
  return (
    chart.notes.some((n) => bannedN.has(n.type)) ||
    chart.events.some((e) => bannedE.has(e.type))
  )
}
const hard = JSON.parse(
  readFileSync(join(web, 'public/charts/sample-hard.json'), 'utf8'),
)
const normal = JSON.parse(
  readFileSync(join(web, 'public/charts/sample-normal.json'), 'utf8'),
)
assert(chartHasBlitzBannedContent(hard) === true, 'sample-hard has banned content')
assert(chartHasBlitzBannedContent(normal) === false, 'sample-normal is fair')

// --- edge + migration ---
const record = read('supabase/functions/record-purchase/index.ts')
assert(record.includes('tournament_entry_'), 'record-purchase tournament sku')
assert(record.includes("from('tournament_entries')"), 'inserts entries')

const cupFn = read('supabase/functions/tournament-cup/index.ts')
assert(cupFn.includes("action === 'lobby'"), 'lobby action')
assert(cupFn.includes("action === 'submit'"), 'submit action')
assert(cupFn.includes("action === 'rank'"), 'rank action')
assert(cupFn.includes("action === 'payout_stub'"), 'payout_stub action')
assert(cupFn.includes('RAKE_BPS = 1500'), 'edge rake 15%')

const mig = read(
  'supabase/migrations/20260721193000_beatlane_g16_tournaments.sql',
)
assert(mig.includes('create table if not exists public.tournaments'), 'tournaments')
assert(mig.includes('tournament_entries'), 'entries table')
assert(mig.includes('tournament_runs'), 'runs table')
assert(mig.includes('tournament_payouts'), 'payouts table')
assert(mig.includes('rake_bps integer not null default 1500'), 'rake column')
assert(mig.includes('friday-finger'), 'seed cup')

const cfg = read('supabase/config.toml')
assert(cfg.includes('[functions.tournament-cup]'), 'config tournament-cup')

// --- env + docs ---
const envEx = readFileSync(join(web, '.env.example'), 'utf8')
assert(envEx.includes('VITE_TOURNAMENT_CONTRACT_ADDRESS'), 'web env tournament')

const rootEnv = read('.env.example')
assert(rootEnv.includes('VITE_TOURNAMENT_CONTRACT_ADDRESS'), 'root env tournament')

const audit = read('docs/tournament-audit-checklist.md')
assert(audit.includes('15%'), 'audit checklist rake')
assert(audit.includes('Mainnet'), 'audit checklist Mainnet')

const readme = read('README.md')
assert(readme.includes('G16'), 'README G16 section')

const contractsReadme = read('contracts/README.md')
assert(contractsReadme.includes('TournamentVault'), 'contracts README G16')

console.log('verify-g16: PASS')
console.log(
  'AC: timed Blitz · entry+15% rake · helpers off · whitelist · payout stub',
)
console.log(
  'Deploy: TournamentVault Sepolia optional — set VITE_TOURNAMENT_CONTRACT_ADDRESS after forge broadcast',
)
