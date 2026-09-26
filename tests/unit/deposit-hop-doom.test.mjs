// v0.188.0 THE HOP VERTICAL DOOM GATE - the deposit hop loop's per-chest
// consult of the strict verticalDoomPlan arithmetic.
//
// MEASURED (run47 = fleet 36181152847, the triple-union fleet, F19's bank
// chain): seven hops from y~44 to the y=72 yard rows (dy ~28 over ~24b
// lateral) - 2x 'Took to long to decide path to goal!' + 5x 'budget
// exhausted (walk floor)' - burned the chain before the smelt leg, the smelt
// visit died 'machine unreachable (visit budget spent (walk slice))' and the
// final deposit 'budget exhausted': the whole chain delivered zero with
// raw_copper riding the pocket. The bank climbs (v0.158.0), the yard chest
// walks (v0.159.0) and the machine walks (v0.170.0) already ride this
// arithmetic; the hop loop was the last un-gated walk site.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chestVerticalDoom, verticalDoomPlan, VERTICAL_DOOM_MIN_DY } from '../../src/lib/surface.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const depositSrc = readFileSync(join(here, '../../src/lib/deposit.mjs'), 'utf8')
const fleetSrc = readFileSync(join(here, '../../testbed/fleet19.mjs'), 'utf8')

test('v0.188.0 wiring: the hop loop consults chestVerticalDoom BEFORE the deposit walk, the skip joins the tried-set', () => {
  const walkIdx = depositSrc.indexOf('const res = await depositToChest(bot, { chestBlock: chest, keep, log, budgetMs: remaining(), noPathLedger, fullChestLedger })')
  assert.ok(walkIdx > -1, 'the hop loop walk anchor exists')
  const gateIdx = depositSrc.indexOf('const doom = chestVerticalDoom({ botPos: bot?.entity?.position ?? null, chestPos: chest.position })')
  assert.ok(gateIdx > -1, 'the doom consult exists in deposit.mjs')
  assert.ok(gateIdx < walkIdx, 'the gate rides before the walk - a doomed chest never pays a goto')
  const gateBlock = depositSrc.slice(gateIdx, walkIdx)
  assert.match(gateBlock, /chest skip \(vertical doom: \$\{doom\.why\} - the walk ladder cannot climb\)/, 'the skip line names the class in the family shape (chest skip (...))')
  assert.match(gateBlock, /tried\.push\(/, 'the doomed chest joins the tried-set so the scan picks the next nearest')
  assert.match(gateBlock, /continue/, 'the skip continues the loop - no break, a camp chest at the bot level stays reachable')
  assert.match(depositSrc, /import \{ chestVerticalDoom \} from '\.\/surface\.mjs'/, 'the predicate rides the surface.mjs import')
})

test('v0.188.0 wiring: the fleet filter-key lets the chest skip lines surface', () => {
  // run47 measured the blind spot: ZERO 'chest skip' lines in fleet19.log -
  // the v0.62/v0.65/v0.72 ledger skips were invisible to every decode. The
  // v0.188.0 line joins the filter regex so the doom class AND the three
  // ledger families become countable. (v0.199.0) 'death drop' joins between
  // died and KICKED - the pin carries it.
  assert.match(fleetSrc, /combat\|died\|(death drop\|)?KICKED\|error\|climb\|water\|scan:\|hop\|chest skip\|/, 'chest skip rides the fleet filter-key regex')
})

test('v0.188.0 the F19 chain arithmetic: the run47 hop anatomy dooms, the hillside and the walkable band stay legacy', () => {
  // The F19 shape: a deep bot (y~44) against the y=72 yard rows - dy 28,
  // lateral under the vertical (24b). Strict doom.
  const f19 = verticalDoomPlan({ botY: 44, yardY: 72, lateral: 24 })
  assert.equal(f19.doom, true, 'dy 28 over 24b lateral is the doomed mostly-up shape')
  assert.equal(f19.dy, 28)
  assert.equal(f19.lateral, 24)
  assert.match(f19.why, /28 levels up over 24b lateral/)
  // The gate must read the FULL 3D shape through chestVerticalDoom (the hop
  // wiring's exact call): x/z lateral computed from the positions.
  const full = chestVerticalDoom({ botPos: { x: -130, y: 44, z: 400 }, chestPos: { x: -116, y: 72, z: 406 } })
  assert.equal(full.doom, true, 'dy 28, lateral hypot(14,6)~15 - mostly up, doomed')
  // A hillside (lateral >= dy) keeps the legacy ladder - A* can route a
  // staircase that exists.
  const hill = verticalDoomPlan({ botY: 52, yardY: 72, lateral: 30 })
  assert.equal(hill.doom, false)
  assert.match(hill.why, /the ladder may route it/)
  // Inside the walkable band: a chest at the bot's own level (the camp
  // chest shape) never dooms.
  const band = verticalDoomPlan({ botY: 66, yardY: 72, lateral: 4 })
  assert.equal(band.doom, false)
  assert.match(band.why, /inside the walkable band/)
  assert.ok(Number.isFinite(VERTICAL_DOOM_MIN_DY) && VERTICAL_DOOM_MIN_DY === 20, 'the band floor stays the shared constant')
})

test('v0.188.0 junk safety: unreadable positions read no-doom - the legacy hop runs byte for byte', () => {
  assert.equal(chestVerticalDoom({ botPos: null, chestPos: { x: 1, y: 90, z: 1 } }).doom, false)
  assert.equal(chestVerticalDoom({ botPos: { x: 1, y: 44, z: 1 }, chestPos: null }).doom, false)
  assert.equal(chestVerticalDoom({ botPos: { x: 1, y: NaN, z: 1 }, chestPos: { x: 1, y: 90, z: 1 } }).doom, false)
  assert.equal(chestVerticalDoom({}).doom, false)
  // The gate's own guard: a chest without a position never reaches the consult.
  const src = readFileSync(join(here, '../../src/lib/deposit.mjs'), 'utf8')
  const gateIdx = src.indexOf('const doom = chestVerticalDoom')
  assert.ok(src.slice(0, gateIdx).lastIndexOf('if (chest.position) {') > src.lastIndexOf('const dg ='), 'the gate sits inside a chest.position guard after the v0.72.0 doomed-goal block')
})
