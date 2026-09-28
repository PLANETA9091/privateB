// (v0.277.0) THE CUT TARGET SPLIT pins - the near bucket's own divide.
// The reach split's first field read (face 36387892453: near=4 far=11)
// proved the ledge-cut brief STANDS; this split answers the brief's next
// question: WHICH near candidates does the cut own? A near THICK seal
// (depth >= 2) is the cut's target ('cut'); a near THIN seal (depth 1) is
// the dig family's own missed candidate ('thin' - its refusal reason is the
// anomaly to decode). Far and junk claim nothing (never counted).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sealCutClass, sweepDropRecord, belowResidueRow, SUPPORT_DIG_REACH } from '../../src/lib/drops.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const dropsSrc = readFileSync(new URL('../../src/lib/drops.mjs', import.meta.url), 'utf8')

test('sealCutClass: the boundary family - the cut radius owns the inside, the gap band keeps its name (v0.281.0)', () => {
  assert.equal(sealCutClass(1.4, 3), 'cut', "dist 1.4 is INSIDE the cut's own 1.5 fence - the cut owns it")
  assert.equal(sealCutClass(1.5, 2), 'cut', 'dist === cutReach stays inside (the fence is <=)')
  assert.equal(sealCutClass(2, 3), 'gap', "dist 2.0 is near but OUTSIDE the cut's 1.5 fence - the gap band names it (the face 36402553113 law: nthick=3 cut=0)")
  assert.equal(sealCutClass(2, 2), 'gap', 'depth 2 in the gap band - the stance side owns the last half block')
  assert.equal(sealCutClass(2, 1), 'thin', 'depth 1 is the dig family own missed candidate (the thin law unchanged)')
  assert.equal(sealCutClass(0, 3), 'cut', 'a zero stand-off thick seal reads its cut class')
})

test('sealCutClass: the far law - a far seal claims no target (the stance change owns it first)', () => {
  for (const dist of [2.1, 3.0, 100]) {
    assert.equal(sealCutClass(dist, 3), null, `dist ${dist} is far - the reach split law carried`)
  }
})

test('sealCutClass: the junk law - a junk depth or distance claims no target', () => {
  for (const junkDepth of [null, undefined, NaN, 0, -1, 1.5, '2', Infinity]) {
    assert.equal(sealCutClass(2, junkDepth), null, `junk depth ${String(junkDepth)} claims no target`)
  }
  for (const junkDist of [null, undefined, NaN, -1, '2']) {
    assert.equal(sealCutClass(junkDist, 3), null, `junk dist ${String(junkDist)} claims no target`)
  }
  assert.equal(sealCutClass(2, 3, NaN), null, 'a junk reach refuses the call (the v0.273.0 refusal carried)')
})

test('sealCutClass: the reach override passes through (the v0.273.0 signature family)', () => {
  assert.equal(sealCutClass(2.5, 3, 3), 'gap', "a wider reach makes dist 2.5 near - but the cut's OWN radius still owns the cut class (the v0.281.0 law)")
  assert.equal(sealCutClass(2.5, 3, 3, 2.5), 'cut', "the cutReach override mirrors the cut's fence - the tests inject both")
  assert.equal(sealCutClass(3.1, 3, 3), null)
  assert.equal(SUPPORT_DIG_REACH, 2, 'the default reach byte-pin')
})

test('the row tail extends: nthick=N nthin=N ride after far (the v0.205.0 tail precedent)', () => {
  const rec = sweepDropRecord({ sweeps: 2, failed: 1, seal3: 4, sealNear: 1, sealFar: 3, sealCutTargets: 1, sealNearThin: 0, sealCutGap: 1 })
  const row = belowResidueRow([rec])
  assert.match(row, /seal3=4 near=1 far=3 cut=0 nthick=1 nthin=0 ngap=1$/, 'the split rides the row tail - the legacy tokens keep their positions, ngap joins last')
  assert.match(belowResidueRow([null, undefined, {}]), /seal3=0 near=0 far=0 cut=0 nthick=0 nthin=0 ngap=0$/, 'the all-junk row still renders the tokens (byte-true zeros)')
  const fl = sweepDropRecord({ sealCutTargets: NaN, sealNearThin: '3', sealCutGap: -1 })
  assert.equal(fl.sealCutTargets, 0, 'a junk target floors at zero')
  assert.equal(fl.sealNearThin, 0, 'a junk string floors at zero (the house junk law - a string is not a measurement)')
  assert.equal(fl.sealCutGap, 0, 'a junk gap floors at zero')
})

test('the fleet row sums both split counters across bots (the aggregate law)', () => {
  const row = belowResidueRow([
    sweepDropRecord({ sealCutTargets: 2, sealNearThin: 1, sealCutGap: 1 }),
    sweepDropRecord({ sealCutTargets: 3, sealNearThin: 4, sealCutGap: 2 })
  ])
  assert.match(row, /cut=0 nthick=5 nthin=5 ngap=3$/, 'the fleet row sums all three buckets')
})

test('the cut target split is wired: drops exports, the miner counts both, the seed grows (v0.277.0)', () => {
  assert.ok(dropsSrc.includes('export function sealCutClass'), 'the split is exported beside the reach split')
  assert.ok(minerSrc.includes('sealReachBucket, sealCutClass,'), 'the miner imports the split')
  assert.ok(minerSrc.includes("const cutClass = sealCutClass(distXZ, sealN)"), 'the probe feeds both distance and depth')
  assert.ok(minerSrc.includes('sd.sealCutTargets += sealCutTargets'), 'the cut targets accumulate')
  assert.ok(minerSrc.includes('sd.sealNearThin += sealNearThin'), 'the near-thin count accumulates')
  assert.ok(minerSrc.includes('sealNear: 0, sealFar: 0, ledgeCut: 0, sealCutTargets: 0, sealNearThin: 0, sealCutGap: 0 }'), 'the stats seed grows with the split')
})
