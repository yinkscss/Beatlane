/**
 * G15 smoke: Foundry Boast project, $0.29 mint price, share card UI,
 * record-purchase boast branch, boasts migration, env examples.
 *
 *   node apps/web/scripts/verify-g15.mjs
 *
 * Network: Boast → Celo Sepolia (testnet; Alfajores sunset). Continues → Mainnet (Q07).
 * Deploy requires DEPLOYER_PRIVATE_KEY in contracts/.env (never commit).
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

// --- Foundry project ---
assert(existsSync(join(contracts, 'foundry.toml')), 'foundry.toml')
assert(
  existsSync(join(contracts, 'src/BoastAttestation.sol')),
  'BoastAttestation.sol',
)
assert(existsSync(join(contracts, 'script/DeployBoast.s.sol')), 'DeployBoast.s.sol')
assert(
  existsSync(join(contracts, 'script/DeployBoastSmoke.s.sol')),
  'DeployBoastSmoke.s.sol',
)
assert(existsSync(join(contracts, 'test/BoastAttestation.t.sol')), 'BoastAttestation.t.sol')
assert(existsSync(join(contracts, '.env.example')), 'contracts/.env.example')
assert(existsSync(join(contracts, '.gitignore')), 'contracts/.gitignore')

const sol = read('contracts/src/BoastAttestation.sol')
assert(sol.includes('MINT_PRICE = 29e16'), 'MINT_PRICE 0.29 cUSD')
assert(sol.includes('function mintBoast'), 'mintBoast')
assert(sol.includes('event BoastMinted'), 'BoastMinted event')

const gitignore = read('contracts/.gitignore')
assert(gitignore.includes('.env'), 'contracts gitignore .env')
assert(
  !existsSync(join(contracts, '.env')) ||
    readFileSync(join(contracts, '.gitignore'), 'utf8').includes('.env'),
  'never commit contracts/.env',
)

// Optional forge test if forge is on PATH
const forge = spawnSync('forge', ['test', '-vv'], {
  cwd: contracts,
  encoding: 'utf8',
})
if (forge.error) {
  console.log('skip forge test (forge not on PATH):', forge.error.message)
} else if (forge.status !== 0) {
  console.error(forge.stdout)
  console.error(forge.stderr)
  throw new Error('forge test failed')
} else {
  assert(
    (forge.stdout || '').includes('3 passed') ||
      (forge.stdout || '').includes('passed'),
    'forge tests passed',
  )
  console.log('forge test: ok')
}

// --- web lib + UI ---
const boastLib = readFileSync(join(web, 'src/lib/boast.ts'), 'utf8')
assert(boastLib.includes('BOAST_PRICE_CUSD = 0.29'), 'BOAST_PRICE $0.29')
assert(boastLib.includes("BOAST_SKU = 'boast'"), 'boast sku')
assert(boastLib.includes('mintBoastAttestation'), 'mintBoastAttestation')
assert(boastLib.includes('celoSepolia'), 'Celo Sepolia chain')

const results = readFileSync(join(web, 'src/pages/Results.tsx'), 'utf8')
assert(results.includes('Boast this streak'), 'mint sheet title')
assert(results.includes('Boast streak'), 'results CTA')
assert(results.includes('Mint Boast'), 'mint CTA')
assert(results.includes('/b/'), 'share path')

const boastPage = readFileSync(join(web, 'src/pages/Boast.tsx'), 'utf8')
assert(boastPage.includes('share_slug'), 'Boast page loads slug')
assert(boastPage.includes('I TAPPED'), 'share card eyebrow')

const app = readFileSync(join(web, 'src/App.tsx'), 'utf8')
assert(app.includes('/b/:slug'), 'Boast route')

// --- edge + migration ---
const record = read('supabase/functions/record-purchase/index.ts')
assert(record.includes("sku === 'boast'"), 'record-purchase boast sku')
assert(record.includes('BOAST_PRICE = 0.29'), 'edge boast price')
assert(record.includes("from('boasts')"), 'inserts boasts row')
assert(record.includes("'celo-sepolia'"), 'sepolia metadata')

const mig = read(
  'supabase/migrations/20260721190000_beatlane_g15_boasts.sql',
)
assert(mig.includes('create table if not exists public.boasts'), 'boasts table')
assert(mig.includes('share_slug'), 'share_slug column')
assert(mig.includes('tx_hash'), 'tx_hash / receipt storage')

const envEx = readFileSync(join(web, '.env.example'), 'utf8')
assert(envEx.includes('VITE_BOAST_CONTRACT_ADDRESS'), 'web env boast address')
assert(envEx.includes('11142220'), 'Sepolia chain id in env example')

const rootEnv = read('.env.example')
assert(rootEnv.includes('VITE_BOAST_CONTRACT_ADDRESS'), 'root env boast')

const readme = read('README.md')
assert(readme.includes('G15 Boast'), 'README G15 section')
assert(readme.includes('Celo Sepolia'), 'README Celo Sepolia')

const broadcastDir = join(contracts, 'broadcast/DeployBoastSmoke.s.sol/11142220')
const hasBroadcast =
  existsSync(broadcastDir) ||
  existsSync(join(contracts, 'broadcast/DeployBoast.s.sol/11142220'))
if (hasBroadcast) {
  console.log('broadcast artifact: present (AC2)')
} else {
  console.log(
    'broadcast artifact: pending — run DeployBoastSmoke on Celo Sepolia',
  )
}

console.log('verify-g15: PASS')
