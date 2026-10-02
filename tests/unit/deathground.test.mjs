// THE DEATH GROUND tests (v0.464.0) - the join is hand-counted against the
// face 41 field read: 11 combat deaths, 5 grounds at +-12 planar, the top
// ground [-127,397] holding 4 (two skeleton arcs + two drowned chases), the
// second [-120,422] holding 3, the third [-173,415] holding 2. The radius
// edges, the planar law, the combat-kind authority, the blind bucket and
// the junk convention all pin here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deathGrounds, DEATH_GROUND_RE, DEATH_GROUND_KILLER_RE, DEATH_GROUND_RADIUS } from '../../src/lib/deathground.mjs'

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
