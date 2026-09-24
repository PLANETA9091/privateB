// THE GRAVITY ROOF FENCE (v0.140.0) - the sand/gravel column that kills the digger.
// run554 (35974993311, the v0.139.0 fleet) buried SIX bots suffocated-in-a-wall
// in the mine zone; the cure clears the above-column top-down before every
// horizontal dig. Policy here, wiring pins against src/bots/miner.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { GRAVITY_ROOF_BLOCKS, GRAVITY_MAX_PASSES, gravityColumnOrder } from '../../src/lib/gravityroof.mjs'

test('gravityColumnOrder: a mixed column reads TOP-DOWN (the topmost gravity first)', () => {
  // reads[k-1] = the name of target+k; sand at +1, stone at +2, gravel at +3
  const order = gravityColumnOrder(['sand', 'stone', 'gravel'])
  assert.deepEqual(order, [3, 1], 'highest first: digging +3 can never drop +1 into the target; +1 follows clean')
})

test('gravityColumnOrder: the full gravity vocabulary fences (sand, red_sand, gravel)', () => {
  for (const name of ['sand', 'red_sand', 'gravel']) {
    assert.ok(GRAVITY_ROOF_BLOCKS.has(name), `${name} is a gravity roof block`)
    assert.deepEqual(gravityColumnOrder([name]), [1], `${name} at +1 fences`)
  }
})

test('gravityColumnOrder: a clean column orders nothing', () => {
  assert.deepEqual(gravityColumnOrder(['stone', 'andesite', 'diorite']), [])
  assert.deepEqual(gravityColumnOrder([]), [])
})

test('gravityColumnOrder: junk-safe - unread cells never fence a dig on a guess', () => {
  assert.deepEqual(gravityColumnOrder(null), [], 'junk argument -> empty order')
  assert.deepEqual(gravityColumnOrder([null, undefined, 42]), [], 'null/undefined/non-string reads are NON-gravity')
  assert.deepEqual(gravityColumnOrder(['sand', null, 'gravel']), [3, 1], 'the readable gravity cells still fence')
})

test('THE SETTLE MODEL: a column taller than the read window exhausts within GRAVITY_MAX_PASSES', () => {
  // An instant-settle simulation of the wiring's pass loop: the world holds a
  // 6-tall sand column above the target (cells +1..+6); the read window sees
  // only +1..+3. Each pass: read the window, dig the gravity cells top-down,
  // settle (everything unsupported falls one cell at a time - here the whole
  // overhang drops by the number of cells removed at its base). The v0.25.0
  // instant-settle model: digging the TOP gravity cell of the visible window
  // first, the cells above sink one per pass.
  const world = new Map() // offset -> name
  for (let k = 1; k <= 6; k++) world.set(k, 'sand') // 6 sands over the target
  let cleared = 0
  let passes = 0
  for (; passes < GRAVITY_MAX_PASSES; passes++) {
    const reads = [1, 2, 3].map(k => world.get(k) ?? null)
    const order = gravityColumnOrder(reads)
    if (!order.length) break
    let thisPass = 0
    for (const k of order) {
      if ((world.get(k) ?? null) !== 'sand') continue
      world.delete(k)
      cleared++
      thisPass++
    }
    // settle: every sand above a gap falls exactly one cell per pass
    for (let k = 6; k >= 1; k--) {
      if (world.has(k)) continue
      // find the nearest sand above
      let src = k + 1
      while (src <= 7 && !world.has(src)) src++
      if (src <= 7) { world.set(k, 'sand'); world.delete(src) }
    }
    if (!thisPass) break
  }
  assert.ok(passes <= GRAVITY_MAX_PASSES, `the column exhausted in ${passes} pass(es) - within the budget`)
  // the window must read clean at the end
  const finalReads = [1, 2, 3].map(k => world.get(k) ?? null)
  assert.deepEqual(gravityColumnOrder(finalReads), [], 'the visible column reads clean after the passes')
  assert.ok(cleared >= 3, `cleared ${cleared} cell(s) - the settle loop did real work`)
})

test('REGRESSION PIN: the v0.140.0 gravity fence rides the three dig lanes', () => {
  const src = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.match(src, /async function gravityClearBefore/, 'the fence helper is a named miner function')
  assert.match(src, /gravityColumnOrder\(reads\)/, 'the pass loop consults the pure policy')
  // lane 1: the tunnel face (the suffocate kill site - the bot STEPS IN)
  assert.match(src, /gravity roof: sand\/gravel still rides/, 'the refusal names the surviving cell')
  assert.match(src, /const roof = await gravityClearBefore\(feetCell\)/, 'the tunnel face fences before its step-in')
  // lane 2: the vein sweep
  assert.match(src, /vein sweep: refused a cell - \$\{roof\.why\}/, 'the vein sweep names a fenced ore cell')
  // lane 3: nukeAround + mineBlock
  assert.match(src, /const roof = await gravityClearBefore\(cand\.pos\)/, 'nukeAround fences every candidate')
  assert.match(src, /const roof = await gravityClearBefore\(pos\)/, 'mineBlock fences its target')
  // the stats ledger
  assert.match(src, /stats\.gravityRefused/, 'refusals count in the stats ledger')
  assert.match(src, /stats\.gravityCleared/, 'clears count in the stats ledger')
})
