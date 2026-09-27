// Tests for the trident standoff ring (v0.234.0).
//
// MEASURED (run36289053811, the v0.233.0 era's fleet on the 0.232.0 tree,
// COMPLETED SUCCESS, alive 19/19, banked=744): the impale gallery x5 made the
// trident drowned the fleet's #1 killer again, and THREE of the five died
// MID-RING - F2 'ring incomplete 4/8' -> dead @7.8, F8 'ring incomplete 3/8'
// -> dead @9.1, F14 'ring not buildable [oo oo -o oo]' -> dead @9.3 - because
// the v0.140.0 ranged-mode selection reads RANGED_HOSTILES and the v0.215.0
// hybrid deliberately keeps the drowned OUT of that set (the FIGHT verdict's
// swimmer contracts own the water bands). The trident shooter at standoff is
// a LOS killer exactly like the skeleton: the v0.140.0 argument applies
// verbatim, two closed cells on the threat side break the throw's line of
// sight, and the 2-cell gate builds inside the window the 8-cell build burns.
// The cure rides a dedicated predicate (combat.mjs ringRangedClass): the
// drowned joins the RANGED ring mode ONLY in the standoff band
// (dist > ENGAGE_RANGE), the close band keeps the full ring (the swimmer
// walks in through a gap), and the fight verdict stays byte for byte (the
// drowned is still NOT in RANGED_HOSTILES - threatVerdict vs drowned@10 at
// hp 20 stays 'ignore', the v0.215.0 measured contract).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { ringRangedClass, ENGAGE_RANGE, RANGED_HOSTILES, threatVerdict } from '../../src/lib/combat.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('THE GALLERY FACES: the standoff shooter reads the ranged ring mode (the three mid-ring deaths were the full-mode burn)', () => {
  // the exact faces the decode mined: F2@7.8 (incomplete 4/8 -> dead),
  // F8@9.1 (incomplete 3/8 -> dead), F14@9.3 (not buildable -> dead)
  assert.equal(ringRangedClass({ name: 'drowned', dist: 7.8 }), true, 'F2@7.8: the shooter reads the arrow-wall mode')
  assert.equal(ringRangedClass({ name: 'drowned', dist: 9.1 }), true, 'F8@9.1: the shooter reads the arrow-wall mode')
  assert.equal(ringRangedClass({ name: 'drowned', dist: 9.3 }), true, 'F14@9.3: the shooter reads the arrow-wall mode')
  assert.equal(ringRangedClass({ name: 'drowned', dist: 13.3 }), true, 'F13@13.3: a standoff kill - the mode must hold at range too')
})

test('THE CLOSE BAND KEEPS THE FULL RING: the swimmer walks in through a gap (the v0.174.0 drift-wait terrain, the melee-finish band)', () => {
  assert.equal(ringRangedClass({ name: 'drowned', dist: 3.0 }), false, 'a close swimmer is a walker - the full cage gates it')
  assert.equal(ringRangedClass({ name: 'drowned', dist: 0.2 }), false, 'the F5 close-contact shape stays the full ring')
  assert.equal(ringRangedClass({ name: 'drowned', dist: ENGAGE_RANGE }), false, 'the edge is strict: AT ENGAGE_RANGE the melee band owns it')
  assert.equal(ringRangedClass({ name: 'drowned', dist: ENGAGE_RANGE + 0.1 }), true, 'one block past the melee band the shooter reads ranged')
})

test('JUNK-SAFE: a guess never reclassifies the mode (junk dist reads the full ring, junk name reads false)', () => {
  assert.equal(ringRangedClass({ name: 'drowned', dist: Infinity }), false, 'an unreadable distance keeps the legacy full mode')
  assert.equal(ringRangedClass({ name: 'drowned', dist: NaN }), false, 'NaN distance keeps the legacy full mode')
  assert.equal(ringRangedClass({ name: 'drowned' }), false, 'a missing distance keeps the legacy full mode')
  assert.equal(ringRangedClass({ name: null, dist: 9.0 }), false, 'a null name reads false')
  assert.equal(ringRangedClass({ name: '', dist: 9.0 }), false, 'an empty name reads false')
  assert.equal(ringRangedClass({ name: 42, dist: 9.0 }), false, 'a junk name reads false')
  assert.equal(ringRangedClass({}), false, 'a bare call reads false')
})

test('THE v0.140.0 CLASS BYTE FOR BYTE: the skeleton family keeps its arrow wall, the witch keeps her melee contract', () => {
  assert.equal(ringRangedClass({ name: 'skeleton', dist: 4.3 }), true, 'skeleton: the run554 arrow-wall class stands')
  assert.equal(ringRangedClass({ name: 'stray', dist: 11.0 }), true, 'stray: RANGED_HOSTILES reads ranged')
  assert.equal(ringRangedClass({ name: 'bogged', dist: 2.0 }), true, 'bogged: RANGED_HOSTILES reads ranged (mode is dist-free for the set)')
  assert.equal(ringRangedClass({ name: 'witch', dist: 9.0 }), false, 'the witch is excluded FIRST (her v0.115.0 splash band needs the melee)')
})

test('THE MELEE WALKERS KEEP THE FULL RING: zombie/spider/enderman never read ranged, the all-4-sides gate stays their door law', () => {
  assert.equal(ringRangedClass({ name: 'zombie', dist: 7.8 }), false, 'a zombie at standoff is still a walker')
  assert.equal(ringRangedClass({ name: 'spider', dist: 9.0 }), false, 'a spider is a walker')
  assert.equal(ringRangedClass({ name: 'enderman', dist: 9.0 }), false, 'an enderman is a walker')
})

test('THE FIGHT VERDICT STAYS BYTE FOR BYTE: the drowned is still NOT in RANGED_HOSTILES (the v0.215.0 hybrid is untouched)', () => {
  assert.equal(RANGED_HOSTILES.has('drowned'), false, 'the verdict set never grows the drowned (the swimmer contracts own the water bands)')
  assert.equal(threatVerdict({ name: 'drowned', dist: 7.8, hp: 20, dark: true, sheltered: false }), 'ignore', 'the v0.215.0 measured contract: vs drowned@7.8 at hp 20 the verdict stays ignore')
  assert.equal(threatVerdict({ name: 'drowned', dist: 7.8, hp: 13, dark: true, sheltered: false }), 'flee', 'the trident band lens keeps its wounded flee at the standoff')
  assert.equal(threatVerdict({ name: 'drowned', dist: 3.0, hp: 20, dark: true, sheltered: false }), 'fight', 'the melee-finish band keeps its fight answer')
})

test('REGRESSION PIN: the ring mode reads the dedicated predicate at the tryRingShelter site (the run195 dead-wire class - only the call site proves it)', () => {
  assert.match(minerSrc, /ringRangedClass, OPEN_FIELD_FLEE_HP \} from '\.\.\/lib\/combat\.mjs'/, 'the miner imports ringRangedClass from the combat layer')
  const call = minerSrc.match(/const ranged = ringRangedClass\(\{ name: threat\.name, dist: threat\.dist \}\)/)
  assert.ok(call, 'the tryRingShelter mode selection carries the predicate with the LIVE threat name AND distance')
  assert.ok(!minerSrc.match(/const ranged = RANGED_HOSTILES\.has\(threat\.name\) && threat\.name !== 'witch'/), 'the old full-set selection is GONE from the ring site (a predicate defined but not called is the dead-wire class)')
})
