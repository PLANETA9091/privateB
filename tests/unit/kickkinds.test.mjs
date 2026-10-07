import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kickKindCensus, kickKindVerdict } from '../../src/lib/kickkinds.mjs'
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

// (v0.763.0) THE KICK KINDS' OWN VERDICT - face 67's own cell: the
// disconnect.timeout monopoly (13 of 13) with the client-stall lever; the
// strict-majority law names it, a tie owns nothing.
test('v0.763.0 the verdict: face 67\'s own cell (disconnect.timeout owns 13 of 13, the client\'s stall is the front)', () => {
  const v = kickKindVerdict({ 'disconnect.timeout': 13 })
  assert.deepEqual(v, { total: 13, topKind: { cls: 'disconnect.timeout', units: 13, shareOfKicks: 1, lever: 'the client\'s own stall is the front' }, bad: 0 })
})

// (v0.763.0) the spread law: a unique max under half still names (7 > 6)
// with the dup lever deferring to the v0.729.0 lane; an exact tie owns
// nothing (the storm-has-no-seat precedent); junk counts are skipped and
// counted.
test('v0.763.0 the spread names a minority-majority + the tie owns nothing + the junk counts', () => {
  const spread = kickKindVerdict({ 'disconnect.timeout': 6, 'multiplayer.disconnect.duplicate_login': 7 })
  assert.equal(spread.topKind.cls, 'multiplayer.disconnect.duplicate_login')
  assert.equal(spread.topKind.lever, 'the duplicate\'s own clock is the front (the v0.729.0 lane prices the cadence)')
  assert.equal(kickKindVerdict({ 'disconnect.timeout': 6, 'multiplayer.disconnect.duplicate_login': 6 }).topKind, null)
  const junk = kickKindVerdict({ 'disconnect.timeout': -1, 'weird.kind': Number.NaN, 'disconnect.timeout': 5 })
  assert.equal(junk.total, 5)
  assert.equal(junk.bad, 1) // the duplicate key collapsed in the literal - the NaN count is the one junk cell
  assert.equal(kickKindVerdict({ a: -2, b: Number.NaN }), null)
  assert.equal(kickKindVerdict(null), null)
  assert.equal(kickKindVerdict({}), null) // the empty mix invents no verdict (the junk law)
  assert.equal(kickKindVerdict({ a: 0 }), null) // a zero-count mix judges nothing (the same honest silence)
})

// (v0.763.0) the WIRING assert: kickKindCensus computes verdict with the
// same one truth from the log's own byte shapes (the two known forms).
test('v0.763.0 the verdict rides the census return additively (WIRING)', () => {
  const LINES = [
    'F3 [F3] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"disconnect.timeout"}}}',
    'F9 [F9] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}',
  ]
  const kk = kickKindCensus(LINES)
  assert.deepEqual(kk.verdict, kickKindVerdict(kk.byKind))
  assert.equal(kk.verdict.total, 2)
  assert.equal(kk.verdict.topKind, null) // 1/1 - a tie owns nothing
  const monopoly = kickKindCensus([
    'F3 [F3] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"disconnect.timeout"}}}',
    'F4 [F4] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"disconnect.timeout"}}}',
  ])
  assert.equal(monopoly.verdict.topKind.cls, 'disconnect.timeout')
  assert.equal(monopoly.verdict.topKind.shareOfKicks, 1)
})

// (v0.763.0) the fallback law: an unknown kind reads the honest fallback
// lever (never invented); the census stays null on a kick-free face.
test('v0.763.0 the unknown kind\'s honest fallback + the kick-free silence', () => {
  const unknown = kickKindVerdict({ 'flying.is.not.enabled.on.this.server': 3 })
  assert.equal(unknown.topKind.lever, 'the kind\'s own detail is the front')
  assert.equal(unknown.topKind.units, 3)
  const bare = kickKindVerdict({ 'disconnect.duplicate_login': 4 })
  assert.equal(bare.topKind.lever, 'the duplicate\'s own clock is the front (the v0.729.0 lane prices the cadence)')
  assert.equal(kickKindCensus(['F1 [F1] water: pass 0 head=dry']), null)
})
