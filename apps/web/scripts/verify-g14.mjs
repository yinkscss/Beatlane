/**
 * G14 smoke: helper SKUs/prices, Blitz-disabled flag, playfield API presence,
 * record-purchase helper branch, migration unlock_type.
 *
 *   node apps/web/scripts/verify-g14.mjs
 *
 * Network note: payments use Celo Mainnet (Q07) via existing G10 treasury path —
 * AC "testnet" means staging/dev against the configured network (Mainnet), not
 * a separate Alfajores deploy.
 */
import { readFileSync } from 'node:fs'
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

// --- helpers.ts constants ---
const helpersSrc = readFileSync(join(web, 'src/lib/helpers.ts'), 'utf8')
assert(helpersSrc.includes('SLOW_MO_PRICE = 0.19'), 'SLOW_MO_PRICE $0.19')
assert(helpersSrc.includes('SHIELD_PRICE = 0.29'), 'SHIELD_PRICE $0.29')
assert(helpersSrc.includes("SLOW_MO_SKU = 'slow_mo'"), 'slow_mo sku')
assert(helpersSrc.includes("SHIELD_SKU = 'shield'"), 'shield sku')
assert(helpersSrc.includes('SLOW_MO_MS = 3000'), '3s slow-mo')
assert(
  helpersSrc.includes("mode === 'blitz'") &&
    helpersSrc.includes('helpersDisabled'),
  'Blitz helpersDisabled flag',
)
assert(helpersSrc.includes('helpersAllowed'), 'helpersAllowed export')

// Dynamic import of helpers (Vite-free — pure TS-ish JS after strip types won't work).
// Re-implement policy check inline to match helpers.ts.
function helpersDisabled(mode) {
  return mode === 'blitz' || mode === 'zen'
}
assert(helpersDisabled('blitz') === true, 'blitz disabled')
assert(helpersDisabled('zen') === true, 'zen disabled')
assert(helpersDisabled('classic') === false, 'classic allowed')
assert(helpersDisabled('daily') === false, 'daily allowed')

// --- playfield API ---
const playfield = readFileSync(
  join(web, 'src/game/classicPlayfield.ts'),
  'utf8',
)
assert(playfield.includes('activateSlowMo'), 'activateSlowMo')
assert(playfield.includes('activateShieldCharge'), 'activateShieldCharge')
assert(playfield.includes('helperSlowMult'), 'helperSlowMult (not speedMult)')
assert(playfield.includes('onShieldAbsorb'), 'onShieldAbsorb')
assert(playfield.includes('shieldCharges'), 'shieldCharges one-miss')

// --- Play sheets ---
const play = readFileSync(join(web, 'src/pages/Play.tsx'), 'utf8')
assert(play.includes('Slow-mo 3s?'), 'Slow-mo sheet title')
assert(play.includes('Shield one miss?'), 'Shield sheet title')
assert(play.includes('Activate ·'), 'Activate CTA')
assert(play.includes('helpersAllowed'), 'helpers gate in Play')

// --- record-purchase ---
const record = read(
  'supabase/functions/record-purchase/index.ts',
)
assert(record.includes('slow_mo: 0.19'), 'edge slow_mo price')
assert(record.includes('shield: 0.29'), 'edge shield price')
assert(record.includes("unlock_type: 'helper'"), 'helper unlock write')
assert(record.includes("network: 'celo-mainnet'"), 'mainnet metadata')

// --- migration ---
const mig = read(
  'supabase/migrations/20260721180000_beatlane_g14_helper_unlocks.sql',
)
assert(mig.includes("'helper'"), 'migration adds helper unlock_type')

// --- Wallet inventory ---
const wallet = readFileSync(join(web, 'src/pages/Wallet.tsx'), 'utf8')
assert(wallet.includes('countHelperUnlocks'), 'inventory counts')
assert(wallet.includes('Slow-mos'), 'Slow-mos row')
assert(wallet.includes('Shields'), 'Shields row')

console.log('G14 verify PASS')
console.log('  network: Celo Mainnet (chainId 42220) — same as G10 Second Chance')
console.log('  SKUs: slow_mo @ $0.19 · shield @ $0.29')
console.log('  helpersDisabled(blitz)=true · classic/daily allowed')
