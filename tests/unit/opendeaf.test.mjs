import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePulseAnchor, parseValveClose, parseValveOpen, parseOpenRetry, openDeafCensus,
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

// (v0.439.0) THE RETRY VOICE - the three emitter forms are the code's own
// template literals read verbatim out of deposit.mjs's v0.25.0 loop.
const RETRY_CAUSE = 'F6 [F6] deposit: open attempt 1 timed out (open chest: timeout after 10000ms) at [-136,72,407] - the v0.25.0 retry follows'
const RETRY_WON = 'F6 [F6] deposit: open retry won on attempt 2 at [-136,72,407] (the window opened after the retry)'
const RETRY_LOST = 'F6 [F6] deposit: open retry lost on attempt 2 (open chest: timeout after 10000ms) at [-136,72,407] - the zero follows'

test('open retry rides ALL THREE emitter forms verbatim', () => {
  assert.deepEqual(parseOpenRetry(RETRY_CAUSE), { bot: 'F6', kind: 'cause', chest: '-136,72,407', err: 'open chest: timeout after 10000ms' })
  assert.deepEqual(parseOpenRetry(RETRY_WON), { bot: 'F6', kind: 'won', chest: '-136,72,407', err: null })
  assert.deepEqual(parseOpenRetry(RETRY_LOST), { bot: 'F6', kind: 'lost', chest: '-136,72,407', err: 'open chest: timeout after 10000ms' })
})

test('open retry junk battery: other lanes, no coords, non-string', () => {
  assert.equal(parseOpenRetry('F6 [F6] hop: chest at [-136,72,407] d=13 zero: cannot open chest (open chest: timeout after 10000ms)'), null)
  assert.equal(parseOpenRetry('F6 [F6] deposit: open attempt 1 timed out (err) at ? - the retry follows').chest, null)
  assert.equal(parseOpenRetry('[F6] deposit: open attempt 1 timed out (err) at [-136,72,407] - the retry follows'), null) // no console prefix
  assert.equal(parseOpenRetry(null), null)
})

test('census counts the retry anatomy: cause -> won/lost matched, chests deduped', () => {
  const lines = [
    RETRY_CAUSE,
    RETRY_LOST,
    ZERO, // the lost retry's own zero (same chest)
    RETRY_CAUSE.replace('F6', 'F14').replace('[-136,72,407]', '[-141,72,397]'),
    RETRY_WON.replace('F6', 'F14').replace('[-136,72,407]', '[-141,72,397]'),
  ]
  const c = openDeafCensus(lines)
  assert.deepEqual(c.retries.byKind, { cause: 2, won: 1, lost: 1 })
  assert.deepEqual(c.retries.byBot, { F6: 2, F14: 2 })
  assert.deepEqual(c.retries.chests, ['-136,72,407', '-141,72,397'])
  assert.equal(c.retries.matched, true) // won(1) + lost(1) == cause(2)
  assert.equal(c.openDeaf.length, 1) // only the lost retry's zero is an open-timeout zero
})

test('a cause with no outcome reads matched:false - never assumed', () => {
  const c = openDeafCensus([RETRY_CAUSE])
  assert.deepEqual(c.retries.byKind, { cause: 1, won: 0, lost: 0 })
  assert.equal(c.retries.matched, false)
})

test('a face without retries reads the honest retry zero', () => {
  const c = openDeafCensus([ZERO, ANCHOR_TRUNC])
  assert.deepEqual(c.retries, { n: 0, byKind: { cause: 0, won: 0, lost: 0 }, byBot: {}, chests: [], matched: null })
})

// (v0.444.0) THE OPEN LOST AUTOPSY - the lost open's block identity. The
// emitter (deposit.mjs) speaks exactly once per lost open, right after the
// lost verdict, so the round-trip pins the verbatim field form, the junk
// battery, the byBlock math, and the matchedLost tri-state (the drift
// detector: a lost with no autopsy = the emitter regressed; an autopsy
// with no lost = impossible by construction; both zero = null, never a
// fake consistency verdict).
import { parseOpenAutopsy } from '../../src/lib/opendeaf.mjs'

const AUTOPSY_VERBATIM = 'F6 [F6] deposit: open lost autopsy: block at [-123,72,395] reads chest (a chest reads chest) - the attempts spent, the zero follows'
const AUTOPSY_AIR = 'F18 [F18] deposit: open lost autopsy: block at [-128,72,397] reads air (a chest reads chest) - the attempts spent, the zero follows'
const AUTOPSY_UNLOADED = 'F1 [F1] deposit: open lost autopsy: block at [-133,72,405] reads unloaded (a chest reads chest) - the attempts spent, the zero follows'

test('autopsy parse: the verbatim lost-open identity line (the emitter\'s own form), chest coord grammar, the honest chest/unloaded blocks', () => {
  const a = parseOpenAutopsy(AUTOPSY_VERBATIM)
  assert.deepEqual(a, { bot: 'F6', chest: '-123,72,395', block: 'chest' })
  assert.deepEqual(parseOpenAutopsy(AUTOPSY_AIR), { bot: 'F18', chest: '-128,72,397', block: 'air' })
  assert.deepEqual(parseOpenAutopsy(AUTOPSY_UNLOADED), { bot: 'F1', chest: '-133,72,405', block: 'unloaded' })
  // the '?' chest (the position threw in the emitter) rides null - never a fake coord
  const q = parseOpenAutopsy('F6 [F6] deposit: open lost autopsy: block at ? reads chest (a chest reads chest) - the attempts spent, the zero follows')
  assert.deepEqual(q, { bot: 'F6', chest: null, block: 'chest' })
})

test('autopsy junk battery: the lost verdict, the cause line, prose, non-strings - all null, the lane never borrows', () => {
  assert.equal(parseOpenAutopsy('F6 [F6] deposit: open retry lost on attempt 2 (open chest: timeout after 10000ms) at [-123,72,395] - the zero follows'), null)
  assert.equal(parseOpenAutopsy('F6 [F6] deposit: open attempt 1 timed out (open chest: timeout after 10000ms) at [-123,72,395] - the v0.25.0 retry follows'), null)
  assert.equal(parseOpenAutopsy('   plan top: iron_ingot 157926/0 (0.0%)'), null)
  assert.equal(parseOpenAutopsy('F6 [F6] deposit: open lost autopsy: block at [-123,72,395] reads chest (A CHEST READS CHEST)'), null, 'the parenthetical is the grammar\'s own pin, not prose to flex')
  assert.equal(parseOpenAutopsy(null), null)
  assert.equal(parseOpenAutopsy(42), null)
  assert.equal(parseOpenAutopsy('F6 [F6] deposit: open lost autopsy: block at [-123,72,395] reads chest (a chest reads chest) - tampered tail'), null)
})

test('autopsy census: byBlock math, the chest list, and the matchedLost tri-state against the retry ledger', () => {
  const lost1 = 'F6 [F6] deposit: open retry lost on attempt 2 (open chest: timeout after 10000ms) at [-123,72,395] - the zero follows'
  const lost2 = 'F18 [F18] deposit: open retry lost on attempt 2 (open chest: timeout after 10000ms) at [-128,72,397] - the zero follows'
  const lost3 = 'F1 [F1] deposit: open retry lost on attempt 2 (open chest: timeout after 10000ms) at [-133,72,405] - the zero follows'
  const c = openDeafCensus([lost1, AUTOPSY_VERBATIM, lost2, AUTOPSY_AIR, lost3, AUTOPSY_UNLOADED, ANCHOR_TRUNC])
  assert.equal(c.autopsies.n, 3)
  assert.deepEqual(c.autopsies.byBlock, { chest: 1, air: 1, unloaded: 1 })
  assert.deepEqual(c.autopsies.chests, ['-123,72,395', '-128,72,397', '-133,72,405'])
  assert.equal(c.autopsies.matchedLost, true, '3 lost, 3 autopsies - the emitter held its once-per-lost law')
  assert.equal(c.retries.byKind.lost, 3)
})

test('autopsy matchedLost: the drift legs read honestly - a lost with no autopsy, an autopsy with no lost, and the both-zero null', () => {
  const lost1 = 'F6 [F6] deposit: open retry lost on attempt 2 (open chest: timeout after 10000ms) at [-123,72,395] - the zero follows'
  // lost present, autopsy missing = the emitter regressed - matchedLost false, never assumed
  const drift = openDeafCensus([lost1, ANCHOR_TRUNC])
  assert.equal(drift.autopsies.matchedLost, false)
  // autopsy present, lost absent = impossible by construction - matchedLost false
  const ghost = openDeafCensus([AUTOPSY_VERBATIM, ANCHOR_TRUNC])
  assert.equal(ghost.autopsies.matchedLost, false)
  assert.equal(ghost.retries.byKind.lost, 0)
  // both zero = nothing to match - null, never a fake consistency verdict
  const clean = openDeafCensus([ZERO, ANCHOR_TRUNC])
  assert.equal(clean.autopsies.matchedLost, null)
  assert.equal(clean.autopsies.n, 0)
})
