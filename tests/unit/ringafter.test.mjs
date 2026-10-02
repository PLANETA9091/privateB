import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ringAfter } from '../../src/lib/ringafter.mjs'
import { shelterLadder } from '../../src/lib/shieldledger.mjs'

// Face 42's live shapes verbatim (the drowned sieve + the zombie hold,
// hand-traced then verified live). F11's fifth try landed the arrow wall
// at cells 2/8 - INCOMPLETE - and the drowned walked the gap: the bot's
// own death line arrives two fixture lines after the landing. F5's full
// ring holds through the window end. Inter-bot prose rides between (the
// walk reads only the row bot's own lines).
const face42Mini = [
  'F11 [F11] combat: shelter try vs drowned (dist 5.2, proximity)',
  'F11 [F11] combat: shelter wall miss (open field: no diggable wall, ring next, drowned@5.2)',
  'F11 [F11] combat: shelter ring try vs drowned (dist 5.2, -z+z-x+x first, arrow wall, proximity)',
  'F7 [F7] climb bridge: unavailable (no placeable block in the pocket)',
  'F11 [F11] combat: sheltering from drowned (arrow wall, cells 2/8, proximity)',
  'F16 [F16] combat: fight ended vs zombie (mob down, hp 20.0 -> 12.0, swings 6, weapon wooden_sword, 6 rounds)',
  'F11 [F11] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@0.7 (0s before death at [-149,64,416]) [the inference corroborates the server verdict])',
  'F5 [F5] combat: shelter try vs zombie (dist 3.0, proximity re-verdict)',
  'F5 [F5] combat: sheltering from zombie (ring 8/8, proximity re-verdict)'
]

// Face 43's live shapes verbatim - THE CREEPER SIEGE: three rings on the
// same creeper, each re-shelter re-asking the question the last ring
// did not answer (ringed -> re-shelter -> ringed -> re-shelter -> ringed
// -> the window's tail).
const face43Mini = [
  'F11 [F11] combat: shelter try vs creeper (dist 2.5, proximity re-verdict)',
  'F11 [F11] combat: shelter wall miss (open field: no diggable wall, ring next, creeper@2.5)',
  'F11 [F11] combat: shelter ring try vs creeper (dist 2.5, -z+x-x+z first, full ring, proximity re-verdict)',
  'F11 [F11] combat: sheltering from creeper (ring 8/8, proximity re-verdict)',
  'F11 [F11] combat: shelter try vs creeper (dist 4.9, proximity)',
  'F11 [F11] combat: shelter wall miss (open field: no diggable wall, ring next, creeper@4.9)',
  'F11 [F11] combat: shelter ring try vs creeper (dist 4.9, -z+x-x+z first, full ring, proximity)',
  'F11 [F11] combat: sheltering from creeper (ring 8/8, proximity)',
  'F11 [F11] combat: shelter try vs creeper (dist 6.3, proximity)',
  'F11 [F11] combat: shelter wall miss (open field: no diggable wall, ring next, creeper@6.3)',
  'F11 [F11] combat: shelter ring try vs creeper (dist 6.3, -x-z+z+x first, full ring, proximity)',
  'F11 [F11] combat: sheltering from creeper (ring 8/8, proximity)'
]

test('ringAfter reads face 42 verbatim: the sieve death behind the 2/8 wall, the full ring holds', () => {
  const r = ringAfter(face42Mini)
  assert.equal(r.ringed, 2)
  assert.equal(r.diedInShelter, 1)
  assert.equal(r.reShelter, 0)
  assert.equal(r.laneReturn, 0)
  assert.equal(r.heldTail, 1)
  // the book law: ringed = diedInShelter + reShelter + laneReturn + heldTail
  assert.equal(r.ringed, r.diedInShelter + r.reShelter + r.laneReturn + r.heldTail)
  // the completeness cross: one full ring, one incomplete
  assert.deepEqual(r.complete, { full: 1, incomplete: 1 })
  // THE SIEVE: the death rode the INCOMPLETE wall, never the full one
  assert.deepEqual(r.deathsByWall, { full: 0, incomplete: 1 })
})

test('ringAfter rows carry the wall truth and the gap anatomy (face 42)', () => {
  const r = ringAfter(face42Mini)
  const f11 = r.rows[0]
  assert.equal(f11.bot, 'F11')
  assert.equal(f11.mob, 'drowned')
  // the landing's own cell read - the try said 'arrow wall', the landing
  // counted cells 2/8 (the truth is the landing's count, not the try)
  assert.equal(f11.wall.kind, 'arrowwall')
  assert.deepEqual(f11.wall.cells, [2, 8])
  assert.equal(f11.wall.complete, false)
  assert.equal(f11.aftermath, 'diedInShelter')
  assert.equal(f11.gapLines, 2)
  const f5 = r.rows[1]
  assert.equal(f5.bot, 'F5')
  assert.equal(f5.wall.kind, 'ring')
  assert.deepEqual(f5.wall.cells, [8, 8])
  assert.equal(f5.wall.complete, true)
  assert.equal(f5.aftermath, 'heldTail')
  assert.equal(f5.gapLines, null)
})

test('ringAfter reads face 43 verbatim: the creeper siege - three rings, the ring is a pause not an end', () => {
  const r = ringAfter(face43Mini)
  assert.equal(r.ringed, 3)
  assert.equal(r.diedInShelter, 0)
  assert.equal(r.reShelter, 2)
  // both re-shelters re-asked the SAME creeper
  assert.equal(r.reShelterSame, 2)
  assert.equal(r.reShelterMoved, 0)
  assert.equal(r.laneReturn, 0)
  assert.equal(r.heldTail, 1)
  assert.equal(r.ringed, r.diedInShelter + r.reShelter + r.laneReturn + r.heldTail)
  // THE SIEGE: one chain, three consecutive same-mob rings
  assert.deepEqual(r.sieges, { chains: 1, max: 3 })
  // every landing was a full ring - and nobody died behind one
  assert.deepEqual(r.complete, { full: 3, incomplete: 0 })
  assert.deepEqual(r.deathsByWall, { full: 0, incomplete: 0 })
})

test('ringAfter siege rows carry the re-shelter dist and the pause gap', () => {
  const r = ringAfter(face43Mini)
  const first = r.rows[0]
  assert.equal(first.aftermath, 'reShelter')
  assert.equal(first.reMob, 'creeper')
  assert.equal(first.reDist, 4.9)
  assert.equal(first.gapLines, 1)
  const second = r.rows[1]
  assert.equal(second.aftermath, 'reShelter')
  assert.equal(second.reDist, 6.3)
  assert.equal(second.gapLines, 1)
  // the last ring ran out of window, not of mob
  const last = r.rows[2]
  assert.equal(last.aftermath, 'heldTail')
  assert.equal(last.gapLines, null)
})

test('ringAfter prices the lane return - the bot came out on its own terms (synthetic, unseen at this n)', () => {
  const lines = [
    'F9 [F9] combat: shelter try vs zombie (dist 3.1, proximity)',
    'F9 [F9] combat: sheltering from zombie (ring 8/8, proximity)',
    // the machinery prose never moves the aftermath (the ring-ranged skin)
    'F9 [F9] combat: shelter ring ranged mode: arrows 12',
    'F9 [F9] combat: fighting zombie (dist 2.8, hp 14.0, 1 nearby, proximity re-verdict)'
  ]
  const r = ringAfter(lines)
  assert.equal(r.ringed, 1)
  assert.equal(r.laneReturn, 1)
  assert.equal(r.heldTail, 0)
  assert.equal(r.rows[0].gapLines, 2)
})

test('ringAfter prices the moved re-shelter - the threat changed while sheltered (synthetic)', () => {
  const lines = [
    'F4 [F4] combat: shelter try vs creeper (dist 2.0, proximity)',
    'F4 [F4] combat: sheltering from creeper (ring 8/8, proximity)',
    'F4 [F4] combat: shelter try vs skeleton (dist 2.2, proximity re-verdict)'
  ]
  const r = ringAfter(lines)
  assert.equal(r.reShelter, 1)
  assert.equal(r.reShelterSame, 0)
  assert.equal(r.reShelterMoved, 1)
  assert.equal(r.rows[0].reMob, 'skeleton')
  assert.equal(r.rows[0].reDist, 2.2)
  // a one-off re-shelter is not a siege
  assert.deepEqual(r.sieges, { chains: 0, max: 0 })
})

test('ringAfter honors the truncation tail - a ringed line at the face end holds honestly', () => {
  const lines = [
    'F12 [F12] combat: shelter try vs spider (dist 1.9, proximity)',
    'F12 [F12] combat: sheltering from spider (ring 8/8, proximity)'
  ]
  const r = ringAfter(lines)
  assert.equal(r.ringed, 1)
  assert.equal(r.heldTail, 1)
  assert.equal(r.rows[0].gapLines, null)
})

test('ringAfter inherits the ladder law: a sheltering line without a try opens nothing', () => {
  // the episode book opens on the try only - the lib never re-walks the
  // ladder grammar, so a stray 'sheltering' line reads the zero shape
  const r = ringAfter([
    'F3 [F3] combat: sheltering from zombie (ring 8/8, proximity)',
    'F3 [F3] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie])'
  ])
  assert.equal(r.ringed, 0)
  assert.equal(r.diedInShelter, 0)
  assert.deepEqual(r.rows, [])
})

test('ringAfter junk battery: null/number/bool read null, empties read the honest zero shape', () => {
  assert.equal(ringAfter(null), null)
  assert.equal(ringAfter(undefined), null)
  assert.equal(ringAfter(42), null)
  assert.equal(ringAfter(true), null)
  assert.equal(ringAfter({}), null)
  const zero = ringAfter([])
  assert.equal(zero.ringed, 0)
  assert.equal(zero.diedInShelter, 0)
  assert.equal(zero.reShelter, 0)
  assert.equal(zero.reShelterSame, 0)
  assert.equal(zero.reShelterMoved, 0)
  assert.equal(zero.laneReturn, 0)
  assert.equal(zero.heldTail, 0)
  assert.deepEqual(zero.sieges, { chains: 0, max: 0 })
  assert.deepEqual(zero.complete, { full: 0, incomplete: 0 })
  assert.deepEqual(zero.deathsByWall, { full: 0, incomplete: 0 })
  assert.deepEqual(zero.rows, [])
  const junk = ringAfter(['', 'walk: F2 steps 41 toward mine', 'bank: F9 end-bank budget spent - smelt skipped', 17, null])
  assert.equal(junk.ringed, 0)
})

test('ringAfter pins the one-parser law: the episode book is shelterLadder\'s own, never forked', () => {
  for (const face of [face42Mini, face43Mini]) {
    const ra = ringAfter(face)
    const sl = shelterLadder(face)
    assert.equal(ra.ringed, sl.ringed)
    assert.equal(ra.rows.length, sl.rows.filter(x => x.outcome === 'ringed').length)
    // the rows line up bot x mob x open order with the ladder's own
    const ringed = sl.rows.filter(x => x.outcome === 'ringed')
    ra.rows.forEach((r, i) => {
      assert.equal(r.bot, ringed[i].bot)
      assert.equal(r.mob, ringed[i].mob)
      assert.equal(r.openIdx, ringed[i].openIdx)
    })
  }
})

test('ringAfter reads the fleet pair aggregate: the field read 5 ringed, book 5/5, the sieve 1, the siege max 3', () => {
  // both faces' live reads joined (the decompose aggregate's shape)
  const both = [...face42Mini, ...face43Mini]
  const r = ringAfter(both)
  assert.equal(r.ringed, 5)
  assert.equal(r.diedInShelter, 1)
  assert.equal(r.reShelter, 2)
  assert.equal(r.laneReturn, 0)
  assert.equal(r.heldTail, 2)
  assert.equal(r.ringed, r.diedInShelter + r.reShelter + r.laneReturn + r.heldTail)
  assert.equal(r.reShelterSame, 2)
  assert.deepEqual(r.sieges, { chains: 1, max: 3 })
  assert.deepEqual(r.complete, { full: 4, incomplete: 1 })
  assert.deepEqual(r.deathsByWall, { full: 0, incomplete: 1 })
})
