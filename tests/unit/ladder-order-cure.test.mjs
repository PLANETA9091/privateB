// (v0.378.0) - faces 12/15/16 paid ELEVEN zero-probe
// timeouts while the shore-stall latch sat mathematically unable to fire:
// (a) the pass-count patience (15) exceeds a slow-cadence budget's whole pass
// supply (face 16's F17 died at 13 passes / 26.2s), and (b) the plan key was
// the EXACT bearing pair, so the shore scan's wobble between adjacent integer
// deltas (face 15: (2,5)x5 + (3,6)x4 + (2,4)x3 - one shore, three keys) reset
// the pass clock every wobble. The cure: the latch keys the bearing's SECTOR
// and the patience gains a TIME arm (10s without margin progress = the same
// wall at any cadence), leaving the release/probe branches the ladder's
// remaining ~15s. The land branch keeps its byte-identical call (its latch
// has field legs - transit-stall lines exist).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  transitStalled, bearingSectorKey, TRANSIT_STALL_MS, TRANSIT_STALL_PASSES, BEARING_SECTORS
} from '../../src/lib/drowning.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('sector key: the face-15 wobble trio lands in ONE sector (the clock survives)', () => {
  const a = bearingSectorKey({ dx: 2, dz: 5 })
  const b = bearingSectorKey({ dx: 3, dz: 6 })
  const c = bearingSectorKey({ dx: 2, dz: 4 })
  assert.equal(typeof a, 'number', 'a real bearing keys to a sector')
  assert.equal(a, b, '(2,5) and (3,6) are the same direction at the same wall')
  assert.equal(a, c, '(2,5) and (2,4) are the same direction at the same wall')
})

test('sector key: opposite and orthogonal bearings do NOT share a sector', () => {
  const a = bearingSectorKey({ dx: 2, dz: 5 })
  assert.notEqual(a, bearingSectorKey({ dx: -2, dz: -5 }), 'the reverse bearing is a different wall')
  assert.notEqual(a, bearingSectorKey({ dx: -5, dz: 2 }), 'a ~90-degree turn is a different wall')
})

test('sector key: junk never keys (null -> the caller keeps its legacy pair key)', () => {
  assert.equal(bearingSectorKey({ dx: null, dz: 5 }), null)
  assert.equal(bearingSectorKey({ dx: 2, dz: null }), null)
  assert.equal(bearingSectorKey({ dx: 'x', dz: 5 }), null)
  assert.equal(bearingSectorKey({ dx: 0, dz: 0 }), null, 'the zero vector is not a bearing')
  assert.equal(bearingSectorKey({}), null, 'missing deltas activate no defaults into a phantom key')
  assert.equal(bearingSectorKey({ dx: 1, dz: 0 }), bearingSectorKey({ dx: 4, dz: 0, sectors: 8 }),
    'positive-axis sectors are stable across bucket counts')
  assert.ok(bearingSectorKey({ dx: 2, dz: 5 }) >= 0 && bearingSectorKey({ dx: 2, dz: 5 }) < BEARING_SECTORS,
    'the sector index stays inside the bucket count')
})

test('time patience: the F17 shape (13-pass slow budget) now latches BEFORE the budget dies', () => {
  // face 16's F17: one bearing, 13 passes / 26.2s, ring never closed - the
  // pass patience (15) is mathematically out of reach, the time arm fires.
  assert.equal(transitStalled({ d0: 12, d: 11, passes: 4, ms: TRANSIT_STALL_MS + 500 }), true,
    '4 fast passes + 10.5s without margin progress = the wall owns the swim')
  assert.equal(transitStalled({ d0: 12, d: 11, passes: 4, ms: TRANSIT_STALL_MS - 500 }), false,
    'under the time patience the rescue keeps its remaining patience')
})

test('time patience: the margin discipline holds on BOTH arms (progress never condemns)', () => {
  assert.equal(transitStalled({ d0: 12, d: 10, passes: 40, ms: TRANSIT_STALL_MS * 5 }), false,
    'the ring closed by the margin - the plan is working, never condemn')
  assert.equal(transitStalled({ d0: 12, d: 11.9, passes: 3, ms: TRANSIT_STALL_MS + 1 }), true,
    'sub-margin "progress" at a stalled clock is still the wall')
})

test('time patience: junk ms is a lost reading, never a condemnation; the legacy call is byte-identical', () => {
  assert.equal(transitStalled({ d0: 12, d: 11, passes: 4, ms: 'later' }), false,
    'a junk ms falls back to the pass arm (4 < 15 = no stall)')
  assert.equal(transitStalled({ d0: 12, d: 11, passes: 4, ms: null }), false)
  assert.equal(transitStalled({ d0: 12, d: 11, passes: 4 }), false, 'the land call shape: no ms at all')
  assert.equal(transitStalled({ d0: 12, d: 11, passes: 4, maxMs: null }), false,
    'a null maxMs disables the time arm entirely (the legacy pure shape)')
  assert.equal(transitStalled({ d0: 12, d: 11, passes: TRANSIT_STALL_PASSES }), true,
    'the pass arm rides untouched at the full patience')
  assert.equal(transitStalled({ d0: 12, d: 11, passes: TRANSIT_STALL_PASSES - 1 }), false)
  assert.equal(transitStalled({ d0: null, d: 11, passes: 40, ms: TRANSIT_STALL_MS * 9 }), false,
    'junk distances never condemn (the Number(null) hole discipline)')
})

test('wiring pins: the dir branch keys the sector, carries atMs, passes ms; the land call stays byte-identical', () => {
  assert.ok(minerSrc.includes('bearingSectorKey({ dx: dir.dx, dz: dir.dz }) ?? `${dir.dx},${dir.dz}`'),
    'the dir plan keys the sector with the legacy pair as the junk fallback')
  assert.ok(minerSrc.includes('atPass: passNo, atMs: Date.now()'),
    'the dir plan stamps both clocks (the pass clock AND the wall clock)')
  assert.ok(minerSrc.includes('ms: Date.now() - dirPlan.atMs'),
    'the dir latch consults the time patience')
  const dirIdx = minerSrc.indexOf('if (dir && !transitStalledFlag) {')
  const landIdx = minerSrc.indexOf("} else if (land && !transitStalledFlag) {")
  const dirBranch = minerSrc.slice(dirIdx, landIdx)
  const landBranch = minerSrc.slice(landIdx)
  assert.ok(dirBranch.includes('bearingSectorKey'), 'the sector key lives in the DIR branch')
  assert.ok(!landBranch.slice(0, landBranch.indexOf('transitStalled({') + 400).includes('bearingSectorKey') ||
    landBranch.indexOf('bearingSectorKey') === -1,
    'the land branch keeps its exact-pair key (byte-identical latch behavior)')
  const landCall = landBranch.slice(landBranch.indexOf('transitStalled({'), landBranch.indexOf('transitStalled({') + 120)
  assert.ok(landCall.includes('passes: passNo - transitPlan.atPass'), 'the land call keeps its pass patience')
  assert.ok(!landCall.includes('ms:'), 'the land call does NOT pass ms (no behavior change without field legs)')
})
