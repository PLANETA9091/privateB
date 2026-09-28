// Tests for v0.275.0 THE LEDGE CUT (src/lib/drops.mjs + the miner.mjs wiring).
//
// The split's first field read (face 36387892453: near=4 far=11) proved the
// NEAR bucket real: sealed drops the bot legally stands beside, which every
// dig variant refused honestly (the v0.263.0 fence needs an air column to
// shake into; the seal has none). THE CUT: dig the seal column's top dy-1
// cells (S-1..S-(dy-1)), then the support - the drop falls the cut column
// and lands ON THE BOT'S OWN LAYER, where the magnet owns it. THE FENCE:
// sealDepth >= dy (the column's floor S-dy must read solid - an unmeasured
// landing never cuts, the v0.86.0 lesson), the column stays dry, the stance
// stays inside LEDGE_CUT_REACH 1.5 (the lip dig's field lesson: the range-2
// arrival was outside the magnet - the cut's landing is level, its 3D
// distance is exactly distXZ). Junk law: a lost read never arms a cut.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ledgeCutWanted, LEDGE_CUT_REACH, sweepDropRecord, belowResidueRow } from '../../src/lib/drops.mjs'

test('the cut arithmetic: the dig count is dy-1 (the drop lands on the bot\'s own layer)', () => {
  assert.equal(ledgeCutWanted({ dy: 1, distXZ: 1.0, sealDepth: 1, fluidBelow: false }), 0, 'dy 1: no seal cells - the support shake alone lands the drop on my layer (the floor S-1 is solid by the sealed class itself)')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.0, sealDepth: 2, fluidBelow: false }), 1, 'dy 2: dig S-1 + the support, the drop falls two cells to my layer')
  assert.equal(ledgeCutWanted({ dy: 3, distXZ: 1.0, sealDepth: 3, fluidBelow: false }), 2, 'dy 3: dig S-1..S-2 + the support, the drop falls three cells to my layer')
})

test('the floor fence: sealDepth >= dy (an unmeasured landing never cuts)', () => {
  assert.equal(ledgeCutWanted({ dy: 3, distXZ: 1.0, sealDepth: 2, fluidBelow: false }), null, 'a thin seal under a high ledge: the cut column would bottom above an unmeasured depth - refused')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.0, sealDepth: 1, fluidBelow: false }), null, 'seal 1 under dy 2: the drop falls past the cut')
  assert.equal(ledgeCutWanted({ dy: 3, distXZ: 1.0, sealDepth: 3, fluidBelow: false }), 2, 'sealDepth === dy is the boundary that cuts (the floor S-dy reads solid)')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.0, sealDepth: 3, fluidBelow: false }), 1, 'a thick seal under a low ledge cuts its top - the extra depth is never touched')
})

test('the reach fence: LEDGE_CUT_REACH 1.5 (the lip dig\'s magnet lesson)', () => {
  assert.equal(LEDGE_CUT_REACH, 1.5, 'the cap is the measured magnet radius, inside the v0.263.0 stand-off 2')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.5, sealDepth: 2, fluidBelow: false }), 1, 'distXZ === reach still cuts (the boundary is byte-true with the fence family)')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.6, sealDepth: 2, fluidBelow: false }), null, 'just outside the magnet - the field\'s own lesson (the range-2 arrival outside the magnet)')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 2.0, sealDepth: 2, fluidBelow: false }), null, 'the v0.263.0 stand-off is NOT enough for a level landing')
})

test('the junk law: a lost read never arms a cut', () => {
  assert.equal(ledgeCutWanted(), null, 'the zero-arg call refuses')
  assert.equal(ledgeCutWanted({ dy: NaN, distXZ: 1.0, sealDepth: 2, fluidBelow: false }), null)
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: NaN, sealDepth: 2, fluidBelow: false }), null)
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.0, sealDepth: null, fluidBelow: false }), null, 'a lost seal read claims no cut')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.0, sealDepth: undefined, fluidBelow: false }), null)
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: -1, sealDepth: 2, fluidBelow: false }), null, 'a negative stand-off is junk')
})

test('the class fences: the dy domain and the dry guard', () => {
  assert.equal(ledgeCutWanted({ dy: 0, distXZ: 1.0, sealDepth: 1, fluidBelow: false }), null, 'dy 0 is below the ledge class')
  assert.equal(ledgeCutWanted({ dy: 4, distXZ: 1.0, sealDepth: 4, fluidBelow: false }), null, 'dy 4 is beyond the ledge cap - the landing is unmeasured')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.0, sealDepth: 2, fluidBelow: true }), null, 'a wet cut drains the drop into fluid - refused')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.0, sealDepth: 2 }), null, 'an unmeasured wet guard is a blind dig (the v0.86.0 lesson)')
})

test('the row carries the cut: sweepDropRecord + the fleet row tail (the identity-extends law)', () => {
  const rec = sweepDropRecord({ sweeps: 2, seal3: 4, sealNear: 1, sealFar: 3, ledgeCut: 2 })
  assert.equal(rec.ledgeCut, 2)
  assert.equal(sweepDropRecord({ ledgeCut: 'x' }).ledgeCut, 0, 'junk floors at zero - the row never carries a guess')
  assert.equal(sweepDropRecord({ ledgeCut: -3 }).ledgeCut, 0)
  const row = belowResidueRow([{ sweeps: 1, seal3: 4, sealNear: 1, sealFar: 3, ledgeCut: 2 }])
  assert.match(row, /near=1 far=3 cut=2 nthick=0 nthin=0$/, 'the cut rides the row tail - the legacy tokens keep their positions')
  assert.match(belowResidueRow([{ ledgeCut: 2 }, { ledgeCut: 1 }, null, undefined]), /cut=3 nthick=0 nthin=0$/, 'the fleet row sums the cuts')
  assert.match(belowResidueRow([null, undefined, {}]), /near=0 far=0 cut=0 nthick=0 nthin=0$/, 'the all-junk row still renders the tokens (byte-true zeros)')
})

test('the ledge cut is wired: the miner cuts the near bucket (v0.275.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const dropsSrc = readFileSync(new URL('../../src/lib/drops.mjs', import.meta.url), 'utf8')
  assert.ok(dropsSrc.includes('export function ledgeCutWanted'), 'the pure layer exports the cut')
  assert.ok(dropsSrc.includes('export const LEDGE_CUT_REACH'), 'the reach cap is a named constant')
  assert.ok(minerSrc.includes('ledgeCutWanted'), 'the miner imports the cut')
  assert.ok(minerSrc.includes("ledgeCutWanted({ dy: dyNow, distXZ, sealDepth: sealN, fluidBelow: strikeSupport !== null })"), 'the call rides the probe reads (a lost read never arms a cut)')
  assert.ok(minerSrc.includes('await bot.fastDig(support) // the shake: the drop falls the cut column to my layer'), 'the support shake rides the cut column')
  assert.ok(minerSrc.includes("ledge cut - dug"), 'the field line names the conversion')
  assert.ok(minerSrc.includes('sd.ledgeCut += cutDigs'), 'the counter rides stats for the fleet row')
  assert.ok(minerSrc.includes('sealNear: 0, sealFar: 0, ledgeCut: 0'), 'the stats view initializes the cut (the legacy fields keep their positions)')
})
