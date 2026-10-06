import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kickKindCensus } from '../../src/lib/kickkinds.mjs'
import { frozenCensus } from '../../src/lib/frozencensus.mjs'

// The era's kick bytes, verbatim. The 49th face (run 37535680746)
// carried exactly one kick - the server's own timeout drop, a class
// every cell refused to own. The 48th (run 37530997515) carried nine
// duplicate-login kicks - the churn's own class, already the frozen
// census's subject; the kinds census must reconcile with it.

const F49 = [
  'F10 [F10] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"disconnect.timeout"}}}'
]

const F48 = [
  'F9 [F9] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F19 [F19] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F3 [F3] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F14 [F14] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F3 [F3] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F1 [F1] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F3 [F3] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F8 [F8] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  'F12 [F12] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}'
]

test('the 49th: the timeout kick gets its own kind at last', () => {
  const kk = kickKindCensus(F49)
  assert.ok(kk, 'the census opens on a timeout-kick face')
  assert.equal(kk.n, 1)
  assert.deepEqual(kk.byKind, { 'disconnect.timeout': 1 })
  assert.deepEqual(kk.byBot, { F10: 1 })
  assert.deepEqual(kk.kinds, ['disconnect.timeout'])
  assert.equal(kk.dupN, 0, 'the timeout is not the duplicate class')
})

test('the 48th: nine duplicate-login kicks, the dupKicks reconcile holds', () => {
  const kk = kickKindCensus(F48)
  assert.equal(kk.n, 9)
  assert.deepEqual(kk.byKind, { 'multiplayer.disconnect.duplicate_login': 9 })
  assert.deepEqual(kk.byBot, { F9: 1, F19: 1, F3: 3, F14: 1, F1: 1, F8: 1, F12: 1 })
  assert.equal(kk.dupN, 9)
  const fc = frozenCensus(F48)
  assert.equal(kk.dupN, fc.dupKicks.n, 'the two folds must agree on the dup class')
})

test('the mixed face: both skins counted as different kinds', () => {
  const kk = kickKindCensus([...F49, ...F48])
  assert.equal(kk.n, 10)
  assert.deepEqual(kk.kinds, ['disconnect.timeout', 'multiplayer.disconnect.duplicate_login'])
  assert.equal(kk.dupN, 9, 'the timeout never joins the dup share')
  assert.deepEqual(kk.byBot.F10, 1)
  assert.deepEqual(kk.byBot.F3, 3)
})

test('the honest silences: null shapes and the formless byte', () => {
  assert.equal(kickKindCensus(null), null)
  assert.equal(kickKindCensus(42), null)
  assert.equal(kickKindCensus([]), null)
  assert.equal(kickKindCensus([
    'F5 [F5] water: pass 3 head=dry',
    'F6 [F6] KICKED: some other transport shape entirely'
  ]), null, 'a kick without the translate byte is not a kind - the census reads the byte or nothing')
})
