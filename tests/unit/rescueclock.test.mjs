// (v0.431.0) THE RESCUE CLOCK - the rescue lane's price leg. These pins
// freeze the blind bracket's verbatim grammar (the frozen standdown's own
// self-diagnosis: three integer counters + the fixed tail), the duration
// pricing through rescue-ledger.mjs's own classifier (one classifier,
// imported - never forked), the bracketless-standdown shape (the F17
// 17.2s class) and the junk policy (one parser per emitter: the mid-events,
// the pass lines, the start lines all REJECTED).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RESCUE_BLIND_RE, parseRescueBlind, rescueClockCensus } from '../../src/lib/rescueclock.mjs'

const BRACKET = 'F10 [F10] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) [blind: 12 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 8.4s'
const BRACKETLESS = 'F17 [F17] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) in 17.2s'
const COMPLETE = 'F9 [F9] water: rescue complete in 1.3s'
const RELEASED = 'F15 [F15] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 6.2s'
const TIMEOUT = 'F10 [F10] water: rescue timeout (still wet, 141 passes, 0 probes, tail wet/wet/dry) in 25.1s'

test('blind bracket: the face-26 verbatim - the three counters ride, the duration stays outside the parse', () => {
  const b = parseRescueBlind(BRACKET)
  assert.ok(b)
  assert.deepEqual(b, { passes: 12, shoreHits: 0, probes: 0 })
})

test('blind bracket: the non-zero shape - the counters are the emitter\'s own numbers, pinned generically', () => {
  const b = parseRescueBlind('F4 [F4] water: rescue standing down (frozen physics - the walk gate reopens) [blind: 9 passes, 2 shore scans hit, 1 standing probes - no ground truth ever gathered] in 5.0s')
  assert.ok(b)
  assert.deepEqual(b, { passes: 9, shoreHits: 2, probes: 1 })
  assert.ok(RESCUE_BLIND_RE.test(BRACKET))
})

test('blind bracket: the bracketless standdown and the junk battery REJECTED', () => {
  assert.strictEqual(parseRescueBlind(BRACKETLESS), null, 'the bracket prints only when the numbers exist - absence reads null, never zeros')
  const battery = [
    'F1 [F1] water: rescue blind live (pass 3, air=6, no ground truth yet - the climb flies on buoyancy alone)',
    'F12 [F12] water: pass 4 head=dry shore=hit r=3 land=none y=62.1 o2=20 probes=0 at=[-151,62,396]',
    'F8 [F8] water: drowning rescue start (drowning, oxygen 3)',
    'F10 [F10] water: shore pinned (r=1 after 15 passes - the shoreline owns this swim; the release takes over)',
    'server guard: losses=0 (window 0/10) relogins=21 probe=n/a dead=no revives=0 restarts=0',
    'no ground truth ever gathered', // prose - the tail alone is not the bracket
    'F6 [F6] water: transit stalled (d=3 after 17 passes - the walls own this swim; the release takes over)',
    null, 42
  ]
  for (const line of battery) assert.strictEqual(parseRescueBlind(line), null, String(line))
})

test('census accumulation (hand-counted): the four-class mix - durations priced per class, the histogram', () => {
  const c = rescueClockCensus([
    COMPLETE, // complete 1.3
    'F9 [F9] water: rescue complete in 4.4s', // complete 4.4
    RELEASED, // released 6.2
    BRACKET, // frozenStanddown 8.4 + bracket 12/0/0
    TIMEOUT // timeout 25.1
  ])
  assert.strictEqual(c.ends, 5)
  assert.deepEqual(c.byClass, { complete: 2, released: 1, frozenStanddown: 1, timeout: 1 })
  assert.deepEqual(c.durations.complete, { n: 2, sum: 5.7, max: 4.4, unpriced: 0 })
  assert.deepEqual(c.durations.released, { n: 1, sum: 6.2, max: 6.2, unpriced: 0 })
  assert.deepEqual(c.durations.timeout, { n: 1, sum: 25.1, max: 25.1, unpriced: 0 })
  assert.deepEqual(c.durations.frozenStanddown, { n: 1, sum: 8.4, max: 8.4, unpriced: 0 })
  assert.strictEqual(c.blind.lines, 1)
  assert.deepEqual(c.blind.passes, { n: 1, sum: 12, max: 12 })
  assert.strictEqual(c.unparsed, 0)
})

test('census: the full-blind flag - 14 field brackets all read 0/0, the design\'s own receipt', () => {
  const c = rescueClockCensus([
    BRACKET,
    BRACKET.replace('[blind: 12 passes', '[blind: 13 passes'),
    'F4 [F4] water: rescue standing down (frozen physics - the walk gate reopens) [blind: 7 passes, 2 shore scans hit, 0 standing probes - no ground truth ever gathered] in 5.0s'
  ])
  assert.strictEqual(c.blind.lines, 3)
  assert.strictEqual(c.blind.fullBlind, 2, 'the 2/0 line is not full-blind - a shore scan hit once')
  assert.deepEqual(c.blind.shoreHits, { n: 3, sum: 2, max: 2 })
  assert.deepEqual(c.blind.probes, { n: 3, sum: 0, max: 0 })
})

test('census: the bracketless standdown counts itself, its duration still prices', () => {
  const c = rescueClockCensus([BRACKETLESS])
  assert.strictEqual(c.ends, 1)
  assert.strictEqual(c.byClass.frozenStanddown, 1)
  assert.strictEqual(c.blind.bracketlessStanddowns, 1)
  assert.strictEqual(c.blind.lines, 0)
  assert.deepEqual(c.durations.frozenStanddown, { n: 1, sum: 17.2, max: 17.2, unpriced: 0 })
})

test('census: the unpriced shape - the catch-path abort carries no duration by design', () => {
  const c = rescueClockCensus(['F3 [F3] water: rescue aborted (error: the reads went dark)'])
  assert.strictEqual(c.ends, 1)
  assert.strictEqual(c.byClass.abortedError, 1)
  assert.strictEqual(c.durations.abortedError.unpriced, 1, 'counted, never silently averaged away')
  assert.strictEqual(c.durations.abortedError.n, 0)
})

test('census: the escape hatch - a standdown carrying a refused blind: token counts unparsed', () => {
  const c = rescueClockCensus(['F6 [F6] water: rescue standing down (frozen physics) [blind: many passes] in 3.0s'])
  assert.strictEqual(c.ends, 1)
  assert.strictEqual(c.unparsed, 1, 'the bracket-shaped line the grammar refused - counted, never dropped')
})

test('census: honest zeros - the empty stream and the non-array both read the zero shape', () => {
  const z = rescueClockCensus([])
  assert.strictEqual(z.ends, 0)
  assert.deepEqual(z.byClass, {})
  assert.deepEqual(z.blind.passes, { n: 0, sum: 0, max: null })
  assert.strictEqual(z.blind.fullBlind, 0)
  assert.strictEqual(z.blind.bracketlessStanddowns, 0)
  const e = rescueClockCensus('not an array')
  assert.strictEqual(e.ends, 0)
  assert.strictEqual(e.unparsed, 0)
})

test('census: the float tail pins - one decimal or none, the parser takes the emitter\'s own shapes', () => {
  const c = rescueClockCensus(['F2 [F2] water: rescue complete in 0.0s', 'F2 [F2] water: rescue complete in 3s'])
  assert.strictEqual(c.durations.complete.n, 2, 'the loose tail still reads - the emitter never prints it, the ledger\'s own rescueEndSeconds law')
  assert.strictEqual(c.durations.complete.sum, 3)
})
