//
// kickbill.test.mjs - THE KICK'S OWN CHURN (v0.717.0) unit tests.
// The face lines are byte-verbatim forms from the stored faces (the
// 42nd's own split face - F17's kick-only churn, F11's paired double,
// F5's pure relog), the hand-built censuses price the edge skins the
// era never rode (the kick-only fleet, the churn-free silence). The
// era's face-level read (30 kicks / 7 relogs / 37 churn events, the
// paired 2, the kick-only 6, the repeats owning 33/37 = 89%) rides the
// decompose surface.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kickBill } from '../../src/lib/kickbill.mjs'
import { frozenCensus } from '../../src/lib/frozencensus.mjs'

// The churn's own split through the REAL lens path (the census first),
// the lines byte-verbatim from the 42nd's log: F17 kicked twice (the
// kick-only repeat), F9 kicked once, F11 kicked once AND relogged once
// (the paired double churn), F5 relogged once (the relog-only saver).
const MINI = [
  'F17 [F17] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F17 [F17] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F9 [F9] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F11 [F11] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F11 [F11] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=19 health=20 window=legacy',
  'F5 [F5] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=20 health=20 window=legacy'
]

test('kickBill: the churn\u2019s own split folds through the real lens path (the 42nd\u2019s shape, byte-verbatim lines)', () => {
  const b = kickBill(frozenCensus(MINI))
  assert.ok(b, 'the bill opens on a kick face')
  assert.equal(b.kicks, 4)
  assert.deepEqual(b.kickBots, { F17: 2, F9: 1, F11: 1 })
  assert.equal(b.relogs, 2)
  assert.equal(b.churn, 6, 'the churn is the two lanes\u2019 own traffic joined')
  assert.equal(b.paired.n, 1, 'F11 rode BOTH lanes - the double churn')
  assert.deepEqual(b.paired.byBot, { F11: { kicks: 1, relogs: 1 } })
  assert.equal(b.kickOnly.n, 2)
  assert.deepEqual(b.kickOnly.bots, { F17: 2, F9: 1 })
  assert.equal(b.relogOnly.n, 1)
  assert.deepEqual(b.relogOnly.bots, { F5: 1 })
  assert.equal(b.repeats.n, 2, 'F17 (2 kicks) and F11 (1+1) ride 2+ churn events')
  assert.deepEqual(b.repeats.byBot, { F17: 2, F11: 2 })
  assert.equal(b.repeats.owned, 4)
  assert.ok(Math.abs(b.repeats.share - 4 / 6) < 1e-9, 'the share rides the churn\u2019s own denominator')
})

test('kickBill: the honest silence - a kick-free face never opens the bill', () => {
  const relogOnlyFace = frozenCensus([
    'F5 [F5] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=20 health=20 window=legacy'
  ])
  assert.equal(relogOnlyFace.dupKicks.n, 0)
  assert.equal(kickBill(relogOnlyFace), null, 'a relog-only face stays the relog bill\u2019s own subject')
  assert.equal(kickBill(frozenCensus([])), null, 'a calm face reads the silence')
  assert.equal(kickBill(null), null, 'junk-safe: the null census stays silent')
})

test('kickBill: the kick-only fleet - the churn without the saver reads its real zeros', () => {
  const b = kickBill({ dupKicks: { n: 3, byBot: { F9: 2, F8: 1 } }, relogs: { n: 0, byBot: {} } })
  assert.ok(b, 'the bill opens on kicks alone')
  assert.equal(b.relogs, 0)
  assert.equal(b.churn, 3)
  assert.equal(b.paired.n, 0, 'no bot rode both lanes')
  assert.deepEqual(b.paired.byBot, {})
  assert.equal(b.kickOnly.n, 2)
  assert.deepEqual(b.kickOnly.bots, { F9: 2, F8: 1 })
  assert.equal(b.relogOnly.n, 0, 'the relog-only leg reads its real zero')
  assert.deepEqual(b.relogOnly.bots, {})
  assert.equal(b.repeats.n, 1)
  assert.deepEqual(b.repeats.byBot, { F9: 2 })
  assert.equal(b.repeats.owned, 2)
  assert.ok(Math.abs(b.repeats.share - 2 / 3) < 1e-9)
})

test('kickBill: the 42nd\u2019s full bill by hand - the kick whales, the relog savers, the paired double', () => {
  const face42 = {
    dupKicks: { n: 30, byBot: { F11: 3, F3: 1, F17: 11, F12: 3, F9: 9, F13: 1, F8: 1, F15: 1 } },
    relogs: { n: 7, byBot: { F5: 3, F11: 2, F14: 1, F13: 1 } }
  }
  const b = kickBill(face42)
  assert.equal(b.kicks, 30)
  assert.equal(b.relogs, 7)
  assert.equal(b.churn, 37)
  assert.equal(b.paired.n, 2, 'F11 and F13 rode both lanes')
  assert.deepEqual(b.paired.byBot, { F11: { kicks: 3, relogs: 2 }, F13: { kicks: 1, relogs: 1 } })
  assert.equal(b.kickOnly.n, 6, 'the kick whales stand alone - F17 and F9 never relogged')
  assert.deepEqual(b.kickOnly.bots, { F3: 1, F17: 11, F12: 3, F9: 9, F8: 1, F15: 1 })
  assert.equal(b.relogOnly.n, 2)
  assert.deepEqual(b.relogOnly.bots, { F5: 3, F14: 1 })
  assert.equal(b.repeats.n, 6)
  assert.deepEqual(b.repeats.byBot, { F17: 11, F9: 9, F11: 5, F12: 3, F5: 3, F13: 2 })
  assert.equal(b.repeats.owned, 33)
  assert.ok(Math.abs(b.repeats.share - 33 / 37) < 1e-9, 'the repeats own 33 of 37 churn events (89%)')
})
