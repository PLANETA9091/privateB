import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fleeLedger, FLEE_START_RE, FLEE_KILL_RE, STUCK_REFLEE_U } from '../../src/lib/fleeledger.mjs'
import { distBand } from '../../src/lib/shelterledger.mjs'

// Face 43's live shapes verbatim (run 36970605824) - the twelve flee
// episodes' starts and their own boundary lines (hand-traced: the
// inter-episode machinery prose is omitted - it never closes an episode).
const face43Mini = [
  // F17's pre-episode fight (not a flee - must not open anything)
  'F17 [F17] combat: fighting skeleton (dist 11.4, hp 10.3, 1 nearby, sentry)',
  // F2 x3 - the creeper chase, two reflees then the face's tail
  'F2 [F2] combat: fleeing creeper (dist 6.2, hp 16.8, 3 nearby, proximity)',
  // F18 x3 - the same creeper, closed by standing to a skeleton fight
  'F18 [F18] combat: fleeing creeper (dist 6.2, hp 20.0, 3 nearby, proximity)',
  'F19 [F19] combat: fighting spider (dist 3.0, hp 20.0, 2 nearby, proximity)',
  'F5 [F5] combat: fighting spider (dist 5.0, hp 11.0, 2 nearby, proximity)',
  'F11 [F11] combat: sheltering from creeper (ring 8/8, proximity re-verdict)',
  // F17's doomed flee - closed by the creeper blast (the inference names
  // a BYSTANDER skeleton: the crossfire class, the kill dist unpriced)
  'F17 [F17] combat: fleeing spider (dist 4.0, hp 8.3, 2 nearby, proximity)',
  'F19 [F19] combat: fight ended vs spider (mob down, hp 18.0 -> 17.0, swings 4, weapon wooden_sword, 4 rounds)',
  'F2 [F2] combat: fleeing creeper (dist 6.4, hp 17.0, 1 nearby, proximity)',
  'F18 [F18] combat: fleeing creeper (dist 6.5, hp 20.0, 1 nearby, proximity)',
  'F19 [F19] combat: fighting zombie (dist 4.6, hp 17.0, 1 nearby, proximity)',
  'F15 [F15] combat: fleeing zombie_villager (dist 6.0, hp 2.5, 2 nearby, proximity)',
  'F2 [F2] combat: fleeing creeper (dist 4.5, hp 17.0, 1 nearby, proximity)',
  'F18 [F18] combat: fleeing creeper (dist 4.5, hp 20.0, 1 nearby, proximity)',
  'F17 [F17] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: skeleton@12.5 (0s before death at [-127,64,431]) [the inference names a BYSTANDER - the exploder removed itself at detonation, the nearest-harm scan read the next-nearest hostile (a real witness, not the killer; the server killer stays the authority)])',
  'F19 [F19] combat: fight ended vs zombie (mob down, hp 17.0 -> 9.0, swings 7, weapon wooden_sword, 7 rounds)',
  // F5's doomed flee - chased down (the inference JOINS the threat:
  // zombie_villager@0.7 after fleeing @4.8 - THE MOB CLOSED IN)
  'F5 [F5] combat: fleeing zombie_villager (dist 4.8, hp 2.0, 1 nearby, proximity)',
  'F5 [F5] died - respawning (cause: server: was slain by Zombie Villager [kind=mob by Zombie] | inferred: zombie_villager@0.7 (0s before death at [-152,65,407]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])',
  'F15 [F15] combat: fleeing zombie_villager (dist 6.1, hp 2.5, 1 nearby, proximity)',
  // F16's doomed flee - the CROSSFIRE (fled a creeper, the skeleton's
  // arrow took the trade - the fire-1638 ARROWS read's start-side shape)
  'F16 [F16] combat: fleeing creeper (dist 6.7, hp 19.0, 2 nearby, proximity)',
  'F19 [F19] combat: fleeing skeleton (dist 11.5, hp 5.0, 1 nearby, sentry)',
  // F18's episode-3 closer: the bot STOOD (fought a skeleton, mob down)
  'F18 [F18] combat: fighting skeleton (dist 7.7, hp 16.0, 1 nearby, sentry)',
  'F18 [F18] combat: fight ended vs skeleton (mob down, hp 16.0 -> 12.8, swings 6, weapon wooden_sword, 6 rounds)',
  'F16 [F16] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@8.9 (0s before death at [-132,64,407]) [the inference corroborates the server verdict])'
]

test('fleeLedger reads face 43 verbatim: 12 starts, the book closes 12/12', () => {
  const r = fleeLedger(face43Mini)
  assert.equal(r.starts, 12)
  assert.equal(r.reflee, 5)
  assert.equal(r.stood, 1)
  assert.equal(r.sheltered, 0)
  assert.equal(r.chased, 1)
  assert.equal(r.crossfire, 2)
  assert.equal(r.diedOther, 0)
  assert.equal(r.open, 3)
  // THE BOOK LAW: every start closes exactly once
  assert.equal(r.reflee + r.stood + r.sheltered + r.chased + r.crossfire + r.diedOther + r.open, r.starts)
})

test('the doomed flees carry the chase geometry: chased with delta, crossfire without', () => {
  const r = fleeLedger(face43Mini)
  const chased = r.rows.filter(x => x.outcome === 'chased')
  assert.equal(chased.length, 1)
  assert.equal(chased[0].bot, 'F5')
  assert.equal(chased[0].mob, 'zombie_villager')
  assert.equal(chased[0].dist, 4.8)
  assert.equal(chased[0].killDist, 0.7)
  assert.equal(chased[0].killDelta, -4.1)
  const cross = r.rows.filter(x => x.outcome === 'crossfire')
  assert.equal(cross.length, 2)
  // F17: fled a spider, the creeper's blast took it (the inference named
  // a bystander - no kill dist is priced, the class is honest)
  const f17 = cross.find(x => x.bot === 'F17')
  assert.equal(f17.mob, 'spider')
  assert.equal(f17.killer, 'Creeper')
  assert.equal(f17.killDist, null)
  assert.equal(f17.killDelta, null)
  // F16: fled a creeper, the skeleton's arrow took it (the fire-1638
  // ARROWS read - the second hostile's kill, start-side)
  const f16 = cross.find(x => x.bot === 'F16')
  assert.equal(f16.mob, 'creeper')
  assert.equal(f16.killer, 'Skeleton')
  assert.equal(f16.killDist, null)
})

test('the start-side bands price the doom share: face 43 close 1/1, mid 2/10, far 0/1', () => {
  const r = fleeLedger(face43Mini)
  assert.deepEqual(
    { close: r.bands.close, mid: r.bands.mid, far: r.bands.far, unpriced: r.bands.unpriced },
    { close: { starts: 1, died: 1 }, mid: { starts: 10, died: 2 }, far: { starts: 1, died: 0 }, unpriced: { starts: 0, died: 0 } }
  )
  // the band ruler is the flee fork's own - imported, never forked
  assert.equal(distBand(4.0), 'close')
  assert.equal(distBand(11.5), 'far')
})

test('the chase progress: reflee deltas priced, the stuck signature counted', () => {
  const r = fleeLedger(face43Mini)
  const deltas = r.rows.filter(x => x.outcome === 'reflee').map(x => x.refleeDelta)
  assert.deepEqual(deltas, [0.2, 0.3, -1.9, -2, 0.1])
  // F2 6.2->6.4 (+0.2), F18 6.2->6.5 (+0.3), F15 6.0->6.1 (+0.1) - the
  // mob kept pace (the run73 stuck signature); the two -2.0 closes are
  // the mob CLOSING IN
  assert.equal(r.stuckReflees, 3)
  assert.equal(STUCK_REFLEE_U, 1.0)
})

test('hp at flee start: the flee-too-late read (min 2.0, median 16.9, max 20.0)', () => {
  const r = fleeLedger(face43Mini)
  assert.equal(r.hp.min, 2.0)
  assert.equal(r.hp.median, 16.9)
  assert.equal(r.hp.max, 20.0)
  assert.equal(r.kiteStarts, 0)
})

test('perBot counts every episode; the reasons ride as data', () => {
  const r = fleeLedger(face43Mini)
  assert.deepEqual(r.perBot, { F2: 3, F18: 3, F17: 1, F15: 2, F5: 1, F16: 1, F19: 1 })
  const f19 = r.rows.find(x => x.bot === 'F19')
  assert.equal(f19.mob, 'skeleton')
  assert.equal(f19.reason, 'sentry')
  assert.equal(f19.outcome, 'open')
})

// Face 42's live shapes (run 36967273918) - the chased-by-SERVER-token
// leg: the explosion kind's inference is blind by construction, the
// server killer token is the authority
const face42Mini = [
  'F4 [F4] combat: fleeing creeper (dist 6.7, hp 5.8, 1 nearby, proximity)',
  'F10 [F10] combat: fleeing creeper (dist 5.7, hp 20.0, 1 nearby, proximity)',
  'F4 [F4] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: fall/env (0s before death at [-140,64,406]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
  'F13 [F13] combat: fleeing zombie (dist 6.8, hp 6.7, 1 nearby, proximity)',
  'F10 [F10] combat: fight ended vs zombie (mob down, hp 20.0 -> 20.0, swings 1, weapon wooden_sword, 1 rounds)'
]

test('fleeLedger reads face 42 verbatim: the chased class joins on the server killer token', () => {
  const r = fleeLedger(face42Mini)
  assert.equal(r.starts, 3)
  assert.equal(r.chased, 1)
  assert.equal(r.stood, 1)
  assert.equal(r.open, 1)
  const f4 = r.rows.find(x => x.bot === 'F4')
  assert.equal(f4.outcome, 'chased')
  assert.equal(f4.killer, 'Creeper')
  // the inference is blind to explosions - the kill dist stays unpriced
  assert.equal(f4.killDist, null)
  assert.equal(f4.killDelta, null)
  const f10 = r.rows.find(x => x.bot === 'F10')
  assert.equal(f10.outcome, 'stood')
  assert.equal(f10.exit, 'mob down')
})

test('the kite flag and the mid-episode machinery prose never close an episode', () => {
  const r = fleeLedger([
    'F7 [F7] combat: fleeing zombie (dist 5.0, hp 12.0, 1 nearby, proximity, kite)',
    // the flee family's own mid-course lines - episode-internal
    'F7 [F7] combat: flee bearing rotated 90deg (water/hazard vetoes the yard target) vs zombie (proximity)',
    'F7 [F7] combat: flee kite hop toward the yard (-120,390) vs zombie (proximity)',
    // the shelter machinery's refusals - still internal
    'F7 [F7] combat: shelter skip (open field: ring stock 0/8, threat@5.0 beyond the earn edge - the nwins)',
    'F7 [F7] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it',
    'F7 [F7] combat: verdict flipped to flee vs zombie (hp 9.0)',
    // the shelter LANDS - the only shelter-side closer
    'F7 [F7] combat: sheltering from zombie (ring 8/8, proximity)'
  ])
  assert.equal(r.starts, 1)
  assert.equal(r.sheltered, 1)
  assert.equal(r.kiteStarts, 1)
  assert.equal(r.rows[0].kite, true)
  assert.equal(r.rows[0].reason, 'proximity')
})

test('a flee closed by a non-combat death reads died-other (the episode still closes)', () => {
  const r = fleeLedger([
    'F9 [F9] combat: fleeing drowned (dist 3.5, hp 14.0, 1 nearby, proximity)',
    'F9 [F9] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-142,61,391]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
  ])
  assert.equal(r.starts, 1)
  assert.equal(r.diedOther, 1)
  assert.equal(r.chased, 0)
  assert.equal(r.crossfire, 0)
  // the non-combat death never counts into the bands' died share
  assert.deepEqual(r.bands.close, { starts: 1, died: 0 })
})

test('the truncation window: a flee verb with a cut body opens data-blind', () => {
  const r = fleeLedger([
    'F3 [F3] combat: fleeing creeper (dist 4',
    'F3 [F3] combat: fighting skeleton (dist 6.0, hp 10.0, 1 nearby, sentry)'
  ])
  assert.equal(r.starts, 1)
  assert.equal(r.rows[0].mob, null)
  assert.equal(r.rows[0].dist, null)
  assert.equal(r.rows[0].band, null)
  assert.equal(r.rows[0].outcome, 'stood')
  // the unpriced band carries it
  assert.deepEqual(r.bands.unpriced, { starts: 1, died: 0 })
  assert.equal(r.hp, null)
})

test('the RE shapes anchor the emitter (the sibling-shape law)', () => {
  const start = 'F2 [F2] combat: fleeing creeper (dist 6.2, hp 16.8, 3 nearby, proximity)'
  const m = start.match(FLEE_START_RE)
  assert.equal(m[1], 'creeper')
  assert.equal(m[2], '6.2')
  assert.equal(m[3], '16.8')
  assert.equal(m[4], '3')
  assert.equal(m[5], 'proximity')
  const kill = 'F5 [F5] died - respawning (cause: server: x [kind=mob by Zombie] | inferred: zombie_villager@0.7 (0s before death at [-152,65,407]) [x])'
  const km = kill.match(FLEE_KILL_RE)
  assert.equal(km[1], 'zombie_villager')
  assert.equal(km[2], '0.7')
})

test('junk reads null (the smeltledger convention), the raw blob reads the array', () => {
  assert.equal(fleeLedger(null), null)
  assert.equal(fleeLedger(undefined), null)
  assert.equal(fleeLedger(42), null)
  assert.equal(fleeLedger({ lines: [] }), null)
  const blob = face42Mini.join('\n')
  const fromBlob = fleeLedger(blob)
  const fromArray = fleeLedger(face42Mini)
  assert.equal(fromBlob.starts, fromArray.starts)
  assert.equal(fromBlob.chased, fromArray.chased)
  assert.equal(fromBlob.open, fromArray.open)
})

test('the zero law: a face with no flees reads the honest zero shape', () => {
  const r = fleeLedger([
    'F1 [F1] combat: fight ended vs zombie (mob down, hp 20.0 -> 20.0, swings 1, weapon wooden_pickaxe, 1 rounds)',
    'F2 [F2] mem: rss=251M'
  ])
  assert.equal(r.starts, 0)
  assert.equal(r.reflee, 0)
  assert.equal(r.chased, 0)
  assert.equal(r.open, 0)
  assert.equal(r.hp, null)
  assert.deepEqual(r.perBot, {})
  assert.deepEqual(r.rows, [])
})
