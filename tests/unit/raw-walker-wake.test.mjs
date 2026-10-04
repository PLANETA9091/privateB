// (v0.356.0) THE RAW WALKER WAKE - the nudge family gets the raw walk back.
//
// MEASURED (fleet 36726048100, face 11, the calm): F14's fuel-commons nudge
// ended 'path nudge approach: 2 segment(s) walked in 4.0s, goal now d=26.3
// (still outside - a segment stalled (no position delta))' with NO side-step
// line - while the same face shows 7 'stall side-step' lines at the sites
// that inject the raw walker (the yard approach, the deposit chain, the
// smelting walk nudge). The anatomy: the v0.147.0 nudge family (the fuel
// anchor, the fuel commons, the re-segment, the iron commune, the pool seed)
// was bolted on WITHOUT `rawWalk: walkRawToward`, so inside approachWalk the
// side-step gate `typeof rawWalk === 'function'` never opened - the v0.167.0
// stall side-step ladder (right, then left, then the honest end) was DEAD
// CODE in exactly the quarried/wet geometry where the nudge is needed most,
// and every segment was pathfinder-only (no 0-A* straight line on open
// ground). THE CURE: one injected option per site - the same walker the
// deposit chain has run since v0.56.0; the phantom-raw cure (v0.62.0) and
// the anti-spin rule stay the only truth, and the nudge never kills the
// chain (the catch is untouched).
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { approachWalk } from '../../src/lib/approach.mjs'
import { walkRawToward } from '../../src/lib/deposit.mjs'

const fuelSrc = readFileSync(new URL('../../src/lib/fuelbank.mjs', import.meta.url), 'utf8')
const toolSrc = readFileSync(new URL('../../src/lib/toolupgrade.mjs', import.meta.url), 'utf8')
const depositSrc = readFileSync(new URL('../../src/lib/deposit.mjs', import.meta.url), 'utf8')

test('the wiring pins: all five wake sites inject the raw walker', () => {
  assert.match(fuelSrc, /import \{ findChest, chestSlotCount, chestWalkBudgetMs, CHEST_DOOM_TTL_MS, YARD_CHEST_RADIUS, CHEST_NAMES, chestNearYard, fuelTitheOverage, FUEL_TITHE_BOUND, walkRawToward \} from '\.\/deposit\.mjs'/)
  assert.match(toolSrc, /import \{ findChest, chestSlotCount, chestWalkBudgetMs, CHEST_DOOM_TTL_MS, YARD_CHEST_RADIUS, depositStackDirect, walkRawToward \} from '\.\/deposit\.mjs'/)
  assert.match(fuelSrc, /approachWalk\(bot, \{ x: anchor\.x, y: anchor\.y, z: anchor\.z \}, \{ budgetMs: nudgeMs, closeShot: true, rawWalk: walkRawToward, log: m => log\(`fuel anchor: path nudge \$\{m\}`\) \}\)/)
  assert.match(fuelSrc, /approachWalk\(bot, chest\.position, \{ budgetMs: nudgeMs, closeShot: true, rawWalk: walkRawToward, log: m => log\(`fuel commons: path nudge \$\{m\}`\) \}\)/)
  assert.match(fuelSrc, /approachWalk\(bot, chest\.position, \{ budgetMs: Math\.min\(remainingMs\(\), 15000\), closeShot: true, rawWalk: walkRawToward, log: m => log\(`fuel commons: envelope re-segment nudge \$\{m\}`\) \}\)/)
  assert.match(toolSrc, /approachWalk\(bot, chest\.position, \{ budgetMs: nudgeMs, closeShot: true, rawWalk: walkRawToward, log: m => log\(`iron commune: path nudge \$\{m\}`\) \}\)/)
  assert.match(toolSrc, /approachWalk\(bot, chest\.position, \{ budgetMs: nudgeMs, closeShot: true, rawWalk: walkRawToward, log: m => log\(`pool seed: path nudge \$\{m\}`\) \}\)/)
})

test('the ledger: the raw-walk sites stay byte-identical (9 rawWalk sites total - the v0.645.0 arrival re-approach joins the wake)', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const smeltSrc = readFileSync(new URL('../../src/lib/smelting.mjs', import.meta.url), 'utf8')
  assert.match(depositSrc, /rawWalk: walkRawToward/) // the v0.56.0 chain - the original
  assert.match(fleetSrc, /rawWalk: walkRawToward/) // the yard approach
  assert.match(smeltSrc, /rawWalk: walkRawToward/) // the smelting walk nudge
  const total = (fuelSrc.match(/rawWalk: walkRawToward/g) || []).length + (toolSrc.match(/rawWalk: walkRawToward/g) || []).length
  assert.equal(total, 6) // the five wake sites + the v0.645.0 arrival re-approach (the same closeShot+rawWalk shape, one new rider)
})

test('the walker exists where the family imports it from (the deposit export, the injected signature)', () => {
  assert.match(depositSrc, /export async function walkRawToward \(bot, targetPos, \{/)
})

test('behavioral: an injected walker is actually consulted (the option flows through approachWalk)', async () => {
  let rawCalls = 0
  const pos = { x: 0, y: 64, z: 0 }
  const bot = {
    entity: { position: { get x () { return pos.x }, get y () { return pos.y }, get z () { return pos.z } } },
    setControlState: () => {},
    clearControlStates: () => {},
    look: async () => {}
  }
  const target = { x: 30, y: 64, z: 0 } // 30 blocks out: outside the 24 envelope, one 20-block segment leaves d=10 (inside)
  const r = await approachWalk(bot, target, {
    budgetMs: 5000,
    rawWalk: async (b, seg, { timeoutMs }) => { // the stub walks straight toward seg - the walkRawToward shape
      rawCalls++
      assert.ok(timeoutMs > 0)
      pos.x += seg.x - pos.x // arrive at the segment point
      return { walked: true }
    }
  })
  assert.equal(rawCalls, 1) // the segment went raw-first - the wake is real
  assert.equal(r.walked, true) // d=10 entered the envelope
  assert.equal(r.segments, 1)
})
