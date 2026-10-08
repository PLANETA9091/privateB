import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sockLossCensus, sockLossVerdict } from '../../src/lib/sockloss.mjs'

// The era's socket-loss bytes, verbatim from face 89 (run 37715421436):
// every TCP death prints a THREE-part burst - the raw stack header
// ('Error: write EPIPE' + the node internals), then the bot-attributed
// pair ('error:' + its twin 'socket error:'). Face 89 carried 19 losses
// (EPIPE x5 on the kick churn, then a ECONNRESET x14 end-phase storm)
// and no decompose row owned one. The fixture keeps the burst shapes
// byte-exact; the counts stay small and honest.

const KICK_LINE = (b) => `${b} [${b}] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}`
const RAW = (k) => `Error: write ${k}`
const LOSS = (b, k) => `${b} [${b}] error: write ${k}`
const TWIN = (b, k) => `${b} [${b}] socket error: write ${k}`
const FILLER = (i) => `F${(i % 15) + 2} [F${(i % 15) + 2}] water: pass ${i} head=dry shore=hit r=1`

// the face-89 compact: 4 EPIPE losses (the kick churn's residue) + 4
// ECONNRESET losses (the end-phase storm's head), every certificate
// landed, every raw header present.
const F89 = [
  FILLER(1),
  KICK_LINE('F14'), RAW('EPIPE'), LOSS('F14', 'EPIPE'), TWIN('F14', 'EPIPE'),
  FILLER(2),
  KICK_LINE('F10'), RAW('EPIPE'), LOSS('F10', 'EPIPE'), TWIN('F10', 'EPIPE'),
  FILLER(3),
  RAW('EPIPE'), LOSS('F10', 'EPIPE'), TWIN('F10', 'EPIPE'),
  FILLER(4),
  RAW('EPIPE'), LOSS('F2', 'EPIPE'), TWIN('F2', 'EPIPE'),
  FILLER(5),
  RAW('ECONNRESET'), LOSS('F5', 'ECONNRESET'), TWIN('F5', 'ECONNRESET'),
  FILLER(6),
  RAW('ECONNRESET'), LOSS('F19', 'ECONNRESET'), TWIN('F19', 'ECONNRESET'),
  FILLER(7),
  RAW('ECONNRESET'), LOSS('F13', 'ECONNRESET'), TWIN('F13', 'ECONNRESET'),
  FILLER(8),
  RAW('ECONNRESET'), LOSS('F16', 'ECONNRESET'), TWIN('F16', 'ECONNRESET'),
  FILLER(9),
]

test('the face-89 compact: the three-part burst folds once per loss, the reconciles hold', () => {
  const sl = sockLossCensus(F89)
  assert.ok(sl, 'the census opens on the socket-loss face')
  assert.equal(sl.n, 8, 'the twin line is the same loss\'s second certificate, never a second loss')
  assert.deepEqual(sl.byKind, { EPIPE: 4, ECONNRESET: 4 })
  assert.deepEqual(sl.byBot, { F14: 1, F10: 2, F2: 1, F5: 1, F19: 1, F13: 1, F16: 1 })
  assert.deepEqual(sl.kinds, ['ECONNRESET', 'EPIPE'])
  assert.equal(sl.twins.n, 8)
  assert.deepEqual(sl.twins, { n: 8, missing: 0, extra: 0, holds: true }, 'every loss\'s twin landed')
  assert.equal(sl.raw.n, 8, 'every burst\'s raw header counted')
  assert.deepEqual(sl.raw.byKind, { EPIPE: 4, ECONNRESET: 4 })
  assert.equal(sl.raw.blind, 0, 'no raw stack died unattributed on this face')
  assert.equal(sl.total, F89.length)
})

test('the reconciles: a missing twin, an extra twin, and the raw blind class never invent a bot', () => {
  const sl = sockLossCensus([
    RAW('EPIPE'), LOSS('F14', 'EPIPE'), // the twin never landed
    TWIN('F7', 'ECONNRESET'), // a twin without its loss
    RAW('ECONNRESET'), // the raw burst whose bot never named itself
  ])
  assert.equal(sl.n, 1)
  assert.deepEqual(sl.byBot, { F14: 1 }, 'the blind raw never invents a bot')
  assert.deepEqual(sl.twins, { n: 1, missing: 1, extra: 1, holds: false }, 'neither shape is silently absorbed')
  assert.equal(sl.raw.n, 2)
  assert.equal(sl.raw.blind, 1, 'the ECONNRESET raw exceeded its attributed count - the blind class')
})

test('v0.806.0 the seat: the end-phase storm owns the book, the tie owns nothing, the junk never invents', () => {
  const storm = sockLossVerdict({ ECONNRESET: 14, EPIPE: 5 })
  assert.deepEqual(storm, {
    total: 19,
    topKind: {
      cls: 'ECONNRESET',
      units: 14,
      shareOfLosses: 0.737,
      lever: 'the connection\'s own reset - the end-phase teardown\'s signature candidate when the thirds clock rides late',
    },
    bad: 0,
  })
  const residue = sockLossVerdict({ EPIPE: 5, ECONNRESET: 2 })
  assert.equal(residue.topKind.cls, 'EPIPE')
  assert.equal(residue.topKind.lever, 'the write pipe\'s own death - the kick churn\'s residue candidate (the kicked client\'s socket dies writing)')
  assert.equal(sockLossVerdict({ EPIPE: 5, ECONNRESET: 5 }).topKind, null, 'a tie owns nothing (the storm-has-no-seat precedent)')
  assert.equal(sockLossVerdict({ EPIPE: 2, ECONNRESET: 1, ETIMEDOUT: 4 }).topKind.lever, 'the socket kind\'s own detail is the front', 'the unknown kind reads the honest fallback lever (4 of 7 - the strict majority holds)')
  const junk = sockLossVerdict({ EPIPE: -1, ECONNRESET: Number.NaN, EPIPE: 5 })
  assert.equal(junk.total, 5)
  assert.equal(junk.bad, 1, 'the junk counts are skipped and counted - never priced, never silently dropped')
  assert.equal(sockLossVerdict(null), null)
  assert.equal(sockLossVerdict({}), null)
  assert.equal(sockLossVerdict({ EPIPE: 0 }), null, 'a zero-count mix judges nothing')
})

test('v0.806.0 the honest silences + the log\'s own thirds clock + the WIRING', () => {
  assert.equal(sockLossCensus(null), null)
  assert.equal(sockLossCensus(42), null)
  assert.equal(sockLossCensus([]), null)
  assert.equal(sockLossCensus(['F5 [F5] water: pass 3 head=dry', 'Error: ENOTSOCK']), null, 'a non-socket errno byte is not the book')
  const blind = sockLossCensus([RAW('ECONNRESET'), '    at afterWriteDispatched (node:internal/stream_base_commons:159:15)', FILLER(1)])
  assert.ok(blind, 'raw stacks with no attributed owner still speak - the fences never absorb evidence')
  assert.equal(blind.n, 0)
  assert.equal(blind.raw.blind, 1)
  assert.equal(blind.verdict, null, 'the blind raws seat nothing')
  // the thirds edges: a 6-line log - index 2 rides mid (the exact boundary),
  // index 4 rides late.
  const edges = sockLossCensus([
    LOSS('F2', 'EPIPE'), TWIN('F2', 'EPIPE'), // i=0 early
    LOSS('F3', 'EPIPE'), TWIN('F3', 'EPIPE'), // i=2 mid (the exact third boundary)
    LOSS('F4', 'EPIPE'), TWIN('F4', 'EPIPE'), // i=4 late
  ])
  assert.deepEqual(edges.thirds, { early: 1, mid: 1, late: 1 })
  assert.deepEqual(edges.verdict, sockLossVerdict(edges.byKind), 'the seat rides the census return additively (WIRING)')
  assert.equal(edges.verdict.topKind.cls, 'EPIPE', 'three bots, ONE kind - the kind seat reads the monopoly (the bots\' spread is the byBot cells\' own story)')
  assert.equal(edges.verdict.topKind.shareOfLosses, 1)
})
