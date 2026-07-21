/**
 * G11 smoke (no bundler): parse sample-hard.json structure + coverage.
 * node apps/web/scripts/verify-g11.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const hardPath = join(here, '../public/charts/sample-hard.json')
const chart = JSON.parse(readFileSync(hardPath, 'utf8'))

const HARD_NOTE = new Set([
  'long_hold',
  'bridge',
  'triple',
  'l_hook',
  'fake_gap',
  'slide',
])
const HARD_EVENT = new Set([
  'long_hold',
  'bridge',
  'triple',
  'l_hook',
  'zig',
  'split',
  'fake_gap',
  'slide',
  'cascade',
  'trap_double',
])
const MODS = ['ice', 'gold', 'fog', 'reverse']
const BANNED = new Set(['reverse', 'fog', 'fake_gap'])

const NOTE_LABEL = {
  long_hold: 'LONG HOLD',
  bridge: 'BRIDGE',
  triple: 'TRIPLE',
  l_hook: 'L-HOOK',
  fake_gap: 'FAKE GAP',
  slide: 'SLIDE',
}
const EVENT_LABEL = {
  ...NOTE_LABEL,
  zig: 'ZIG',
  split: 'SPLIT',
  cascade: 'CASCADE',
  trap_double: 'TRAP DOUBLE',
}

if (chart.schemaVersion !== 1) throw new Error('schemaVersion')
if (chart.difficulty !== 'hard') throw new Error('difficulty')
if (!Array.isArray(chart.notes) || !Array.isArray(chart.events)) {
  throw new Error('notes/events')
}

const noteTypes = new Set(chart.notes.map((n) => n.type))
const eventTypes = new Set(chart.events.map((e) => e.type))
const labels = new Set()
for (const t of noteTypes) if (NOTE_LABEL[t]) labels.add(NOTE_LABEL[t])
for (const t of eventTypes) if (EVENT_LABEL[t]) labels.add(EVENT_LABEL[t])

const missingNotes = [...HARD_NOTE].filter((t) => !noteTypes.has(t))
const missingEvents = [...HARD_EVENT].filter((t) => !eventTypes.has(t))
const missingMods = MODS.filter((m) => !eventTypes.has(m))
const hasBanned =
  chart.notes.some((n) => BANNED.has(n.type)) ||
  chart.events.some((e) => BANNED.has(e.type))

console.log('G11 verify — sample-hard')
console.log('  hard labels:', [...labels].sort().join(', '))
console.log('  missing note types:', missingNotes.join(', ') || '(none)')
console.log('  missing pattern events:', missingEvents.join(', ') || '(none)')
console.log('  missing modifiers:', missingMods.join(', ') || '(none)')
console.log('  blitz-banned content present (flag OK):', hasBanned)

if (missingNotes.length || missingEvents.length || missingMods.length) {
  console.error('FAIL')
  process.exit(1)
}
if (labels.size < 1) {
  console.error('FAIL: no hard subset')
  process.exit(1)
}
console.log('PASS')
