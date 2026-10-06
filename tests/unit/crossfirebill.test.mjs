//
// crossfirebill.test.mjs - THE CROSSFIRE'S OWN BILL (v0.714.0) unit tests.
// The face lines are byte-verbatim forms from the stored faces (the
// 40th's own crossfire pair - F5 fled a skeleton, died to a Zombie;
// F7 fled a zombie, died to a Skeleton), the hand-built rows price the
// edge skins the era never rode (the unnamed second hostile, the crowd
// skin, the explosion family's kind head). The era's face-level reads
// (the 40th crossfire 2 solo 2; the 36th/37th/39th the honest silence)
// ride the decompose surface.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crossfireBill } from '../../src/lib/crossfirebill.mjs'
import { fleeLedger } from '../../src/lib/fleeledger.mjs'

// The debut pair through the REAL lens path (fleeLedger first), the
// lines byte-verbatim from the 40th's log: the exit ran into the second
// hostile's reach while the fled threat never closed (killDelta stays
// null on both rows - the geometry bill's own law).
const MINI = [
  'F5 [F5] combat: fleeing skeleton (dist 8.7, hp 5.0, 1 nearby, sentry)',
  'F5 [F5] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.5 (0s before death at [-72,64,406]) [the inference corroborates the server verdict])',
  'F7 [F7] combat: fleeing zombie (dist 5.2, hp 5.7, 1 nearby, proximity)',
  'F7 [F7] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: spider@1.2 (0s before death at [-133,64,444]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])'
]

test('crossfireBill: the debut pair folds through the real lens path (the 40th, byte-verbatim)', () => {
  const b = crossfireBill(fleeLedger(MINI))
  assert.ok(b, 'the bill opens on a crossfire face')
  assert.equal(b.n, 2)
  assert.deepEqual(b.byKiller, { Zombie: 1, Skeleton: 1 }, 'the second hostile\u2019s server token, the authority')
  assert.deepEqual(b.byMob, { skeleton: 1, zombie: 1 }, 'the fled threat\u2019s own split')
  assert.deepEqual(b.byKind, { mob: 2 }, 'the kind\u2019s head word - the full token rides the killer\u2019s name')
  assert.deepEqual(b.crowd, { solo: 2, crowd: 0, unpriced: 0 }, 'the 40th\u2019s crossfire rode solo (nearby 1)')
  assert.equal(b.unpricedKiller, 0)
  assert.deepEqual(b.bots, { F5: 1, F7: 1 })
})

test('crossfireBill: the honest silences (junk, empty, crossfire-free)', () => {
  assert.equal(crossfireBill(), null, 'no arg')
  assert.equal(crossfireBill(null), null)
  assert.equal(crossfireBill('junk'), null)
  assert.equal(crossfireBill({}), null, 'no rows field')
  assert.equal(crossfireBill({ rows: 'junk' }), null, 'rows must be an array')
  assert.equal(crossfireBill({ rows: [] }), null, 'an empty face opens no bill')
  const noDeath = fleeLedger([
    'F10 [F10] combat: fleeing zombie (dist 11.4, hp 7.7, 1 nearby, sentry)',
    'F10 [F10] combat: fight ended vs zombie (mob down, hp 7.7 -> 9.0, swings 4, weapon wooden_sword, 4 rounds)'
  ])
  assert.equal(crossfireBill(noDeath), null, 'a face where nobody died mid-flee stays silent')
  const chasedOnly = fleeLedger([
    'F13 [F13] combat: fleeing zombie (dist 0.6, hp 9.0, 1 nearby, proximity)',
    'F13 [F13] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.6 (0s before death at [-160,62,403]) [the inference corroborates the server verdict])'
  ])
  assert.equal(crossfireBill(chasedOnly), null, 'a chased-only face is the chase bill\u2019s subject, not ours')
})

test('crossfireBill: the edge skins the era never rode (hand-built rows)', () => {
  const b = crossfireBill({ rows: [
    { bot: 'F3', outcome: 'crossfire', mob: 'spider', killer: null, deathKind: 'mob', nearby: null },
    { bot: 'F9', outcome: 'crossfire', mob: 'skeleton', killer: 'Creeper', deathKind: 'explosion by Creeper', nearby: 2 },
    { bot: 'F4', outcome: 'chased', mob: 'zombie', killer: 'Zombie', deathKind: 'mob by Zombie', nearby: 1 }
  ] })
  assert.ok(b)
  assert.equal(b.n, 2, 'only the crossfire rows bill')
  assert.equal(b.unpricedKiller, 1, 'the unnamed second hostile rides the honest audit row')
  assert.deepEqual(b.byKiller, { Creeper: 1 })
  assert.deepEqual(b.byMob, { spider: 1, skeleton: 1 })
  assert.deepEqual(b.byKind, { mob: 1, explosion: 1 }, 'the kind head splits the families')
  assert.deepEqual(b.crowd, { solo: 0, crowd: 1, unpriced: 1 }, 'the crowd sensor\u2019s three skins')
  assert.deepEqual(b.bots, { F3: 1, F9: 1 })
})

test('crossfireBill: the era\u2019s own bill reads by hand (the 40th + the silent faces)', () => {
  // The 40th: crossfire 2 (F5 zombie-kill while fleeing a skeleton,
  // F7 skeleton-kill while fleeing a zombie), both solo (nearby 1).
  const b = crossfireBill({ rows: [
    { bot: 'F5', outcome: 'crossfire', mob: 'skeleton', killer: 'Zombie', deathKind: 'mob by Zombie', nearby: 1 },
    { bot: 'F7', outcome: 'crossfire', mob: 'zombie', killer: 'Skeleton', deathKind: 'mob by Skeleton', nearby: 1 },
    { bot: 'F11', outcome: 'chased', mob: 'skeleton', killer: 'Skeleton', deathKind: 'mob by Skeleton', nearby: 3 },
    { bot: 'F6', outcome: 'reflee', mob: 'skeleton', killer: null, deathKind: null, nearby: 1 }
  ] })
  assert.equal(b.n, 2)
  assert.deepEqual(b.byKiller, { Zombie: 1, Skeleton: 1 })
  assert.deepEqual(b.crowd, { solo: 2, crowd: 0, unpriced: 0 })
  assert.deepEqual(b.bots, { F5: 1, F7: 1 })
  // the 36th/37th/39th rode zero crossfire deaths - the honest silence
  assert.equal(crossfireBill({ rows: [
    { bot: 'F2', outcome: 'chased', killDelta: -0.1 },
    { bot: 'F4', outcome: 'chased', killDelta: -5.9 }
  ] }), null, 'a chased-heavy crossfire-free face stays silent')
})
