// (v0.369.0) THE ANCHOR DROP - the unanchored seal earns its floor.
// Face 36733939481 (face 12) starved the seal cross's LANDED leg at the class
// the canon never cured: 'anchor open, headroom solid - the seal is
// unanchored'. The walled class got its dig-around (v0.250.0); the
// unanchored class kept the legacy refusal for eight fires. The cure: the
// home column's own floor is face-adjacent to the open anchor cell (the
// bearing is single-axis by construction), so the bot drops a sealable block
// INTO the anchor cell, the column grows a floor, and the seal re-plans -
// 'buildable' rides the existing placement, the cross gets its chance.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  anchorDrop, ANCHOR_DROP_TIMEOUT_MS, sealPlan, sealCrossTarget, sealLanded
} from '../../src/lib/surface.mjs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('anchorDrop: the unanchored class with an open anchor drops', () => {
  const plan = sealPlan({ anchorBox: 'empty', headroomBox: 'empty' })
  assert.equal(plan.plan, 'unanchored')
  const d = anchorDrop({ plan, anchorBox: 'empty', anchorName: 'water' })
  assert.equal(d.drop, true)
  assert.match(d.why, /the anchor cell is open - drop a block into it/)
})

test('anchorDrop: the full face-12 shape - blind anchor rides (air and water both take the placement)', () => {
  const plan = sealPlan({ anchorBox: 'empty', headroomBox: 'block' })
  assert.equal(plan.plan, 'unanchored')
  assert.equal(anchorDrop({ plan, anchorBox: 'empty', anchorName: null }).drop, true,
    'a blind anchor name never invents a veto - the placement needs a face, not a name')
  assert.equal(anchorDrop({ plan, anchorBox: 'empty', anchorName: 'water' }).drop, true,
    'the fluid anchor is the flooded step\'s own shape - the drop rides')
})

test('anchorDrop: not the unanchored class - the other plans keep their paths', () => {
  const buildable = sealPlan({ anchorBox: 'block', headroomBox: 'empty' })
  assert.equal(anchorDrop({ plan: buildable, anchorBox: 'empty', anchorName: 'water' }).drop, false,
    'buildable is the crossing, not the drop')
  const walled = sealPlan({ anchorBox: 'block', headroomBox: 'block' })
  assert.equal(anchorDrop({ plan: walled, anchorBox: 'block', anchorName: 'stone' }).drop, false,
    'walled rides the v0.250.0 dig-around, never the drop')
  assert.equal(anchorDrop({ plan: null, anchorBox: 'empty', anchorName: null }).drop, false,
    'a junk plan is not the class')
  const unknown = sealPlan({})
  assert.equal(anchorDrop({ plan: unknown, anchorBox: null, anchorName: null }).drop, false,
    'the unknown verdict judges nothing')
})

test('anchorDrop: the box lie class - a solid box contradicts the plan', () => {
  const plan = sealPlan({ anchorBox: 'empty', headroomBox: 'empty' })
  const d = anchorDrop({ plan, anchorBox: 'block', anchorName: 'water' })
  assert.equal(d.drop, false)
  assert.match(d.why, /the anchor box speaks solid - the plan lied/)
})

test('anchorDrop: the second eye - a solid name contradicts the open box', () => {
  const plan = sealPlan({ anchorBox: 'empty', headroomBox: 'empty' })
  const d = anchorDrop({ plan, anchorBox: 'empty', anchorName: 'stone' })
  assert.equal(d.drop, false)
  assert.match(d.why, /the anchor name reads solid - the second eye vetoes/)
})

test('anchorDrop: the junk battery (the body-guard law)', () => {
  assert.equal(anchorDrop().drop, false, 'a bare call never drops')
  assert.equal(anchorDrop(null).drop, false, 'a junk call never drops')
  assert.equal(anchorDrop({ plan: { plan: 'unanchored' }, anchorBox: NaN, anchorName: 42 }).drop, true,
    'junk eyes read blind - the plan class owns the verdict, junk names are silent')
  assert.equal(anchorDrop({ plan: 'unanchored', anchorBox: 'empty', anchorName: null }).drop, false,
    'a string plan is not the verdict object')
})

test('the constants pin: the drop is one capped placement (the PILLAR lesson)', () => {
  assert.equal(ANCHOR_DROP_TIMEOUT_MS, 3000, 'the SEAL_PLACE law\'s own cap')
})

test('the geometry pin: the drop cell IS the anchor cell (one shape, one law)', () => {
  const feet = sealCrossTarget({ feetWet: true })
  assert.equal(feet.anchorDy, -1, 'feetWet: the anchor is the floor below the step-1 cell')
  const head = sealCrossTarget({ feetWet: false })
  assert.equal(head.anchorDy, 0, 'head-level: the anchor is the bearing feet cell itself')
})

test('the wiring: the drop rides the unanchored class before the buildable gate', () => {
  // the five canonical line forms ride the final-climb family
  assert.match(fleetSrc, /shift anchor drop armed: \$\{dp\.why\}/, 'the armed form names the plan\'s why')
  assert.match(fleetSrc, /shift anchor drop LANDED: the column grew a floor - the seal re-plans/, 'the landed form names the new floor')
  assert.match(fleetSrc, /shift anchor drop refused: .* - the gate keeps the cell/, 'the refusal form names the fall-through')
  assert.match(fleetSrc, /shift anchor drop swallowed: \$\{e && e\.message \? e\.message : 'unknown throw'\}/, 'the swallow speaks')
  assert.match(fleetSrc, /shift pre-seal plan \(re-planned\): anchor/, 'the re-plan speaks like the plan (the account of record)')
  // the gates: the drop sits behind the unanchored class, the fresh reads re-plan
  assert.match(fleetSrc, /if \(sPlan\.plan === 'unanchored'\) \{/, 'the drop gates ON the unanchored class')
  assert.match(fleetSrc, /anchorDrop\(\{ plan: sPlan, anchorName: anchorB\?\.name \?\? null, anchorBox: anchorB\?\.boundingBox \?\? null \}\)/, 'the plan reads the FRESH anchor cells (the two-eye law)')
  assert.match(fleetSrc, /sealLanded\(\{ afterName: dAfter\?\.name \?\? null, afterBox: dAfter\?\.boundingBox \?\? null \}\)/, 'the verify is the honest sealLanded read (never guess)')
  assert.match(fleetSrc, /placeBlock\(dropRef, new Vec3\(shiftPlan\.bearing\.x, 0, shiftPlan\.bearing\.z\)\), ANCHOR_DROP_TIMEOUT_MS/, 'the drop clicks the home floor\'s bearing face, capped')
  // the order: the drop precedes the buildable gate, the re-plan feeds it
  const dropIdx = fleetSrc.indexOf('shift anchor drop armed')
  const buildableIdx = fleetSrc.indexOf("if (sPlan.plan === 'buildable') {", dropIdx)
  assert.ok(dropIdx > 0 && buildableIdx > dropIdx, 'the drop rides before the buildable gate')
  const replanIdx = fleetSrc.indexOf('shift pre-seal plan (re-planned)')
  assert.ok(replanIdx > dropIdx && replanIdx < buildableIdx, 'the re-plan lands between them - the buildable gate reads the fresh verdict')
  // the mutable reads: the re-plan needs let, not const
  assert.match(fleetSrc, /let anchorB = feetWet \? miner\.bot\.blockAt\(sCell\.offset\(0, -1, 0\)\) : sFeet/, 'the anchor read is mutable (the re-plan refreshes it)')
  assert.match(fleetSrc, /let sPlan = sealPlan\(/, 'the plan read is mutable (the re-plan replaces it)')
})
