// v0.259.0 THE COVER ANCHOR - the lip dig-down's probe anchor cure, the
// structural starvation the v0.206 instrument predicted and the field
// confirmed. THE RECORD: run68's ledger row carries 'failed=92 (below x82,
// plane x10) lipDig=0' - the below family (89% of the drop-walk failures,
// the exact class the v0.187 dig-down exists to close) starved with the cure
// armed but never firing. THE ANATOMY (v0.206's own words): the probes
// anchored at the FEET of a standing bot - feet-1 is always solid under a
// standable cell, so dropAheadBelow(feet) reads air 0 and 'sealed floor'
// refused EVERY arrival, tautologically. THE CURE: the cover read moves
// BEFORE the gate and both probes anchor at the COVER cell (feet.offset(0,
// -1, 0) - the block the dig would open, which is dropAheadBelow's own
// contract: 'the cell ABOUT TO BE dug'). Every fence value is UNTOUCHED -
// LIP_DIG_MAX_AIR 2, the dry guard, the dy family, the deep fence, the pure
// lib byte for byte. Junk discipline holds: an unreadable, non-solid or
// fluid cover leaves airBelow null -> the gate refuses, and the refusal line
// names the cover class instead of a fake geometry.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { lipDigWanted, lipDigRefusal, LIP_DIG_MAX_AIR, DROP_GOAL_BELOW, DROP_GOAL_BELOW_DY, DROP_GOAL_DEEP_DY } from '../../src/lib/drops.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const minerSrc = readFileSync(join(here, '../../src/bots/miner.mjs'), 'utf8')

test('v0.259.0 wiring: the probes anchor at the COVER cell - the feet anchor is gone', () => {
  assert.match(minerSrc, /const coverCell = feet\.offset\(0, -1, 0\)/, 'the cover cell is the anchor (the block the dig would open)')
  assert.ok(!/dropAheadBelow\(feet, \{ depth: 3 \}\)/.test(minerSrc), 'the tautological feet anchor is REMOVED - a standing bot always read solid at feet-1')
  assert.ok(!/fluidStrikeBelow\(feet, \{ depth: 3 \}\)/.test(minerSrc), 'the wet guard re-anchors too - the column opened is under the COVER')
  assert.match(minerSrc, /const airBelow = coverSolid \? dropAheadBelow\(coverCell, \{ depth: 3 \}\) : null/, 'the fall probe reads the hole under the cover, null when the cover cannot be read')
  assert.match(minerSrc, /const strike = coverSolid \? fluidStrikeBelow\(coverCell, \{ depth: 3 \}\) : null/, 'the wet probe reads the same honest column')
})

test('v0.259.0 wiring: the cover read moves BEFORE the gate - the probes derive from it', () => {
  const coverIdx = minerSrc.indexOf('const coverCell = feet.offset(0, -1, 0)')
  assert.ok(coverIdx > -1, 'the cover anchor exists')
  const solidIdx = minerSrc.indexOf("const coverSolid = !!(cover && cover.boundingBox === 'block' && !SHAFT_FLUID_NAMES.has(cover.name))", coverIdx)
  assert.ok(solidIdx > coverIdx, 'the solidity read follows the blockAt - one read, three consumers')
  const gateIdx = minerSrc.indexOf('if (lipDigWanted(lipParams))', solidIdx)
  assert.ok(gateIdx > solidIdx, 'the gate consumes the cover-derived probes')
  const digIdx = minerSrc.indexOf('await bot.fastDig(cover)', gateIdx)
  assert.ok(digIdx > gateIdx && digIdx - gateIdx < 200, 'the dig uses the SAME cover the probes measured - no re-read drift')
})

test('v0.259.0 wiring: the refusal names the cover classes BEFORE the legacy geometry classes', () => {
  const whyIdx = minerSrc.indexOf("const why = !cover ? 'no cover read'")
  assert.ok(whyIdx > -1, 'the composed refusal exists')
  const airIdx = minerSrc.indexOf("'the cover reads air'", whyIdx)
  const fluidIdx = minerSrc.indexOf("'the cover reads fluid'", whyIdx)
  const legacyIdx = minerSrc.indexOf(': lipDigRefusal(lipParams)', whyIdx)
  assert.ok(airIdx > whyIdx && fluidIdx > airIdx && legacyIdx > fluidIdx, 'the order: no cover read -> reads air -> reads fluid -> the legacy lipDigRefusal classes')
  assert.ok(!/const why = lipDigRefusal\(lipParams\)\n/.test(minerSrc.slice(whyIdx - 50, whyIdx)), 'the bare legacy call is gone - a solid cover reaches lipDigRefusal, everything else names its cover class')
})

test('v0.259.0 fences: the pure lib is UNTOUCHED - every fence value byte for byte', () => {
  assert.equal(LIP_DIG_MAX_AIR, 2, 'the fall the dig may buy stays 1..2')
  assert.equal(DROP_GOAL_BELOW_DY, -0.5, 'the plane fence stays (the v0.191.0 edge)')
  assert.equal(DROP_GOAL_DEEP_DY, -2, 'the deep fence stays (the v0.182.0 sphere limit)')
  // The cured chain: a converged BELOW-class lip arrival with a measured dry
  // 1-2 hole under the cover ARMS - the exact chain the old anchor never let
  // reach the gate.
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: -1.5 }), true)
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 2, fluidBelow: false, dy: -0.7 }), true, 'the fence-edge class (the v0.191.0 one-below cell) arms too')
  // The honest refusals the anchor change EXPOSES (no longer tautological):
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 0, fluidBelow: false, dy: -1.5 }), false, 'a genuinely sealed hole under the cover refuses - the class name finally means the geometry')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 3, fluidBelow: false, dy: -1.5 }), false, 'a 3+ fall refuses (the v0.86.0 blind-dig fence)')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: true, dy: -1.5 }), false, 'a wet column refuses')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: null, fluidBelow: false, dy: -1.5 }), false, 'an unreadable cover (airBelow null) refuses - a missing read never arms a dig')
})

test('v0.259.0 refusals: the legacy classes keep their meanings for a solid cover', () => {
  assert.equal(lipDigRefusal({ range: DROP_GOAL_BELOW, airBelow: 0, fluidBelow: false, dy: -1.5 }), 'sealed floor')
  assert.equal(lipDigRefusal({ range: DROP_GOAL_BELOW, airBelow: 3, fluidBelow: false, dy: -1.5 }), 'the fall reads too deep')
  assert.equal(lipDigRefusal({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: true, dy: -1.5 }), 'wet column')
  assert.equal(lipDigRefusal({ range: DROP_GOAL_BELOW, airBelow: null, fluidBelow: false, dy: -1.5 }), 'unmeasured air')
  assert.equal(lipDigRefusal({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: -1.5 }), null, 'a diggable case has no refusal')
})

test('v0.259.0 contract: dropAheadBelow reads BELOW the passed cell - the reason the cover is the honest anchor', () => {
  // The probe's own doc: 'fromPos (which is ABOUT TO BE dug)'. The scan starts
  // at fromPos.y - 1 - so the caller must pass the cell it intends to OPEN.
  assert.match(minerSrc, /function dropAheadBelow \(fromPos, \{ depth = 5 \} = \{\}\) \{[\s\S]*?for \(let dy = 1; dy <= depth; dy\+\+\) \{[\s\S]*?new Vec3\(fromPos\.x, fromPos\.y - dy, fromPos\.z\)/, 'the scan starts one BELOW the anchor - anchoring it at feet-1 (the cover) reads the hole the dig opens')
})

test('v0.259.0 instruments: the honest lines ride the vein sweep key - the chain and the residue both stay visible', () => {
  assert.match(minerSrc, /vein sweep: \$\{lipDigs\} lip dig-down\(s\) - the range-2 arrival left the drop outside the magnet, the last mile dug/, 'the fired-dig line stays whole')
  assert.match(minerSrc, /vein sweep: lip dig refused - \$\{why\} \(air \$\{airBelow\}, dy \$\{dyLip\.toFixed\(1\)\}\)/, 'the refusal line keeps its shape - the class vocabulary extends in place')
  assert.match(minerSrc, /if \(lipRefusals <= 2\)/, 'the refusal log stays bounded')
})
