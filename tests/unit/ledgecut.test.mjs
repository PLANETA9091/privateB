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
import { ledgeCutWanted, ledgeCutRefusal, stanceStepBlocks, LEDGE_CUT_REACH, sweepDropRecord, belowResidueRow } from '../../src/lib/drops.mjs'

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

test('the whole-class fence: a transient dy refuses, the false-took dies (v0.290.0)', () => {
  // face 36455210160 read the false-took: `dug 0.8338907390617862 seal
  // cell(s)` - dyNow is a MEASURED height and the stance step had just moved
  // the bot (the feet caught mid-settle, 0.166 off the class 2). The fences
  // read only the range, the count leaked the fraction, and the dig loop
  // `for cd <= 0.83` silently dug ZERO seal cells while the census counted a
  // took that never cleared the column. The sealCutClass law (a non-integer
  // claims no target) now guards the dy: the measured height must sit ON its
  // whole class (a 1e-6 float-dust tolerance), else the cut refuses and the
  // sweep re-reads the SETTLED stance (the self-healing shape - the next
  // sweep's distXZ is inside the magnet, the cut arms without a step).
  const midSettle = 1.8338907390617862 // the mined value, verbatim
  assert.equal(ledgeCutWanted({ dy: midSettle, distXZ: 1.0, sealDepth: 2, fluidBelow: false }), null, 'the mined 1.8338 mid-settle read refuses - no fractional count can leak')
  assert.equal(ledgeCutRefusal({ dy: midSettle, distXZ: 1.0, sealDepth: 2, fluidBelow: false }), 'the dy reads out of class', 'the mirror names the same fence (the byte-true mirror law)')
  for (const dy of [0.4, 1.2, 1.5, 2.33, 2.7, 3.4, -0.2]) {
    const r = ledgeCutWanted({ dy, distXZ: 1.0, sealDepth: 3, fluidBelow: false })
    assert.ok(r === null || Number.isInteger(r), `dy ${dy}: the count is whole or the cut refuses - the dig loop can never read a fraction`)
  }
  assert.equal(ledgeCutWanted({ dy: 2 + 1e-9, distXZ: 1.0, sealDepth: 2, fluidBelow: false }), 1, 'float dust sits ON the class - the settled read converts')
  assert.equal(ledgeCutWanted({ dy: 2, distXZ: 1.0, sealDepth: 2, fluidBelow: false }), 1, 'the settled whole class is untouched (the v0.275.0 pins hold)')
  assert.equal(ledgeCutWanted({ dy: 1, distXZ: 1.0, sealDepth: 1, fluidBelow: false }), 0, 'dy 1 still shakes the support alone')
  assert.equal(ledgeCutRefusal({ dy: 1.5, distXZ: 1.0, sealDepth: 2, fluidBelow: false }), 'the dy reads out of class', 'a half-block transient is out of class, not a magnet refusal (the name stays honest)')
})

test('the row carries the cut: sweepDropRecord + the fleet row tail (the identity-extends law)', () => {
  const rec = sweepDropRecord({ sweeps: 2, seal3: 4, sealNear: 1, sealFar: 3, ledgeCut: 2 })
  assert.equal(rec.ledgeCut, 2)
  assert.equal(sweepDropRecord({ ledgeCut: 'x' }).ledgeCut, 0, 'junk floors at zero - the row never carries a guess')
  assert.equal(sweepDropRecord({ ledgeCut: -3 }).ledgeCut, 0)
  const row = belowResidueRow([{ sweeps: 1, seal3: 4, sealNear: 1, sealFar: 3, ledgeCut: 2 }])
  assert.match(row, /near=1 far=3 cut=2 nthick=0 nthin=0 ngap=0 step=0 stepcut=0 above1=0 aboveHigh=0$/, 'the cut rides the row tail - the legacy tokens keep their positions')
  assert.match(belowResidueRow([{ ledgeCut: 2 }, { ledgeCut: 1 }, null, undefined]), /cut=3 nthick=0 nthin=0 ngap=0 step=0 stepcut=0 above1=0 aboveHigh=0$/, 'the fleet row sums the cuts')
  assert.match(belowResidueRow([null, undefined, {}]), /near=0 far=0 cut=0 nthick=0 nthin=0 ngap=0 step=0 stepcut=0 above1=0 aboveHigh=0$/, 'the all-junk row still renders the tokens (byte-true zeros)')
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

// (v0.280.0) THE CUT REFUSAL NAME - the refusal form of the four-canonical-forms
// law. Face 36402553113 read nthick=3 + cut=0 with ZERO 'ledge cut' lines: the
// probe counted the near-thick candidates, the cut's fences refused them, and
// the tree could not say WHY (the probe's near bucket rides SUPPORT_DIG_REACH 2
// while the cut's own magnet cap is LEDGE_CUT_REACH 1.5 - a 1.5-2.0 stand-off
// reads 'cut' at the probe and refuses at the cut, in silence).

test('the cut refusal names its fence: each guard speaks (the mirror law)', () => {
  assert.equal(ledgeCutRefusal({ dy: 9, distXZ: 1.0, sealDepth: 3, fluidBelow: false }), 'the dy reads out of class', 'a dy outside the ledge class names the class fence')
  assert.equal(ledgeCutRefusal({ dy: NaN, distXZ: 1.0, sealDepth: 3, fluidBelow: false }), 'the dy reads out of class', 'a junk dy names the class fence - a lost read never arms a cut')
  assert.equal(ledgeCutRefusal({ dy: 3, distXZ: 1.0, sealDepth: 2, fluidBelow: false }), 'the seal floor reads unmeasured', 'the thin-seal-under-high-ledge refusal names the floor fence')
  assert.equal(ledgeCutRefusal({ dy: 2, distXZ: 1.0, sealDepth: null, fluidBelow: false }), 'the seal floor reads unmeasured', 'a junk depth names the floor fence (the junk law carried)')
  assert.equal(ledgeCutRefusal({ dy: 2, distXZ: 1.0, sealDepth: 2, fluidBelow: true }), 'the column reads wet', 'the wet cut names the dry fence')
  assert.equal(ledgeCutRefusal({ dy: 2, distXZ: 1.0, sealDepth: 2, fluidBelow: undefined }), 'the column reads wet', 'a lost fluid read refuses wet-named (true/undefined alike)')
  assert.equal(ledgeCutRefusal({ dy: 2, distXZ: 1.8, sealDepth: 2, fluidBelow: false }), 'the stand-off exceeds the magnet', 'THE FACE SHAPE: 1.8 reads cut-class at the probe (reach 2) and refuses at the cut (1.5)')
  assert.equal(ledgeCutRefusal({ dy: 2, distXZ: -0.1, sealDepth: 2, fluidBelow: false }), 'the stand-off exceeds the magnet', 'a negative distance names the reach fence (the junk law carried)')
})

test('the cut refusal is the exact mirror: refusal null iff the cut arms', () => {
  const cases = [
    { dy: 1, distXZ: 1.5, sealDepth: 1, fluidBelow: false },
    { dy: 2, distXZ: 1.5, sealDepth: 3, fluidBelow: false },
    { dy: 3, distXZ: 1.5, sealDepth: 3, fluidBelow: false },
    { dy: 2, distXZ: 1.6, sealDepth: 2, fluidBelow: false },
    { dy: 2, distXZ: 1.0, sealDepth: 1, fluidBelow: false },
    { dy: 4, distXZ: 1.0, sealDepth: 3, fluidBelow: false },
    { dy: 2, distXZ: 1.0, sealDepth: 2, fluidBelow: true },
    { dy: 2, distXZ: NaN, sealDepth: 2, fluidBelow: false }
  ]
  for (const c of cases) {
    const armed = ledgeCutWanted(c) !== null
    const refused = ledgeCutRefusal(c) !== null
    assert.notEqual(armed, refused, `mirror holds for ${JSON.stringify(c)} - exactly one of {armed, refused} is true`)
  }
  assert.equal(ledgeCutRefusal({ dy: 2, distXZ: 1.5, sealDepth: 2, fluidBelow: false }), null, 'the reach boundary dist === 1.5 ARMS the cut - the mirror reads no refusal there')
})

test('the cut refusal is wired: the miner names the silent fences (v0.280.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const dropsSrc = readFileSync(new URL('../../src/lib/drops.mjs', import.meta.url), 'utf8')
  assert.ok(dropsSrc.includes('export function ledgeCutRefusal'), 'the pure layer exports the refusal name')
  assert.ok(minerSrc.includes('ledgeCutRefusal'), 'the miner imports the refusal name')
  assert.ok(minerSrc.includes("const cutRefusal = ledgeCutRefusal({ dy: dyNow, distXZ, sealDepth: sealN, fluidBelow: strikeSupport !== null })"), 'the refusal call mirrors the cut call byte-true (the same gate reads the same probe - one read, one name, the v0.283.0 stance step shares the verdict)')
  assert.ok(minerSrc.includes("ledge cut refused - ${cutRefusal} (seal ${sealN ?? '?'}, dy ${dyNow}, dist ${distXZ.toFixed(1)})"), 'the line renders the SAME verdict the stance step gates on (no second read, no drift)')
  assert.ok(minerSrc.includes("if (cutRefusals <= 2) {"), 'the refusal line is capped like the support refusals - the sweep must not storm')
  assert.ok(minerSrc.includes("vein sweep: ledge cut refused"), 'the line rides the vein sweep band (the existing filter key - no fleet19 churn)')
})

test('the stance step: the gap band is ONE block wide (v0.283.0)', () => {
  // the field's own shape: face 36411203362's candidates sat at 1.8-2.0
  assert.equal(stanceStepBlocks(1.8), 1, 'the measured gap band reads 1 - one block re-enters the magnet')
  assert.equal(stanceStepBlocks(1.51), 1, 'a hair past the magnet still reads 1')
  assert.equal(stanceStepBlocks(2.0), 1, 'the probe\'s own bucket edge reads 1')
  assert.equal(stanceStepBlocks(2.5), 1, 'the one-block band ends at 2.5 (ceil law)')
  // the honest math beyond the probe's bucket (the far front's business)
  assert.equal(stanceStepBlocks(2.6), 2, 'past the one-block band the count grows - the wiring caps at 1')
  assert.equal(stanceStepBlocks(3.1), 2, 'the ceil law: 1.6 of gap reads 2 blocks')
  // no step where no step applies
  assert.equal(stanceStepBlocks(0), null, 'a stance at the column steps nothing')
  assert.equal(stanceStepBlocks(1.5), null, 'the reach boundary is INSIDE the magnet - the cut arms, no step')
  // junk law: a lost read steps nothing
  assert.equal(stanceStepBlocks(NaN), null, 'a junk read steps nothing')
  assert.equal(stanceStepBlocks(-0.5), null, 'a negative stand-off steps nothing')
  assert.equal(stanceStepBlocks(Infinity), null, 'an infinite stand-off steps nothing (the walk cannot cure it)')
  assert.equal(stanceStepBlocks(undefined), null, 'a missing read steps nothing')
})

test('the stance step: reach-injection coherence with the cut\'s own fence (v0.283.0)', () => {
  // the same read through both gates: with the magnet's 1.5 the step arms,
  // with the probe's wider 2.0 the cut ARMS and no step is owed - the two
  // fences must stay band-for-band coherent (the 0.281.0 law)
  assert.equal(stanceStepBlocks(1.8, LEDGE_CUT_REACH), 1, 'the default is the cut\'s own magnet')
  assert.equal(stanceStepBlocks(1.8, 2), null, 'inside a wider reach the step is null - the probe\'s bucket never owes a walk')
  // the mirror holds at the boundary: dist === reach steps nothing, just past it steps 1
  assert.equal(stanceStepBlocks(1.5, 1.5), null, 'the boundary belongs to the magnet')
  assert.equal(stanceStepBlocks(1.5 + 1e-9, 1.5), 1, 'a hair past the boundary owes exactly one block')
})

test('the stance step is wired: the miner walks the stand-off class only (v0.283.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const dropsSrc = readFileSync(new URL('../../src/lib/drops.mjs', import.meta.url), 'utf8')
  assert.ok(dropsSrc.includes('export function stanceStepBlocks'), 'the pure layer exports the step')
  assert.ok(minerSrc.includes('stanceStepBlocks'), 'the miner imports the step')
  assert.ok(minerSrc.includes("cutRefusal === 'the stand-off exceeds the magnet'"), 'the step fires ONLY on the stand-off class - the other fences no walk can cure')
  assert.ok(minerSrc.includes('stanceSteps < 1'), 'the step is capped ONE per sweep - the sweep must not orbit')
  assert.ok(minerSrc.includes('stanceStepBlocks(distXZ) === 1'), 'the wiring caps the walk at ONE block (the far front\'s business)')
  assert.ok(minerSrc.includes("ledgeCutWanted({ dy: dyNow, distXZ: dist2, sealDepth: sealN, fluidBelow: strikeSupport !== null })"), 'the re-read reuses the cut\'s own probe shape byte-true - a lost read never arms a cut')
  assert.ok(minerSrc.includes('vein sweep: stance step armed'), 'the armed form rides the vein sweep band')
  assert.ok(minerSrc.includes('vein sweep: stance step landed'), 'the result form rides the vein sweep band')
  assert.ok(minerSrc.includes('vein sweep: stance step refused - the walk contested'), 'the refusal form rides the vein sweep band')
  assert.ok(minerSrc.includes("label: 'stance step'"), 'the walk carries its own label - the rescue telemetry reads it')
})
