//
// chasebill.test.mjs - THE CHASE'S OWN GEOMETRY (v0.712.0) unit tests.
// The face lines are byte-verbatim forms from the stored faces (the
// 39th's F13 drowned chase + the fleeledger face-43 conventions), the
// hand-built rows price the edge skins the era never rode (the
// unpriced server-token death). The era's face-level reads (7 chased
// deaths: closedIn 4 / gained 2 / flat 1 / unpriced 0) ride the
// decompose surface.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chaseBill } from '../../src/lib/chasebill.mjs'
import { fleeLedger } from '../../src/lib/fleeledger.mjs'

// The three skins through the REAL lens path (fleeLedger first), the
// lines byte-verbatim in the stored forms: F13's exact re-contact
// (the 37th's flat skin), F4's gained-and-died-anyway (the 39th's
// trade lost), F5's mob-closed-in (the face-43 chased convention).
const MINI = [
  'F13 [F13] combat: fleeing zombie (dist 0.6, hp 9.0, 1 nearby, proximity)',
  'F13 [F13] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.6 (0s before death at [-160,62,403]) [the inference corroborates the server verdict])',
  'F4 [F4] combat: fleeing skeleton (dist 6.6, hp 4.0, 1 nearby, sentry)',
  'F4 [F4] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@9.4 (0s before death at [-150,60,407]) [the inference corroborates the server verdict])',
  'F5 [F5] combat: fleeing zombie_villager (dist 4.8, hp 2.0, 1 nearby, proximity)',
  'F5 [F5] died - respawning (cause: server: was slain by Zombie Villager [kind=mob by Zombie] | inferred: zombie_villager@0.7 (0s before death at [-152,65,407]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])'
]

test('chaseBill: the three skins fold through the real lens path (the mini face, byte-verbatim)', () => {
  const b = chaseBill(fleeLedger(MINI))
  assert.ok(b, 'the bill opens on a chased face')
  assert.equal(b.chased, 3)
  assert.equal(b.flat, 1, 'the exact re-contact (delta 0) is its own skin')
  assert.equal(b.gained, 1, 'the flee gained and died anyway - the trade lost')
  assert.equal(b.closedIn, 1, 'the mob closed in - the speed gap')
  assert.equal(b.unpriced, 0)
  assert.deepEqual(b.bots, { F13: 1, F4: 1, F5: 1 })
})

test('chaseBill: the honest silences (junk, empty, chased-free)', () => {
  assert.equal(chaseBill(), null, 'no arg')
  assert.equal(chaseBill(null), null)
  assert.equal(chaseBill('junk'), null)
  assert.equal(chaseBill({}), null, 'no rows field')
  assert.equal(chaseBill({ rows: 'junk' }), null, 'rows must be an array')
  assert.equal(chaseBill({ rows: [] }), null, 'an empty face opens no bill')
  const noChase = fleeLedger([
    'F10 [F10] combat: fleeing zombie (dist 11.4, hp 7.7, 1 nearby, sentry)',
    'F10 [F10] combat: fight ended vs zombie (mob down, hp 7.7 -> 9.0, swings 4, weapon wooden_sword, 4 rounds)'
  ])
  assert.equal(chaseBill(noChase), null, 'a face where nobody died mid-flee stays silent')
})

test('chaseBill: the unpriced skin rides as the honest audit row (the server-token death)', () => {
  const b = chaseBill({ rows: [
    { bot: 'F9', outcome: 'chased', mob: 'zombie', killDelta: null },
    { bot: 'F2', outcome: 'crossfire', mob: 'skeleton', killDelta: null },
    { bot: 'F6', outcome: 'chased', mob: 'drowned', killDelta: -2.5 }
  ] })
  assert.ok(b)
  assert.equal(b.chased, 2, 'only the chased rows bill')
  assert.equal(b.unpriced, 1)
  assert.equal(b.closedIn, 1)
  assert.equal(b.gained, 0)
  assert.deepEqual(b.bots, { F9: 1, F6: 1 })
})

test('chaseBill: the era\u2019s own bill reads by hand (the four mined faces summed)', () => {
  // 7 chased: the 39th (-0.7, +2.8), the 37th (0.0, +13.2, -5.9),
  // the 36th (-0.1), the 34th (-3.3) -> closedIn 4 / gained 2 / flat 1
  const b = chaseBill({ rows: [
    { bot: 'F13', outcome: 'chased', killDelta: -0.7 },
    { bot: 'F4', outcome: 'chased', killDelta: 2.8 },
    { bot: 'F13', outcome: 'chased', killDelta: 0 },
    { bot: 'F7', outcome: 'chased', killDelta: 13.2 },
    { bot: 'F4', outcome: 'chased', killDelta: -5.9 },
    { bot: 'F2', outcome: 'chased', killDelta: -0.1 },
    { bot: 'F7', outcome: 'chased', killDelta: -3.3 },
    { bot: 'F8', outcome: 'reflee', killDelta: 1.2 }
  ] })
  assert.equal(b.chased, 7)
  assert.equal(b.closedIn, 4, 'the speed gap owns the era\u2019s majority')
  assert.equal(b.gained, 2)
  assert.equal(b.flat, 1)
  assert.equal(b.unpriced, 0)
  assert.equal(b.bots.F4, 2, 'the chase\u2019s whale rides both faces')
  assert.equal(b.bots.F7, 2, 'the 37th\u2019s +13.2 and the 34th\u2019s -3.3 are one bot')
})
