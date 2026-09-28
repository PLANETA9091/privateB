// Tests for v0.283.0 THE STANCE STEP - the COMPOSED tree (the near-duplicate
// law's composition branch). The 1930 lane's bde0622 shipped the behavior
// (stanceStepBlocks + the four-form step on the vein sweep band) while this
// lane's parallel fire built the same cure with its own day-scale census
// (the row's step=/stepcut= tokens). TWIN behavior, COMPLEMENTARY
// instruments - the per-event forms name the fences live, the row census
// answers the day-scale question the ngap token opened: how many gap-band
// candidates did the step cure? The behavior stands byte-true (bde0622);
// this file pins the composition: the census wiring + the band coherence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stanceStepBlocks, LEDGE_CUT_REACH, sealCutClass, sweepDropRecord, belowResidueRow } from '../../src/lib/drops.mjs'

test('the ceil law: the whole-block step count closes the stand-off honestly', () => {
  assert.equal(stanceStepBlocks(1.5), null, 'distXZ === reach is INSIDE the magnet - the cut arms without help, no step')
  assert.equal(stanceStepBlocks(1.6), 1, 'just outside the magnet - the face 36411203362 census\'s own band (the candidates sat at 1.8-2.0)')
  assert.equal(stanceStepBlocks(2.5), 1, 'the whole 1.5-2.5 band reads 1 (ceil(1.0) = 1 - the ceil law\'s edge)')
  assert.equal(stanceStepBlocks(2.6), 2, 'beyond 2.5 two whole blocks are the honest count')
  assert.equal(stanceStepBlocks(0), null, 'standing on the column - nothing to close')
  assert.equal(stanceStepBlocks(-0.1), null, 'a negative stand-off is junk - no step')
  assert.equal(stanceStepBlocks(), null, 'the zero-arg call refuses')
  assert.equal(stanceStepBlocks(NaN), null, 'a junk distance claims no step')
  assert.equal(stanceStepBlocks(1.8, 1.2), 1, 'the reach injection - the fence family\'s test form')
  assert.equal(LEDGE_CUT_REACH, 1.5, 'the magnet law stands - the step closes the gap TO the fence, never widens the fence')
})

test('the composition coherence: every gap-band candidate reads a ONE-block step (the ngap class is the class the step cures)', () => {
  for (let d = 1.6; d <= 2.0; d += 0.1) {
    assert.equal(sealCutClass(d, 2), 'gap', `distXZ ${d.toFixed(1)} is the split's gap class (the setup)`)
    assert.equal(stanceStepBlocks(d), 1, `distXZ ${d.toFixed(1)}: the step closes the gap band in ONE block - the ngap census and the cure are the same class`)
  }
  assert.equal(sealCutClass(1.4, 2), 'cut', 'inside the magnet the split says cut - the step never fires there')
  assert.equal(stanceStepBlocks(1.4), null, 'the coherence holds at the magnet\'s inside edge')
})

test('the row carries the step: sweepDropRecord + the fleet row tail (the identity-extends law)', () => {
  const rec = sweepDropRecord({ sweeps: 1, seal3: 4, sealNear: 1, sealFar: 3, sealCutGap: 4, stanceStep: 2, stanceCut: 1 })
  assert.equal(rec.stanceStep, 2)
  assert.equal(rec.stanceCut, 1)
  assert.equal(sweepDropRecord({ stanceStep: 'x' }).stanceStep, 0, 'junk floors at zero - the row never carries a guess')
  assert.equal(sweepDropRecord({ stanceCut: -3 }).stanceCut, 0)
  const row = belowResidueRow([{ sweeps: 1, seal3: 4, sealNear: 1, sealFar: 3, sealCutGap: 4, stanceStep: 2, stanceCut: 1 }])
  assert.match(row, /ngap=4 step=2 stepcut=1$/, 'the step rides the row tail behind ngap - the legacy tokens keep their positions')
  assert.match(belowResidueRow([{ stanceStep: 2 }, { stanceCut: 1 }, null, undefined]), /step=2 stepcut=1$/, 'the fleet row sums the step and its conversions')
  assert.match(belowResidueRow([null, undefined, {}]), /ngap=0 step=0 stepcut=0$/, 'the all-junk row still renders the tokens (byte-true zeros)')
  assert.equal(belowResidueRow(undefined).endsWith('ngap=0 step=0 stepcut=0'), true, 'the zero-arg row carries the full tail')
})

test('the census is wired: the miner\'s step counts ride stats for the fleet row (the composition)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const dropsSrc = readFileSync(new URL('../../src/lib/drops.mjs', import.meta.url), 'utf8')
  assert.ok(minerSrc.includes('stanceStepBlocks'), 'the miner imports the behavior fence (bde0622, byte-true)')
  assert.ok(minerSrc.includes("stanceCuts++ // (v0.283.0) the row's stepcut= - the step bought THIS cut"), 'the conversion census rides the recut branch (the step\'s own dig)')
  assert.ok(minerSrc.includes('sd.stanceStep += stanceSteps'), 'the armed-walk count accumulates into the stats')
  assert.ok(minerSrc.includes('sd.stanceCut += stanceCuts'), 'the conversion count accumulates into the stats')
  assert.ok(minerSrc.includes('sealCutGap: 0, stanceStep: 0, stanceCut: 0 }'), 'the stats seed grows with the step buckets')
  assert.ok(dropsSrc.includes('stanceStep: fl(stanceStep)'), 'the record normalizes the step census (junk floors at zero)')
  assert.ok(dropsSrc.includes('stepcut=${acc.stanceCut}'), 'the row renders the conversion tail (the v0.283.0 tail-append law)')
  const recutAt = minerSrc.indexOf('const recut = ledgeCutWanted(')
  const censusAt = minerSrc.indexOf('stanceCuts++')
  assert.ok(recutAt > 0 && censusAt > recutAt, 'the census increments AFTER the re-read arms - the count is the re-read\'s conversion, never a guess')
})
