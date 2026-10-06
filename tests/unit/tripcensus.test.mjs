import { test } from 'node:test'
import assert from 'node:assert/strict'
import { woodTripCensus } from '../../src/lib/tripcensus.mjs'

// Face 26's live shapes verbatim (run 37430980018) - the trip's strict
// byte shape: every famine line (the BEFORE pocket) is answered by the
// same bot's gathered line (the AFTER pocket, the conversion chain's
// tail). The pairing prices the gather walk's own cure rate.
const face26 = () => {
  const lines = new Array(2337).fill('F1 [F1] mem: ok')
  lines[279] = 'F10 wood trip: famine (sticks 5 planks 2 logs 0) - gathering'
  lines[293] = 'F8 wood trip: famine (sticks 0 planks 1 logs 0) - gathering'
  lines[786] = 'F10 wood trip: gathered (sticks 8 planks 14 logs 6)'
  lines[1015] = 'F8 wood trip: gathered (sticks 0 planks 1 logs 0)'
  lines[2032] = 'F8 wood trip: famine (sticks 3 planks 1 logs 0) - gathering'
  lines[2336] = 'F8 wood trip: gathered (sticks 3 planks 15 logs 7)'
  return lines
}

test('woodTripCensus reads face 26 byte-exact: F8 first walk came home FLAT - the drought rides the walk', () => {
  const r = woodTripCensus(face26())
  assert.equal(r.gathered.n, 3)
  assert.deepEqual(r.gathered.byBot, { F10: 1, F8: 2 })
  assert.deepEqual(r.gathered.logsAfter, { min: 0, median: 6, max: 7 })
  // the delivery: F10 +21 cured, F8's first walk +0 FLAT (before 1 -> after
  // 1, 'sticks 0 planks 1 logs 0' - the pocket didn't move), F8's second +21
  assert.deepEqual(r.delivery, {
    n: 3, cured: 2, flat: 1, negative: 0, unread: 0,
    gain: { min: 0, median: 21, max: 21 },
    span: { cured: { min: 304, median: 405.5, max: 507 }, flat: { min: 722, median: 722, max: 722 }, negative: null }
  })
  assert.equal(r.refused.n, 0)
  assert.equal(r.deferred.n, 0)
  assert.equal(r.orphans.n, 0)
})

test('woodTripCensus anatomy split: refusal answers, the negative trip, the unread sentinel, the orphan, the deferral', () => {
  const r = woodTripCensus([
    'F7 wood trip: famine (sticks 0 planks 2 logs 0) - gathering',
    'F7 wood trip: 0 (climb refused)', // answered by refusal: the walk never started
    'F3 wood trip: famine (sticks 2 planks 3 logs 2) - gathering',
    'F3 wood trip: gathered (sticks 1 planks 1 logs 1)', // before 7 -> after 3: the trip ate its own cure (-4)
    'F5 wood trip: famine (sticks 1 planks 1 logs 1) - gathering',
    'F5 wood trip: gathered (sticks -1 planks -1 logs -1)', // the after-pocket sentinel: the pair exists, the mass doesn't
    'F9 wood trip: famine (sticks 0 planks 0 logs 0) - gathering', // never answered: the face cut mid-walk
    'F12 wood trip: deferred night (tod=18000, sticks 1 planks 2 logs 3) - gathering at dawn'
  ])
  assert.equal(r.refused.n, 1)
  assert.deepEqual(r.refused.byBot, { F7: 1 })
  assert.deepEqual(r.delivery, {
    n: 2, cured: 0, flat: 0, negative: 1, unread: 1,
    gain: { min: -4, median: -4, max: -4 },
    span: { cured: null, flat: null, negative: { min: 1, median: 1, max: 1 } }
  })
  // the -1 sentinel never joins the logs-after distribution (the death's byte is not a log count)
  assert.deepEqual(r.gathered.logsAfter, { min: 1, median: 1, max: 1 })
  assert.equal(r.orphans.n, 1)
  assert.equal(r.deferred.n, 1)
})

test('woodTripCensus honest zeros, the lone gathered line, and the junk battery', () => {
  // the calm face: no trip bytes, the honest zero shape
  assert.deepEqual(woodTripCensus([]), {
    gathered: { n: 0, byBot: {}, logsAfter: null },
    delivery: { n: 0, cured: 0, flat: 0, negative: 0, unread: 0, gain: null, span: { cured: null, flat: null, negative: null } },
    refused: { n: 0, byBot: {} },
    deferred: { n: 0 },
    orphans: { n: 0 }
  })
  // a gathered line without a pending famine still counts as a trip byte,
  // but never invents a delivery pair
  const lone = woodTripCensus(['F2 wood trip: gathered (sticks 4 planks 0 logs 0)'])
  assert.equal(lone.gathered.n, 1)
  assert.deepEqual(lone.delivery, { n: 0, cured: 0, flat: 0, negative: 0, unread: 0, gain: null, span: { cured: null, flat: null, negative: null } })
  // junk-safe: non-input reads null (the smeltledger convention)
  assert.equal(woodTripCensus(42), null)
  assert.equal(woodTripCensus(null), null)
  // junk lines inside a live face are skipped, never invented
  const j = woodTripCensus(['wood trip: gathered', 'F1 wood trip: famine', 123])
  assert.equal(j.gathered.n, 0)
  assert.equal(j.delivery.n, 0)
})

test('woodTripCensus reads face 27 byte-exact: both walks cured, the drought lifted this face', () => {
  const lines = new Array(943).fill('F1 [F1] mem: ok')
  lines[268] = 'F7 wood trip: famine (sticks 0 planks 2 logs 0) - gathering'
  lines[364] = 'F9 wood trip: famine (sticks 5 planks 2 logs 0) - gathering'
  lines[630] = 'F9 wood trip: gathered (sticks 5 planks 14 logs 7)'
  lines[942] = 'F7 wood trip: gathered (sticks 4 planks 8 logs 6)'
  const r = woodTripCensus(lines)
  assert.equal(r.gathered.n, 2)
  assert.deepEqual(r.gathered.byBot, { F9: 1, F7: 1 })
  // the cross-bot pairing: F9's answer pairs F9 (not F7's earlier famine)
  assert.deepEqual(r.delivery, {
    n: 2, cured: 2, flat: 0, negative: 0, unread: 0,
    gain: { min: 16, median: 17.5, max: 19 },
    span: { cured: { min: 266, median: 470, max: 674 }, flat: null, negative: null }
  })
  assert.deepEqual(r.gathered.logsAfter, { min: 6, median: 6.5, max: 7 })
  assert.equal(r.orphans.n, 0)
})

test('woodTripCensus reads face 29 byte-exact: the walk\'s cost - the flats burned 485 and 518 lines for nothing', () => {
  // face 29 verbatim (run 37441962855, the v0.690.0 tree's first face):
  // 3 famines, 3 walks ran (0 refusals), 2 came home flat
  const lines = new Array(2387).fill('F1 [F1] mem: ok')
  lines[658] = 'F19 wood trip: famine (sticks 2 planks 2 logs 0) - gathering'
  lines[845] = 'F3 wood trip: famine (sticks 0 planks 3 logs 0) - gathering'
  lines[1143] = 'F19 wood trip: gathered (sticks 2 planks 2 logs 0)'
  lines[1542] = 'F3 wood trip: gathered (sticks 1 planks 21 logs 6)'
  lines[1868] = 'F2 wood trip: famine (sticks 2 planks 3 logs 0) - gathering'
  lines[2386] = 'F2 wood trip: gathered (sticks 2 planks 3 logs 0)'
  const r = woodTripCensus(lines)
  assert.deepEqual(r.delivery, {
    n: 3, cured: 1, flat: 2, negative: 0, unread: 0,
    gain: { min: 0, median: 0, max: 25 },
    span: { cured: { min: 697, median: 697, max: 697 }, flat: { min: 485, median: 501.5, max: 518 }, negative: null }
  })
  assert.equal(r.refused.n, 0)
  assert.equal(r.orphans.n, 0)
})
