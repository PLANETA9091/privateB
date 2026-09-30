// (v0.343.0) THE LID SCAN - the tests.
//
// The fifth face (36690923417) pinned the bot under a water LID: F1's climb
// rose 45.0 -> 47.2 and held y=47.2 for the whole legacy window with the head
// WET and the o2 draining, and no 'deep-pocket ascend' line ever printed.
// Two data laws owned the silence: ceilingCell probes exactly floor(y)+2
// (one cell above the head), and minecraft-data reads WATER diggable:true
// (hardness 100) - the old probe accepted the fluid and bot.dig(water)
// burned its 6s timeout inside the silent catch. The plan below is the
// cure's decision layer: water skips, diggable non-water digs, everything
// else refuses honestly. The mechanical read (lidReads) and the two rescue
// wirings are pinned from source.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lidScanPlan, ASCEND_LID_SCAN, ceilingCell } from '../../src/lib/drowning.mjs'

const W = { diggable: true, isWater: true } // a water cell (the data's own lie: diggable true)
const S = { diggable: true, isWater: false } // a diggable solid (stone-class)
const A = { diggable: false, isWater: false } // air or bedrock-class: neither lid nor diggable

test('the boundary pin: a diggable read at the legacy probe keeps the offset-0 shape', () => {
  const p = lidScanPlan({ reads: [S] })
  assert.equal(p.offset, 0, 'offset 0 IS the legacy ceilingCell probe - the old shape, unrenamed')
  assert.equal(p.why, 'the ceiling reads diggable at the legacy probe')
})

test('the lid shapes: the scan lifts the dig through the water it was drowning under', () => {
  assert.equal(lidScanPlan({ reads: [W, S] }).offset, 1, 'one lid cell - the roof one probe beyond the old reach')
  assert.equal(lidScanPlan({ reads: [W, W, S] }).offset, 2, 'two lid cells')
  assert.equal(lidScanPlan({ reads: [W, W, W, W, S] }).offset, 4, 'four lid cells - the bound\'s own edge')
  const p = lidScanPlan({ reads: [W, S] })
  assert.match(p.why, /the lid is 1 water cell\(s\)/, 'the why names the lid it crossed')
})

test('the fluid law: water is NEVER the target, no matter how deep the column reads', () => {
  assert.equal(lidScanPlan({ reads: [W] }).offset, -1, 'all lid, no roof - the bound refuses')
  assert.equal(lidScanPlan({ reads: [W, W, W, W, W] }).offset, -1, 'the bound never left the lid')
  assert.match(lidScanPlan({ reads: [W, W, W, W, W] }).why, /never left the lid/, 'the refusal names its arithmetic')
})

test('the honest refusals: air, bedrock-class, lost reads and junk never arm a dig', () => {
  assert.equal(lidScanPlan({ reads: [A] }).offset, -1, 'air above the head is no lid and no dig - the bot should rise through it')
  assert.equal(lidScanPlan({ reads: [W, A, S] }).offset, -1, 'the scan stops at the first non-lid non-diggable - it does not leap the unknown')
  assert.equal(lidScanPlan({ reads: [W, null] }).offset, -1, 'a lost read refuses')
  assert.match(lidScanPlan({ reads: [W, null] }).why, /read 1 lost/, 'the why names the lost read')
  assert.equal(lidScanPlan({ reads: [] }).offset, -1, 'an empty read never arms a dig')
  assert.equal(lidScanPlan({ reads: null }).offset, -1, 'junk reads refuse')
  assert.equal(lidScanPlan({ reads: 'x' }).offset, -1, 'a junk type refuses')
  assert.equal(lidScanPlan({}).offset, -1, 'no input refuses')
  assert.equal(lidScanPlan({ reads: [{}] }).offset, -1, 'a junk entry reads neither lid nor diggable - refuse')
  assert.equal(lidScanPlan({ reads: [null, S] }).offset, -1, 'a lost probe below the roof never arms the dig above it')
})

test('the bound pin: ASCEND_LID_SCAN is the four cells past the legacy probe', () => {
  assert.equal(ASCEND_LID_SCAN, 4, 'the scan is bounded - the budget and the freeze verdict still own the lane')
})

test('the legacy probe is untouched: ceilingCell still reads floor(y)+2', () => {
  const c = ceilingCell({ x: -113.4, y: 47.2, z: 390.9 })
  assert.deepEqual(c, { x: -114, y: 49, z: 390 }, 'the first read IS the old probe (floor(-113.4)=-114, floor(y)+2=49) - the scan extends it, never redefines it')
  assert.equal(ceilingCell(null), null, 'junk positions read null (the v0.125.0 law holds)')
})

// --- the wiring pins (the machinery must ride the two rescue dig sites) ---

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('the grace wiring: the condemned pass digs through the plan, not the one-cell probe', () => {
  assert.ok(minerSrc.includes("lidScanPlan({ reads: lidReads(bot, gcell) })"), 'the grace plans from the column read')
  assert.ok(minerSrc.includes('ascend grace - dug the ceiling ${gceil.name} at [${gtgt.x},${gtgt.y},${gtgt.z}]${gplan.offset > 0 ? ` through a ${gplan.offset}-cell lid`'), 'the grace log keeps its legacy shape at offset 0 and names the lid at offset > 0')
  assert.ok(/ascendGraceWanted\(\{ headWet, ascendDigs, points: passPoints \}\)\) \{[^}]*lidScanPlan/.test(minerSrc), 'the plan rides the grace precondition (head wet, budget, stall armed)')
  const grace = minerSrc.slice(minerSrc.indexOf('ascend grace dig'))
  assert.ok(grace.includes('continue // the pass is spent on the dig'), 'the grace keeps its continue - the dig owns the pass')
})

test('the pass-loop wiring: the budget gates the scan, the plan picks the cell', () => {
  assert.ok(minerSrc.includes("lidScanPlan({ reads: lidReads(bot, cell) })"), 'the pass loop plans from the column read')
  assert.ok(minerSrc.includes('if (ascendDigs < ASCEND_DIG_BUDGET && ascendStalled({ points: passPoints })) {'), 'the budget gate stays byte for byte')
  assert.ok(minerSrc.includes('deep-pocket ascend - dug the ceiling ${ceil.name} at [${tgt.x},${tgt.y},${tgt.z}]${plan.offset > 0 ? ` through a ${plan.offset}-cell lid`'), 'the ascend log keeps its legacy shape at offset 0 and names the lid at offset > 0')
})

test('the fluid re-check: both dig sites refuse a fluid target even after the plan', () => {
  const hits = minerSrc.match(/diggable === true && isWaterName\([a-z]+\.name\) !== true/g) || []
  assert.ok(hits.length >= 2, `the water re-check rides both rescue sites (found ${hits.length})`)
})

test('the mechanical read: the column walks the legacy probe first, then the lid cells', () => {
  assert.ok(minerSrc.includes('for (let i = 0; i <= ASCEND_LID_SCAN; i++)'), 'the read is bounded by the scan constant')
  assert.ok(minerSrc.includes('isWater: isWaterName(b.name) === true'), 'the read carries the fluid law')
  assert.ok(minerSrc.includes('reads.push(b == null ? null :'), 'a lost read rides null - the plan refuses it')
})

test('the third dig site stays byte for byte: the wet-column climb keeps its own lane', () => {
  assert.ok(minerSrc.includes("'wet ceiling ascend dig'"), 'the wet-climb dig is untouched - its pricing rides its own face')
})
