// (v0.341.0) THE SHIFT PRE-SEAL - the cure ported from the proven lane.
//
// The wet-shift stall's anatomy across two faces: face 36679076372 (three
// attempts, 286s/267s/168s slices, all tunnel done=0) and face 36686530635
// (the v0.339.0 zeroWhy's first leg: 'tunnel done=0 - the gate: fluid
// ahead') - the v0.242.0 fluid law stops the mover's FIRST cell every time
// while the slice burns. The cure already existed one lane over: the
// mining tunnel's seal-and-cross (v0.244-0.250.0) placed cobblestone into
// the step-1 fluid and the steered line resumed (face 36686530635: 'seal-
// and-cross CROSSED: cobblestone sealed the step-1 fluid'). v0.341.0 aims
// the same machinery at the shift's first cell, BEFORE the tunnel call:
// fluid lock -> census (water + stock) -> plan (anchor + headroom) ->
// place (two rounds, the shelter's pattern) -> verify (sealLanded). Every
// refusal falls through byte for byte - the honest zeroWhy stall line
// stays the account of record. Lean first leg: one cell, no dig-around.

import { test } from 'node:test'
import assert from 'node:assert/strict'

test('the wiring pins: the pre-seal sits between the shift announce and the tunnel attempt', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the block lives in the wet-shift branch, after the announce line
  const announceIdx = src.indexOf("final climb: wet shift - ${shiftPlan.why}")
  assert.ok(announceIdx > 0, 'the shift announce line found')
  const presealIdx = src.indexOf('THE SHIFT PRE-SEAL')
  assert.ok(presealIdx > announceIdx, 'the pre-seal follows the announce')
  // and BEFORE the tunnel attempt it cures (feet0 + the tunnel call come after)
  const feet0Idx = src.indexOf('const feet0 = miner.bot.entity.position.floored()', presealIdx)
  assert.ok(feet0Idx > presealIdx, 'feet0 (the tunnel attempt\'s stance) follows the pre-seal')
  const tunnelIdx = src.indexOf('await miner.tunnel({ x: shiftPlan.bearing.x', presealIdx)
  assert.ok(tunnelIdx > feet0Idx, 'the shift tunnel attempt follows the pre-seal')
  // the pinned stall line rides AFTER the tunnel attempt, byte for byte
  const stallIdx = src.indexOf('wet shift stalled (tunnel done=', tunnelIdx)
  assert.ok(stallIdx > tunnelIdx, 'the honest zeroWhy stall line stays the account of record')
})

test('the machinery pins: the proven seal chain is consulted in the source order', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const base = src.indexOf('THE SHIFT PRE-SEAL')
  // the same eyes the v0.242.0 law gave the mining lane (box first, name second)
  const lockIdx = src.indexOf('steerFluidLock({ feetBox: sFeet?.boundingBox ?? null, headBox: sHead?.boundingBox ?? null', base)
  assert.ok(lockIdx > base, 'the fluid lock reads the bearing cell with the two-eye law')
  const censusIdx = src.indexOf('const census = sealCensus({ fluidNames: [sFeet?.name ?? null, sHead?.name ?? null]', base)
  assert.ok(censusIdx > lockIdx, 'the census follows the lock (water + stock before geometry)')
  const planIdx = src.indexOf('const sPlan = sealPlan({ anchorName: anchorB?.name ?? null', base)
  assert.ok(planIdx > censusIdx, 'the geometry follows the census (anchor + headroom)')
  const placeIdx = src.indexOf("withTimeout(miner.bot.placeBlock(anchor, new Vec3(tgt.face.x, tgt.face.y, tgt.face.z)), SEAL_PLACE_TIMEOUT_MS, 'shift pre-seal place')", base)
  assert.ok(placeIdx > planIdx, 'the placement rides the 3s fence (the PILLAR lesson)')
  const verifyIdx = src.indexOf('sealLanded({ afterName: after?.name ?? null, afterBox: after?.boundingBox ?? null })', base)
  assert.ok(verifyIdx > placeIdx, 'the verify (sealLanded) follows the placement')
  // the two-round pattern (the entity-occupied-cell rejection the shelter measured)
  assert.ok(src.includes('for (let round = 0; round < 2 && !sealed; round++)', base), 'two rounds with the pause between')
})

test('the fall-through pins: every refusal is named and the gates close the arms', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const base = src.indexOf('THE SHIFT PRE-SEAL')
  // the census line names the arm verdict (ARMED vs bare) so the next mine can count
  assert.ok(src.includes('shift pre-seal census:', base), 'the census line names itself')
  assert.ok(src.includes("the pre-seal is ${census.fluid === 'water' && census.sealable ? 'ARMED' : 'bare'}"), 'the arm verdict rides the census line')
  // the plan line names the geometry verdict
  assert.ok(src.includes('shift pre-seal plan:', base), 'the plan line names itself')
  // the landing + the refusals all speak (the decode reads the whys verbatim)
  assert.ok(src.includes('shift pre-seal LANDED:', base), 'the landing line names itself')
  assert.ok(src.includes('shift pre-seal refused:', base), 'the refusal line names itself')
  assert.ok(src.includes("'the seal did not land (2 rounds)'"), 'the no-land refusal says why')
  // the junk-stance guard: a throw never kills the shift attempt
  assert.ok(src.includes('a junk stance never kills the shift'), 'the try wrapper guards the stance')
  // lean first leg: only the buildable class places - the walled class keeps
  // the legacy fall-through (the dig-around waits for the field's pricing)
  const buildableIdx = src.indexOf("if (sPlan.plan === 'buildable') {", base)
  assert.ok(buildableIdx > base, 'only the buildable class places')
  const walledDigIdx = src.indexOf('miner.bot.dig(headroomB)', base)
  const nextTunnelIdx = src.indexOf('await miner.tunnel({ x: shiftPlan.bearing.x', base)
  assert.ok(walledDigIdx === -1 || walledDigIdx > nextTunnelIdx, 'no dig-around in the pre-seal (the lean first leg)')
})
