// tests/unit/sealreach.test.mjs
// (v0.273.0) THE SEAL REACH SPLIT - the seal depth histogram's first field
// read (face 36378053182: seal1=0 seal2=0 seal3=18) proved the sealed class
// all-thick, but the refusal order names the seal BEFORE the stand-off check,
// so the probe was counting candidates the dig can never own (the field's own
// row opened with 'air 0, dist 3.0, seal 3' - dist 3.0 sits outside
// SUPPORT_DIG_REACH 2). The ledge-cut design brief must know which seals the
// dig family can even own: sealReachBucket splits the sealed class into the
// NEAR side (inside the reach - the cut's candidate) and the FAR side (a
// stance change owns it first - a walk-adjacent cure, a different front).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sealReachBucket, sweepDropRecord, belowResidueRow, SUPPORT_DIG_REACH } from '../../src/lib/drops.mjs'

test('sealReachBucket: the reach boundary splits near from far (byte-true with the refusal order)', () => {
  assert.equal(SUPPORT_DIG_REACH, 2, 'the reach cap the split mirrors - the v0.263.0 fence owns the number')
  assert.equal(sealReachBucket(0), 'near', 'a drop at the stance is the dig family\'s own candidate')
  assert.equal(sealReachBucket(1.4), 'near', 'the magnet-band stance')
  assert.equal(sealReachBucket(SUPPORT_DIG_REACH), 'near', 'dist === reach still passes the fence (dist > reach refuses) - near is byte-true')
  assert.equal(sealReachBucket(2.1), 'far', 'just outside the reach - the field\'s own shape (dist 3.0)')
  assert.equal(sealReachBucket(3.0), 'far', 'the face 36378053182 row: a far seal claims no cut until the stance moves')
  assert.equal(sealReachBucket(100), 'far')
})

test('sealReachBucket: junk claims no bucket (a lost read never arms a count)', () => {
  assert.equal(sealReachBucket(undefined), null)
  assert.equal(sealReachBucket(null), null)
  assert.equal(sealReachBucket(NaN), null)
  assert.equal(sealReachBucket(Infinity), null)
  assert.equal(sealReachBucket('3.0'), null, 'a string distance is not a measurement')
  assert.equal(sealReachBucket(-1), null, 'a negative stand-off is junk (the fence never reads one)')
  assert.equal(sealReachBucket(2, NaN), null, 'a junk reach refuses the call even with a clean distance')
  assert.equal(sealReachBucket(2, 'x'), null)
})

test('sealReachBucket: the reach override keeps the pure layer testable (and the split symmetric)', () => {
  assert.equal(sealReachBucket(5, 5), 'near')
  assert.equal(sealReachBucket(5.1, 5), 'far')
  assert.equal(sealReachBucket(0, 0), 'near', 'a zero reach still owns the zero stand-off')
})

test('the sweepDropRecord row carries the split and floors junk (the v0.267.0 tail precedent)', () => {
  const rec = sweepDropRecord({ sweeps: 2, seal3: 4, sealNear: 1, sealFar: 3 })
  assert.equal(rec.sealNear, 1)
  assert.equal(rec.sealFar, 3)
  assert.equal(sweepDropRecord({ sealNear: 'x', sealFar: NaN }).sealNear, 0, 'junk floors at zero - the row never carries a guess')
  assert.equal(sweepDropRecord({ sealFar: -5 }).sealFar, 0)
  const row = belowResidueRow([{ sweeps: 1, seal3: 4, sealNear: 1, sealFar: 3 }])
  assert.match(row, /seal3=4 near=1 far=3 cut=0 nthick=0 nthin=0$/, 'the split rides the row tail - the legacy tokens keep their positions')
})

test('belowResidueRow: the split aggregates across bots (and the all-junk row keeps its shape)', () => {
  const row = belowResidueRow([{ sealNear: 2, sealFar: 5 }, { sealNear: 1 }, null, undefined])
  assert.match(row, /near=3 far=5 cut=0 nthick=0 nthin=0$/, 'the fleet row sums both buckets')
  assert.match(belowResidueRow([null, undefined, {}]), /seal3=0 near=0 far=0 cut=0 nthick=0 nthin=0$/, 'the all-junk row still renders the tokens (byte-true zeros)')
})

test('the reach split is wired: the miner counts it into the ledger (v0.273.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const dropsSrc = readFileSync(new URL('../../src/lib/drops.mjs', import.meta.url), 'utf8')
  assert.ok(dropsSrc.includes('export function sealReachBucket'), 'the pure layer exports the split')
  assert.ok(minerSrc.includes('sealReachBucket'), 'the miner imports the split')
  assert.ok(minerSrc.includes("sealReachBucket(distXZ) === 'near'") && minerSrc.includes("sealReachBucket(distXZ) === 'far'"), 'both buckets counted - a lost read claims neither')
  assert.ok(minerSrc.includes('sd.sealNear += sealNear') && minerSrc.includes('sd.sealFar += sealFar'), 'the counters ride stats for the fleet row')
  assert.ok(minerSrc.includes('sealNear: 0, sealFar: 0'), 'the stats view initializes the split (the legacy fields keep their positions)')
})
