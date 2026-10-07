// THE DEATH GROUND tests (v0.464.0) - the join is hand-counted against the
// face 41 field read: 11 combat deaths, 5 grounds at +-12 planar, the top
// ground [-127,397] holding 4 (two skeleton arcs + two drowned chases), the
// second [-120,422] holding 3, the third [-173,415] holding 2. The radius
// edges, the planar law, the combat-kind authority, the blind bucket and
// the junk convention all pin here. (v0.792.0) THE DEATH GROUND'S OWN SEAT
// + the riders join the block: WHICH ground owns the combat book, pinned
// hand-counted against the face 81 storm's own cell (the nest's own read).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deathGrounds, DEATH_GROUND_RE, DEATH_GROUND_KILLER_RE, DEATH_GROUND_RADIUS, deathGroundSeat, deathGroundSeatRow, deathGroundRiders, deathGroundRidersRow } from '../../src/lib/deathground.mjs'
import fs from 'node:fs'

// THE FACE 41 DIED LINES VERBATIM (the log's own order - the greedy join
// follows it; line order = time order)
const FACE41 = [
  'F18 [F18] died - respawning (cause: server: was slain by Spider [kind=mob by Spider] | inferred: spider@1.8 (0s before death at [-120,64,422]) [the inference corroborates the server verdict])',
  'F7 [F7] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@12.6 (0s before death at [-127,64,397]) [the inference corroborates the server verdict])',
  'F1 [F1] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@9.5 (0s before death at [-84,67,400]) [the inference corroborates the server verdict])',
  'F11 [F11] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.5 (0s before death at [-128,62,387]) [the inference corroborates the server verdict])',
  'F3 [F3] died - respawning (cause: server: was slain by Spider [kind=mob by Spider] | inferred: spider@1.1 (0s before death at [-141,62,391]) [the inference corroborates the server verdict])',
  'F4 [F4] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@8.8 (0s before death at [-118,65,398]) [the inference corroborates the server verdict])',
  'F14 [F14] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@7.8 (0s before death at [-117,65,413]) [the inference corroborates the server verdict])',
  'F12 [F12] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.1 (0s before death at [-134,64,404]) [the inference corroborates the server verdict])',
  'F10 [F10] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.6 (0s before death at [-123,64,433]) [the inference corroborates the server verdict])',
  'F16 [F16] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@0.7 (0s before death at [-173,63,415]) [the inference corroborates the server verdict])',
  'F13 [F13] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.7 (0s before death at [-165,64,413]) [the inference corroborates the server verdict])'
]

test('the face 41 shape hand-counted: 11 deaths on 5 grounds, 3 multi, 2 singles', () => {
  const dg = deathGrounds(FACE41)
  assert.equal(dg.combatDeaths, 11)
  assert.equal(dg.blind, 0)
  assert.equal(dg.grounds.length, 5)
  assert.equal(dg.multiGrounds, 3)
  assert.equal(dg.singles, 2)
})

test('the top ground [-127,397] took 4 - two skeletons AND two drowned (the mixed-killer nest harvest)', () => {
  const dg = deathGrounds(FACE41)
  const top = dg.grounds[0]
  assert.equal(top.x, -127)
  assert.equal(top.z, 397)
  assert.equal(top.n, 4)
  assert.deepEqual(top.bots.sort(), ['F11', 'F12', 'F4', 'F7'])
  assert.deepEqual(top.killers, { Skeleton: 2, Drowned: 2 })
})

test('the second [-120,422] took 3 (spider + skeleton + drowned) and the third [-173,415] took 2', () => {
  const dg = deathGrounds(FACE41)
  const second = dg.grounds[1]
  assert.equal(second.x, -120)
  assert.equal(second.z, 422)
  assert.equal(second.n, 3)
  assert.deepEqual(second.bots.sort(), ['F10', 'F14', 'F18'])
  assert.deepEqual(second.killers, { Spider: 1, Skeleton: 1, Drowned: 1 })
  const third = dg.grounds[2]
  assert.equal(third.x, -173)
  assert.equal(third.z, 415)
  assert.equal(third.n, 2)
  assert.deepEqual(third.bots.sort(), ['F13', 'F16'])
  assert.deepEqual(third.killers, { Drowned: 1, Zombie: 1 })
})

test('the cross-read rows (v0.466.0): line-order groundN per combat death, the shared-ground answer', () => {
  const dg = deathGrounds(FACE41)
  assert.equal(dg.rows.length, 11)
  // the rows walk the deaths in LINE order (the shelter ledger's own sequence)
  assert.equal(dg.rows[0].bot, 'F18'); assert.equal(dg.rows[0].groundN, 3, 'F18 seeded [-120,422], the ground grew to 3')
  assert.equal(dg.rows[1].bot, 'F7'); assert.equal(dg.rows[1].groundN, 4, 'F7 seeded [-127,397], the nest grew to 4')
  assert.equal(dg.rows[2].bot, 'F1'); assert.equal(dg.rows[2].groundN, 1, 'F1 died alone at [-84,400]')
  assert.equal(dg.rows[3].bot, 'F11'); assert.equal(dg.rows[3].groundN, 4, 'F11 joined the [-127,397] nest')
  // the final-size law: groundN reads the ground's FINAL n (post-join), not the moment's
  const f4 = dg.rows.find(r => r.bot === 'F4')
  assert.equal(f4.groundN, 4, 'F4 joined [-127,397] third - the row reads the final 4')
  // the killer tally rides the row
  assert.equal(dg.rows[1].killer, 'Skeleton')
  assert.equal(dg.rows[3].killer, 'Drowned')
})

test('the blind row reads groundN null honest (the cross-read never guesses a blind death\'s ground)', () => {
  const lines = [
    'FA [FA] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie])',
    'FB [FB] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1 (0s before death at [100,64,200]))'
  ]
  const dg = deathGrounds(lines)
  assert.equal(dg.rows.length, 2)
  assert.equal(dg.rows[0].bot, 'FA')
  assert.equal(dg.rows[0].groundN, null)
  assert.equal(dg.rows[1].groundN, 1)
})

test(`the radius is ${DEATH_GROUND_RADIUS} and inclusive at the edge: exactly 12 joins, 13 seeds`, () => {
  const at = [
    'FA [FA] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1 (0s before death at [100,64,200]))'
  ]
  const join12 = at.concat(['FB [FB] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1 (0s before death at [112,64,200]))'])
  const seed13 = at.concat(['FB [FB] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1 (0s before death at [113,64,200]))'])
  const dj = deathGrounds(join12)
  assert.equal(dj.grounds.length, 1)
  assert.equal(dj.grounds[0].n, 2)
  assert.equal(dj.multiGrounds, 1)
  const ds = deathGrounds(seed13)
  assert.equal(ds.grounds.length, 2)
  assert.equal(ds.multiGrounds, 0)
  assert.equal(ds.singles, 2)
})

test('the join is PLANAR: a 100-block y gap never splits a ground, the y rides as data', () => {
  const lines = [
    'FA [FA] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1 (0s before death at [100,10,200]))',
    'FB [FB] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1 (0s before death at [105,110,205]))'
  ]
  const dg = deathGrounds(lines)
  assert.equal(dg.grounds.length, 1)
  assert.equal(dg.grounds[0].n, 2)
  assert.equal(dg.grounds[0].deaths[0].y, 10)
  assert.equal(dg.grounds[0].deaths[1].y, 110)
})

test('the combat-kind authority: the water\'s own kills never join a ground, the context prose never matches', () => {
  const lines = [
    'FA [FA] died - respawning (cause: server: drowned [kind=drown] | the inference is blind to this kind)',
    'FA [FA] death: drowned-kill context (in-water, y 62, feet water, head air, water e/w/s/n)',
    'FB [FB] died - respawning (cause: server: exploded [kind=explosion] | inferred: creeper@3 (0s before death at [100,64,200]))'
  ]
  const dg = deathGrounds(lines)
  assert.equal(dg.combatDeaths, 1, 'only the explosion kind is the ground lens\'s subject')
  assert.equal(dg.grounds.length, 1)
  assert.equal(dg.grounds[0].killers === undefined, false)
  assert.deepEqual(dg.grounds[0].killers, {}, 'a bare explosion carries no killer tally')
})

test('the blind bucket: a combat death with no readable place counts honest, never guessed', () => {
  const lines = [
    'FA [FA] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie])'
  ]
  const dg = deathGrounds(lines)
  assert.equal(dg.combatDeaths, 1)
  assert.equal(dg.blind, 1)
  assert.equal(dg.grounds.length, 0)
})

test('the killer regex: multi-word names read whole, the bare explosion reads null', () => {
  assert.equal('x [kind=mob by Cave Spider] y'.match(DEATH_GROUND_KILLER_RE)[1], 'Cave Spider')
  assert.equal('x [kind=explosion] y'.match(DEATH_GROUND_KILLER_RE)[1], undefined)
  assert.equal(DEATH_GROUND_RE.test('FA [FA] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.7 (0s before death at [-165,64,413]))'), true)
})

test('junk judges nothing: non-array non-string reads null, the empty inputs read the honest zeros', () => {
  assert.equal(deathGrounds(42), null)
  assert.equal(deathGrounds({ lines: [] }), null)
  const empty = deathGrounds([])
  assert.equal(empty.combatDeaths, 0)
  assert.equal(empty.grounds.length, 0)
  assert.equal(empty.multiGrounds, 0)
  const blank = deathGrounds('')
  assert.equal(blank.combatDeaths, 0)
  assert.equal(blank.blind, 0)
})

// (v0.792.0) THE DEATH GROUND'S OWN SEAT tests - the face 81 storm's own
// cell hand-counted (the probe's own read: 17 combat deaths, blind 0, the
// book the grounds cells' own sum; top [-140,394] x5 Drowned:4 Zombie:1,
// second [-125,394] x3 Drowned:2 Zombie:1, then [-128,419] x2, [-102,408]
// x2 Creeper:2 and five singles). The lines seed each ground at its own
// coord (the seed names the ground), the joins ride within the priced
// radius - the same anatomy the face 41 block pins.
const DIED = (bot, killer, x, y, z) =>
  `${bot} [${bot}] died - respawning (cause: server: was slain by ${killer} [kind=mob by ${killer}] | inferred: ${killer.toLowerCase()}@1.0 (0s before death at [${x},${y},${z}]) [the inference corroborates the server verdict])`
const BOOM = (bot, x, y, z) =>
  `${bot} [${bot}] died - respawning (cause: server: exploded [kind=explosion by Creeper] | inferred: creeper@3.0 (0s before death at [${x},${y},${z}]) [the inference corroborates the server verdict])`
const FACE81 = [
  DIED('F1', 'Drowned', -140, 64, 394),
  DIED('F2', 'Drowned', -145, 63, 399),
  DIED('F3', 'Drowned', -133, 62, 385),
  DIED('F4', 'Drowned', -148, 64, 390),
  DIED('F5', 'Zombie', -137, 64, 402),
  DIED('F6', 'Drowned', -125, 64, 394),
  DIED('F7', 'Drowned', -122, 63, 394),
  DIED('F8', 'Zombie', -118, 64, 402),
  DIED('F9', 'Zombie', -128, 62, 419),
  BOOM('F10', -124, 64, 424),
  BOOM('F11', -102, 64, 408),
  BOOM('F12', -97, 63, 413),
  BOOM('F13', -144, 64, 457),
  DIED('F14', 'Zombie', -141, 64, 425),
  BOOM('F15', -106, 64, 427),
  DIED('F16', 'Drowned', -100, 64, 375),
  DIED('F17', 'Skeleton', -69, 64, 419)
]

test('the face 81 cell through the seat law: the nest rides below half - the riders price the storm mix (the byte-exact row)', () => {
  const dg = deathGrounds(FACE81)
  assert.equal(dg.combatDeaths, 17)
  assert.equal(dg.blind, 0)
  // the strict-majority law: [-140,394] owns 5 of 17 - below half, no solo seat
  assert.equal(deathGroundSeat(dg), null)
  const r = deathGroundRiders(dg)
  assert.deepEqual(r, { leader: '[-140,394]', leaderOwns: 5, runner: '[-125,394]', runnerOwns: 3, ofDeaths: 17, pairOwns: 8, shareOfDeaths: 0.471, duet: false })
  assert.equal(
    deathGroundRidersRow(r),
    "the death ground's own riders (v0.792.0): no solo ground owns the majority - ground [-140,394] x5 + ground [-125,394] x3 own 8 of 17 combat death(s) (47.1%) - THE GROUND'S OWN MIX: the seat's tie law held, the mix is the shape - the grounds' own geometry prices the book the solo law refused to seat"
  )
  // the measure-not-owner law: the riders stay a MEASURE beside the seat -
  // the decompose's branch law (one row never both) leaves the companion
  // unprinted in the owner case, the function's own shape never gates
  const owner = { grounds: [{ x: 0, z: 0, n: 3 }, { x: 50, z: 50, n: 1 }] }
  const s = deathGroundSeat(owner)
  assert.deepEqual(s, { ground: '[0,0]', owns: 3, ofDeaths: 4, shareOfDeaths: 0.75 })
  const rm = deathGroundRiders(owner)
  assert.equal(rm.leader, '[0,0]')
  assert.equal(rm.runner, '[50,50]')
  assert.equal(rm.pairOwns, 4)
  assert.equal(rm.duet, false)
})

test("the tie owns nothing, the below-half fence, the duet byte order pin '[-100,300]' < '[-300,300]'", () => {
  // the tie law: 1 + 1 owns nothing solo - the riders price the duet (the
  // byte order broke the rank tie: '[-100,300]' < '[-300,300]')
  const tie = deathGrounds([
    DIED('FA', 'Zombie', -100, 64, 300),
    DIED('FB', 'Zombie', -300, 64, 300)
  ])
  assert.equal(deathGroundSeat(tie), null)
  const r = deathGroundRiders(tie)
  assert.deepEqual(r, { leader: '[-100,300]', leaderOwns: 1, runner: '[-300,300]', runnerOwns: 1, ofDeaths: 2, pairOwns: 2, shareOfDeaths: 1, duet: true })
  assert.equal(
    deathGroundRidersRow(r),
    "the death ground's own riders (v0.792.0): no solo ground owns the majority - ground [-100,300] x1 + ground [-300,300] x1 own 2 of 2 combat death(s) (100.0%) - THE GROUND'S OWN MIX: the seat's tie law held, the mix is the shape - the grounds' own geometry prices the book the solo law refused to seat"
  )
  // the below-half fence: the top ground at exactly half reads no solo seat
  const half = deathGrounds([
    DIED('FA', 'Zombie', -200, 64, 300),
    DIED('FB', 'Zombie', -205, 64, 305),
    DIED('FC', 'Zombie', -100, 64, 300),
    DIED('FD', 'Zombie', -300, 64, 300)
  ])
  assert.equal(deathGroundSeat(half), null)
  const rh = deathGroundRiders(half)
  assert.equal(rh.leader, '[-200,300]')
  assert.equal(rh.runner, '[-100,300]')
  assert.equal(rh.pairOwns, 3)
  assert.equal(rh.ofDeaths, 4)
  assert.equal(rh.duet, false)
})

test("the book is the cells' own sum - the blind stay outside - and the single-ground fence holds the seat row", () => {
  // the census's own counting law: a blind combat death rides no ground -
  // the seat reads the GROUNDS cells' own book, never the combatDeaths
  // counter (a junk census may trail the counter - the cell keeps its own)
  const census = { combatDeaths: 99, blind: 2, grounds: [{ x: 0, z: 0, n: 3 }, { x: 50, z: 50, n: 1 }] }
  const s = deathGroundSeat(census)
  assert.equal(s.ofDeaths, 4)
  assert.equal(s.owns, 3)
  assert.equal(
    deathGroundSeatRow(s),
    "the death ground's own seat (v0.792.0): ground [0,0] owns 3 of 4 combat death(s) (75.0%) - THE GROUND'S OWN SEAT: one ground's own deaths own the combat book - the nest's own geometry prices the front the raw split rode unnamed"
  )
  // the single-ground fence: one counted ground reads a seat but no riders
  // (fewer than two cells - the honest silence's companion law)
  const solo = { grounds: [{ x: 100, z: 200, n: 1 }] }
  const soloSeat = deathGroundSeat(solo)
  assert.deepEqual(soloSeat, { ground: '[100,200]', owns: 1, ofDeaths: 1, shareOfDeaths: 1 })
  assert.equal(deathGroundRiders(solo), null)
  // the all-blind face (grounds empty) reads the honest silence both ways
  const blindOnly = deathGrounds([
    'FA [FA] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie])'
  ])
  assert.equal(deathGroundSeat(blindOnly), null)
  assert.equal(deathGroundRiders(blindOnly), null)
})

test('the junk battery + the WIRING assert - the decompose branch rides the cell, the prose lives only in the lib', () => {
  // the junk battery: junk never invents a ground (the honest silence)
  assert.equal(deathGroundSeat(null), null)
  assert.equal(deathGroundSeat(undefined), null)
  assert.equal(deathGroundSeat(42), null)
  assert.equal(deathGroundSeat([1, 2]), null)
  assert.equal(deathGroundSeat({}), null)
  assert.equal(deathGroundSeat({ grounds: [] }), null)
  assert.equal(deathGroundSeat({ grounds: 'nope' }), null)
  assert.equal(deathGroundSeat({ grounds: [{ x: 0, z: 0, n: 0 }] }), null)
  assert.equal(deathGroundSeat({ grounds: [{ x: 'a', z: 1, n: 2 }] }), null)
  assert.equal(deathGroundSeat({ grounds: [{ x: 0, z: 0, n: NaN }] }), null)
  assert.equal(deathGroundSeat({ grounds: [null] }), null)
  // a junk cell is skipped honest, the real cell beside it still seats
  assert.deepEqual(deathGroundSeat({ grounds: [null, { x: 0, z: 0, n: 1 }] }), { ground: '[0,0]', owns: 1, ofDeaths: 1, shareOfDeaths: 1 })
  assert.equal(deathGroundSeatRow(null), null)
  assert.equal(deathGroundSeatRow({ ground: '', owns: 1, ofDeaths: 1, shareOfDeaths: 1 }), null)
  assert.equal(deathGroundSeatRow({ ground: '[0,0]', owns: 2, ofDeaths: 1, shareOfDeaths: 2 }), null)
  assert.equal(deathGroundRiders(null), null)
  assert.equal(deathGroundRiders({}), null)
  assert.equal(deathGroundRidersRow(null), null)
  assert.equal(deathGroundRidersRow({ leader: '[-1,1]', leaderOwns: 0, runner: '[-2,2]', runnerOwns: 1, ofDeaths: 2, pairOwns: 1, shareOfDeaths: 0.5 }), null)
  // the WIRING assert - the decompose branch rides the grounds rows, the
  // prose lives only in the lib
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const dgs = deathGroundSeat(dg)'), 'the seat rides the census cell')
  assert.ok(src.includes('if (dgs) console.log(`  ${deathGroundSeatRow(dgs)}`)'), 'the owner row rides the branch')
  assert.ok(src.includes('const dgr = deathGroundRiders(dg)'), 'the riders ride the same branch law')
  assert.ok(!src.includes("THE GROUND'S OWN SEAT"), 'the prose stays in the lib')
  assert.ok(!src.includes("THE GROUND'S OWN MIX"), 'the mix prose stays in the lib')
})
