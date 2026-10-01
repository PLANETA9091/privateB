// (v0.426.0) THE HOUND-PRESENCE LENS - unit pins (the shooter-census v0.390.0
// test shape). Every anatomy constant is VERBATIM from the held artifacts:
// face 27 (36870593766, /home/z/face27/) for the fight/flee/shelter forms the
// legacy census never counted, run68 + run84a for the shore-flee reason
// suffixes, statcarry's four-canonical-forms comments for the kill contexts,
// face 26 (36864564525) for the honest-zero baseline (a drowned-mob-free face
// reads zero, not null) and for the drown-context line that is NOT the hound.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { houndCensus } from '../../src/lib/houndcensus.mjs'

// face-27 verbatims (the forms the v0.371.0 rows never read)
const FIGHT = 'F9 [F9] combat: fighting drowned (dist 4.1, hp 20.0, 1 nearby, proximity)'
const FIGHT_2 = 'F14 [F14] combat: fighting drowned (dist 4.8, hp 20.0, 1 nearby, proximity)'
const FIGHT_END_WON = 'F9 [F9] combat: fight ended vs drowned (mob down, hp 20.0 -> 12.5, swings 6, weapon wooden_sword, 6 rounds)'
const FIGHT_END_WON_2 = 'F14 [F14] combat: fight ended vs drowned (mob down, hp 20.0 -> 15.0, swings 5, weapon wooden_sword, 5 rounds)'
const FLEE_DRY = 'F10 [F10] combat: fleeing drowned (dist 4.9, hp 20.0, 0 nearby, proximity)'
const SHELTER_TRY = 'F10 [F10] combat: shelter try vs drowned (dist 4.9, proximity)'
// run68 / run84a verbatims (the shore-flee suffixes + the episode detail)
const FLEE_SHORE_PLAIN = 'F12 [F12] combat: flee toward shore (3,2 step 1) vs drowned (proximity)'
const FLEE_SHORE_SENTRY = 'F15 [F15] combat: flee toward shore (-6,11 step 1) vs drowned (sentry)'
const FLEE_SHORE_REVERDICT = 'F9 [F9] combat: flee toward shore (2,0 step 1) vs drowned (proximity re-verdict)'
const SHORE_NO_CELL = 'F10 [F10] combat: aquatic flee: no verified shore cell - bearing the nearest shore (2,-3) vs drowned (proximity)'
const SHELTER_RING_TRY = 'F9 [F9] combat: shelter ring try vs drowned (dist 9.8, sentry)'
const SHELTERING = 'F9 [F9] combat: sheltering from drowned (ring 8, proximity re-verdict)'
const FIGHT_END_DEADLINE = 'F19 [F19] combat: fight ended vs drowned (deadline, hp 20.0 -> 18.0, swings 4, weapon wooden_sword, 4 rounds)'
const VERDICT_FLIP = 'F12 [F12] combat: verdict flipped to flee vs drowned (hp 7.0)'
const FLEE_HOP = 'F1 [F1] combat: flee bearing rotated 90deg (water/hazard vetoes the yard target) vs drowned (proximity)'
const FLEE_HOP_SKELETON = 'F7 [F7] combat: flee ladder 90deg -> 270deg (the threat reads the away rotation) vs skeleton (proximity)'
// statcarry's four-canonical-forms shapes (the kill contexts)
const KILL_DRY = 'F7 [F7] death: drowned-kill context (dry-shore, y 64, feet grass_block, head air, water none)'
const KILL_WATER = 'F7 [F7] death: drowned-kill context (in-water, y 62, feet water, head water, water none)'
const KILL_WATERLINE = 'F7 [F7] death: drowned-kill context (waterline, y 64, feet sand, head sand, water e/w)'
// face-26 verbatim (the water did it - NOT the hound)
const DROWN_CTX = 'F14 [F14] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg fuel commons walk @-137,386, wet unknown)'
// the hatch (the shooter-census's own shelter-skip shape, drowned flavor)
const HATCH_SKIP = 'F15 [F15] combat: shelter skip (open field: ring not buildable [-o -o -o -o], no arrow wall either vs drowned@6.9)'

test('face-27 accumulation hand-count: the hound the legacy rows never saw', () => {
  const c = houndCensus([
    SHELTER_TRY, FLEE_DRY, FIGHT, FIGHT_END_WON, FIGHT_2, FIGHT_END_WON_2
  ])
  assert.equal(c.presence, 4)
  assert.equal(c.fight, 2)
  assert.equal(c.fleeDry, 1)
  assert.equal(c.shelter, 1)
  assert.equal(c.fightsWon, 2)
  assert.equal(c.fightEndsOther, 0)
  assert.deepEqual(c.presenceByBot, { F10: 2, F9: 1, F14: 1 })
  assert.deepEqual(c.fightsWonByBot, { F9: 1, F14: 1 })
  // the fleet WON this face's hound episodes - the kills side stays zero
  assert.equal(c.kills, 0)
  assert.equal(c.drownContexts, 0)
})

test('fight-end mob-down is an outcome, never a presence answer moment', () => {
  const c = houndCensus([FIGHT_END_WON])
  assert.equal(c.presence, 0)
  assert.equal(c.fightsWon, 1)
  assert.deepEqual(c.fightsWonByBot, { F9: 1 })
})

test('fight-end other exits (deadline) split away from the wins', () => {
  const c = houndCensus([FIGHT_END_DEADLINE, FIGHT_END_WON])
  assert.equal(c.fightsWon, 1)
  assert.equal(c.fightEndsOther, 1)
  assert.equal(c.presence, 0)
})

test('flee shore plain matches the v0.371.0 row byte for byte', () => {
  const c = houndCensus([FLEE_SHORE_PLAIN])
  assert.equal(c.fleeShore, 1)
  assert.equal(c.fleeShorePlain, 1)
  assert.equal(c.presence, 1)
})

test('flee shore sentry suffix: the legacy blind share names itself', () => {
  const c = houndCensus([FLEE_SHORE_SENTRY])
  assert.equal(c.fleeShore, 1)
  assert.equal(c.fleeShorePlain, 0)
  assert.equal(c.presence, 1)
})

test('re-verdict suffix is cross-cutting: shore flee + sheltering both carry it', () => {
  const c = houndCensus([FLEE_SHORE_REVERDICT, SHELTERING])
  assert.equal(c.fleeShore, 1)
  assert.equal(c.shelter, 1)
  assert.equal(c.reVerdicts, 2)
  assert.equal(c.presence, 2)
})

test('cornered wet flee (no verified shore cell) counts as presence', () => {
  const c = houndCensus([SHORE_NO_CELL])
  assert.equal(c.shoreNoCell, 1)
  assert.equal(c.presence, 1)
})

test('shelter family: try, ring try and sheltering all answer the hound', () => {
  const c = houndCensus([SHELTER_TRY, SHELTER_RING_TRY, SHELTERING])
  assert.equal(c.shelter, 3)
  assert.equal(c.presence, 3)
})

test('episode detail: verdict flips and flee hops stay out of presence', () => {
  const c = houndCensus([VERDICT_FLIP, FLEE_HOP])
  assert.equal(c.verdictFlips, 1)
  assert.equal(c.fleeHops, 1)
  assert.equal(c.presence, 0)
})

test('flee hops vs OTHER mobs never count (the hound lens is drowned-only)', () => {
  const c = houndCensus([FLEE_HOP_SKELETON])
  assert.equal(c.fleeHops, 0)
  assert.equal(c.presence, 0)
  assert.equal(c.other, 0)
})

test('kill contexts: the three arena classes split, per-bot rides', () => {
  const c = houndCensus([KILL_DRY, KILL_WATER, KILL_WATERLINE, KILL_DRY])
  assert.equal(c.kills, 4)
  assert.equal(c.killsDryShore, 2)
  assert.equal(c.killsInWater, 1)
  assert.equal(c.killsWaterline, 1)
  assert.deepEqual(c.killsByBot, { F7: 4 })
  assert.equal(c.presence, 0)
})

test('drown context is the water, not the hound (face 26 F14 verbatim)', () => {
  const c = houndCensus([DROWN_CTX])
  assert.equal(c.drownContexts, 1)
  assert.equal(c.kills, 0)
  assert.equal(c.presence, 0)
})

test('the escape hatch: unknown drowned forms land visible and sampled', () => {
  const c = houndCensus([HATCH_SKIP, HATCH_SKIP, HATCH_SKIP, HATCH_SKIP, HATCH_SKIP, HATCH_SKIP, HATCH_SKIP])
  assert.equal(c.other, 7)
  assert.equal(c.presence, 7)
  assert.equal(c.otherSamples.length, 5)
  assert.equal(c.otherSamples[0], HATCH_SKIP)
})

test('honest zero: face 26 (no drowned-mob encounters) reads all zeros', () => {
  const c = houndCensus([DROWN_CTX, 'F4 [F4] combat: fleeing skeleton (dist 4.0, hp 13.8, 1 nearby, proximity)', 'F9 [F9] saw the yard anchor'])
  assert.equal(c.presence, 0)
  assert.equal(c.fight, 0)
  assert.equal(c.fleeDry, 0)
  assert.equal(c.shelter, 0)
  assert.equal(c.fleeShore, 0)
  assert.equal(c.fleeShorePlain, 0)
  assert.equal(c.shoreNoCell, 0)
  assert.equal(c.other, 0)
  assert.equal(c.fightsWon, 0)
  assert.equal(c.fleeHops, 0)
  assert.equal(c.verdictFlips, 0)
  assert.equal(c.reVerdicts, 0)
  assert.equal(c.kills, 0)
  assert.deepEqual(c.presenceByBot, {})
  assert.deepEqual(c.otherSamples, [])
})

test('empty and junk-safe inputs: non-strings judge nothing, blob splits', () => {
  const empty = houndCensus([])
  assert.equal(empty.presence, 0)
  const junk = houndCensus([null, 42, undefined, FIGHT, { line: FIGHT }])
  assert.equal(junk.presence, 1)
  const blob = houndCensus([FLEE_DRY, FIGHT].join('\n'))
  assert.equal(blob.presence, 2)
})

test('the pollution class stays out: prose and single-tag lines never match', () => {
  const c = houndCensus([
    'a death is a cost the deficit cannot repay (2 live, fleet-wide)',
    'F9 saw the mirror (sight died 35.8s before death) vs drowned prose',
    'water: rescue released (surface-safe, open water - no land known; the walk gate reopens)',
    'combat: shelter try vs drowned (dist 4.9, proximity)',
    'F9 [F9] combat: shelter try vs drowned (dist 4.9, proximity)'
  ])
  // only the double-tag anatomy answers - the unanchored copy is the hatch's proof
  assert.equal(c.shelter, 1)
  assert.equal(c.presence, 1)
})
