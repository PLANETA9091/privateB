// tests/unit/cutgap.test.mjs
// (v0.281.0) THE CUT REACH GAP - the split now mirrors the cut's OWN fence.
// Face 36402553113's first histogram read 'near=3 far=10 cut=0 nthick=3
// nthin=0' with ZERO 'ledge cut' lines: the split counted 3 cut targets and
// the cut took none - the structural mismatch was the REACH: the split read
// 'cut' at distXZ <= SUPPORT_DIG_REACH (2) while the cut's own fence
// (ledgeCutWanted) refuses past LEDGE_CUT_REACH (1.5) - the lip dig's
// measured magnet radius, not a tunable. The divide is honest now: the
// gap band (1.5 < dist <= 2.0, thick) keeps its name in the row ('ngap=N')
// and the stance side owns it - the candidate the far-front's stance
// change starts from. The cut's fence itself is UNTOUCHED (the magnet law
// stands - the cure is a stance change, not a wider magnet).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sealCutClass, ledgeCutWanted, SUPPORT_DIG_REACH, LEDGE_CUT_REACH } from '../../src/lib/drops.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
const dropsSrc = readFileSync(new URL('../../src/lib/drops.mjs', import.meta.url), 'utf8')

test('the gap band: the 1.5-2.0 divide mirrors the cut fence exactly (the coherence law)', () => {
  for (const dist of [1.51, 1.75, 2]) {
    assert.equal(sealCutClass(dist, 3), 'gap', `dist ${dist} is thick-near but the cut's fence refuses - 'gap' names it`)
    assert.equal(ledgeCutWanted({ dy: 2, distXZ: dist, sealDepth: 3, fluidBelow: false }), null, `dist ${dist}: the cut's own fence refuses the same band - the split and the fence AGREE`)
  }
  for (const dist of [0, 1, 1.5]) {
    assert.equal(sealCutClass(dist, 3), 'cut', `dist ${dist} is inside the cut's radius`)
    assert.equal(ledgeCutWanted({ dy: 2, distXZ: dist, sealDepth: 3, fluidBelow: false }), 1, `dist ${dist}: the fence takes the same band (dy-1=1) - the coherence holds`)
  }
  assert.equal(LEDGE_CUT_REACH, 1.5, "the cut radius byte-pin - the lip dig's measured magnet law")
  assert.equal(SUPPORT_DIG_REACH, 2, 'the dig stand-off byte-pin')
})

test('the face 36402553113 shape replays honestly (the nthick=3 cut=0 mystery resolved)', () => {
  // the face's three candidates sat in the gap band - the OLD split counted
  // them 'cut' and the row read nthick=3 cut=0 with zero attempt lines; the
  // NEW split names them 'gap' and the row reads nthick=0 nthin=0 ngap=3
  const faceCandidates = [1.8, 1.9, 2.0]
  let cut = 0; let gap = 0; let thin = 0
  for (const dist of faceCandidates) {
    const cls = sealCutClass(dist, 3)
    if (cls === 'cut') cut++
    else if (cls === 'gap') gap++
    else if (cls === 'thin') thin++
  }
  assert.equal(cut, 0, 'no candidate inside the cut radius - the cut never arms (the face read explained)')
  assert.equal(gap, 3, 'all three name the gap band - the stance side owns them')
  assert.equal(thin, 0, 'no thin anomalies on this shape')
})

test('the junk law carried: a junk cutReach refuses the call (a junk config counts nothing)', () => {
  assert.equal(sealCutClass(1.4, 3, SUPPORT_DIG_REACH, NaN), null, 'a junk cutReach refuses - the honest refusal, never a guessed class')
  assert.equal(sealCutClass(1.4, 3, SUPPORT_DIG_REACH, -1), null, 'a negative cutReach refuses')
  assert.equal(sealCutClass(1.4, 3, SUPPORT_DIG_REACH, '2'), null, 'a string cutReach refuses (the strict gate)')
})

test('the gap is wired: the miner counts it, the seed grows, the row carries ngap (v0.281.0)', () => {
  assert.ok(dropsSrc.includes("'cut'|'thin'|'gap'|null"), 'the split documents the gap class')
  assert.ok(minerSrc.includes("else if (cutClass === 'gap') sealCutGap++"), 'the miner counts the gap band')
  assert.ok(minerSrc.includes('sd.sealCutGap += sealCutGap'), 'the gap count accumulates into the stats')
  assert.ok(minerSrc.includes('sealNearThin: 0, sealCutGap: 0, stanceStep: 0, stanceCut: 0 }'), 'the stats seed grows with the gap bucket')
  assert.ok(fleetSrc.includes('belowResidueRow'), 'the fleet row rides the shared renderer (the row change needs no runner edit - the coherence law)')
  assert.ok(dropsSrc.includes('ngap=${acc.sealCutGap}'), 'the ledger renderer carries the gap token (the tail-append law - the step tokens join behind it)')
  assert.ok(dropsSrc.includes('stepcut=${acc.stanceCut}'), 'the ledger renderer carries the step tail last (the v0.283.0 tail-append law)')
})
