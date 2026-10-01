import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePulseAnchor, parseValveClose, parseValveOpen, openDeafCensus,
} from '../../src/lib/opendeaf.mjs'

// THE ROUND-TRIP LAW (the walkoutcensus precedent): the test lines are the
// FIELD'S OWN VERBATIM FORMS - both anchor truncations and both valve lines
// are lifted from the held face-28 log (run 36901025087, fleet19.log), so
// the parser can never drift from what the fleet actually prints.

const ANCHOR_TRUNC = 'b] n=3 ts=60s rss=371M late=15ms mainLate=462ms'
const ANCHOR_FULL = '[hb] n=26 ts=521s rss=418M late=129ms mainLate=437ms'
const VALVE_CLOSE = '[allocvalve] CLOSED: path queue 10q sustained 30s (the run101 feeder cut) - long walks refused 12s (strike 1; short walks <= 24b still flow) ts=83s'
const VALVE_OPEN = '[allocvalve] OPEN: rss 376M after closure (strikes 1) - the funnel flows again ts=95s'
const ZERO = 'F6 [F6] hop: chest at [-136,72,407] d=13 zero: cannot open chest (open chest: timeout after 10000ms)'

test('pulse anchor rides BOTH field truncations', () => {
  assert.deepEqual(parsePulseAnchor(ANCHOR_TRUNC), { n: 3, ts: 60, mainLate: 462 })
  assert.deepEqual(parsePulseAnchor(ANCHOR_FULL), { n: 26, ts: 521, mainLate: 437 })
})

test('anchor without a mainLate clause reads null - never a zero lie', () => {
  assert.deepEqual(parsePulseAnchor('b] n=9 ts=180s rss=300M late=5ms'), { n: 9, ts: 180, mainLate: null })
  assert.equal(parsePulseAnchor('mem: heap=118M/153M old=89M'), null)
  assert.equal(parsePulseAnchor(null), null)
  assert.equal(parsePulseAnchor(42), null)
})

test('valve close reads ts + refusedS + strike verbatim', () => {
  assert.deepEqual(parseValveClose(VALVE_CLOSE), { ts: 83, refusedS: 12, strike: 1 })
  assert.equal(parseValveClose('[allocvalve] CLOSED: the worker probe arm'), null) // no ts stamp, no window
  assert.equal(parseValveOpen(VALVE_CLOSE), null) // one parser per emitter
})

test('valve open reads ts + strikes verbatim', () => {
  assert.deepEqual(parseValveOpen(VALVE_OPEN), { ts: 95, strikes: 1 })
  assert.equal(parseValveOpen('[allocvalve] OPEN: the funnel flows again'), null)
})

test('round-trip: the zero between anchors inside a valve window + a late spike is PAIRED', () => {
  const lines = [
    ANCHOR_TRUNC.replace('n=3 ts=60s', 'n=2 ts=40s'), // anchor ts=40, mainLate=462
    VALVE_CLOSE.replace('ts=83s', 'ts=45s'),
    ZERO,
    VALVE_OPEN.replace('ts=95s', 'ts=52s'),
    ANCHOR_TRUNC,
  ]
  const c = openDeafCensus(lines)
  assert.equal(c.anchors.length, 2)
  assert.deepEqual(c.valve.spans, [{ close: 45, open: 52 }])
  assert.equal(c.openDeaf.length, 1)
  const e = c.openDeaf[0]
  assert.equal(e.bot, 'F6')
  assert.equal(e.chest, '-136,72,407')
  assert.deepEqual([e.lo, e.hi], [40, 60])
  assert.equal(e.inValveClose, true)
  assert.equal(e.late, true)
  assert.deepEqual(c.paired, { inValveCloseN: 1, lateN: 1 })
  assert.deepEqual(c.ms, { n: 1, min: 10000, max: 10000, sum: 10000 })
})

test('the zero outside every window is the HYPOTHESIS KILL (definitely-outside semantics)', () => {
  // bracket [40,60] vs span [83,95]: no overlap -> the zero CANNOT sit in
  // the window (the read's kill-power); a low mainLate spikes nothing
  const lines = [
    'b] n=2 ts=40s rss=335M late=10ms mainLate=33ms',
    ZERO,
    'b] n=3 ts=60s rss=371M late=15ms mainLate=61ms',
    VALVE_CLOSE,
    VALVE_OPEN,
  ]
  const c = openDeafCensus(lines)
  assert.deepEqual(c.valve.spans, [{ close: 83, open: 95 }])
  assert.deepEqual(c.paired, { inValveCloseN: 0, lateN: 0 })
  assert.equal(c.openDeaf[0].inValveClose, false)
})

test('an unclosed valve cannot bound its window - counted, never intersected', () => {
  const lines = [
    'b] n=2 ts=40s rss=335M late=10ms mainLate=33ms',
    VALVE_CLOSE.replace('ts=83s', 'ts=45s'),
    ZERO,
    'b] n=3 ts=60s rss=371M late=15ms mainLate=61ms',
  ]
  const c = openDeafCensus(lines)
  assert.equal(c.valve.closes, 1)
  assert.equal(c.valve.opens, 0)
  assert.equal(c.valve.unclosed, 1)
  assert.deepEqual(c.valve.spans, [{ close: 45, open: null }])
  assert.equal(c.paired.inValveCloseN, 0)
})

test('no anchors -> null brackets, nothing claimed', () => {
  const c = openDeafCensus([ZERO, ZERO.replace('F6', 'F14').replace('[-136,72,407] d=13', '[-141,72,397]')])
  assert.equal(c.openDeaf.length, 2)
  for (const e of c.openDeaf) {
    assert.equal(e.lo, null)
    assert.equal(e.hi, null)
    assert.equal(e.inValveClose, false)
    assert.equal(e.late, false)
  }
})

test('honest zeros: a clean face reads zero and a non-array never throws', () => {
  const clean = openDeafCensus(['F9 [F9] hop: chest at [-133,68,419] d=4 zero: nothing to deposit'])
  assert.equal(clean.openDeaf.length, 0)
  assert.deepEqual(clean.paired, { inValveCloseN: 0, lateN: 0 })
  assert.deepEqual(clean.ms, { n: 0, min: 0, max: 0, sum: 0 })
  const junk = openDeafCensus(null)
  assert.equal(junk.openDeaf.length, 0)
  assert.equal(junk.anchors.length, 0)
})

test('determinism: the same lines census to the same bytes', () => {
  const lines = [ANCHOR_TRUNC, VALVE_CLOSE, ZERO, VALVE_OPEN, ANCHOR_FULL]
  assert.equal(JSON.stringify(openDeafCensus(lines)), JSON.stringify(openDeafCensus(lines)))
})
