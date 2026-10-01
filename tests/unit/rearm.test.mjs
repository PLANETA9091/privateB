// (v0.443.0) THE SAME-TARGET RE-ARM BRAKE - the zero-gain loop's
// cross-episode gate. The pins freeze the brake's own math (the stall
// record, the cooldown verdict, the junk/absence legacy law), the brake
// line's grammar (the emitter's pinned form) and the census's family row
// (per-bot, per-target, the age window).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REARM_COOLDOWN_MS, noteTransitStall, rearmVerdict, parseRearmBrake, rearmCensus } from '../../src/lib/rearm.mjs'

const T0 = 1_000_000

test('round-trip: a fresh stall brakes the same-target re-arm; after the cooldown the honest re-try reads null', () => {
  const ledger = new Map()
  assert.strictEqual(noteTransitStall(ledger, { key: 'oak_log,-143,430', now: T0 }), true)
  const fresh = rearmVerdict(ledger, { key: 'oak_log,-143,430', now: T0 + 20_000 })
  assert.ok(fresh, '20s in is inside the cooldown - braked')
  assert.strictEqual(fresh.ageMs, 20_000)
  assert.strictEqual(fresh.cooldownMs, REARM_COOLDOWN_MS)
  assert.strictEqual(rearmVerdict(ledger, { key: 'oak_log,-143,430', now: T0 + REARM_COOLDOWN_MS }), null, 'at the cooldown the re-arm is honest again')
  assert.strictEqual(rearmVerdict(ledger, { key: 'oak_log,-143,430', now: T0 + REARM_COOLDOWN_MS + 1 }), null)
})

test('the boundary: cooldownMs - 1 is braked, cooldownMs itself is free (the age >= cooldown law)', () => {
  const ledger = new Map()
  noteTransitStall(ledger, { key: 'k', now: T0 })
  assert.ok(rearmVerdict(ledger, { key: 'k', now: T0 + REARM_COOLDOWN_MS - 1 }), 'one ms inside the window still brakes')
  assert.strictEqual(rearmVerdict(ledger, { key: 'k', now: T0 + REARM_COOLDOWN_MS }), null)
})

test('the junk/absence law: no ledger entry, junk types, a future stamp - verdict null, the legacy path byte-identical', () => {
  const empty = new Map()
  assert.strictEqual(rearmVerdict(empty, { key: 'oak_log,-143,430', now: T0 }), null, 'never stalled = never braked (absence is legacy)')
  assert.strictEqual(rearmVerdict(null, { key: 'k', now: T0 }), null)
  assert.strictEqual(rearmVerdict('junk', { key: 'k', now: T0 }), null)
  assert.strictEqual(rearmVerdict(new Map(), { key: null, now: T0 }), null)
  assert.strictEqual(rearmVerdict(new Map(), { key: '', now: T0 }), null)
  assert.strictEqual(rearmVerdict(new Map(), { key: 'k', now: 'junk' }), null)
  assert.strictEqual(rearmVerdict(new Map(), { key: 'k', now: NaN }), null)
  const ledger = new Map()
  noteTransitStall(ledger, { key: 'k', now: T0 })
  assert.strictEqual(rearmVerdict(ledger, { key: 'k', now: T0 - 5 }), null, 'a future stamp is a clock lie - never brake on one')
  assert.strictEqual(noteTransitStall(null, { key: 'k', now: T0 }), false)
  assert.strictEqual(noteTransitStall(ledger, { key: 42, now: T0 }), false)
  assert.strictEqual(noteTransitStall(ledger, { key: 'k', now: 'junk' }), false)
  assert.strictEqual(ledger.size, 1, 'junk notes leave the ledger untouched')
})

test('a second stall re-arms the window (the ledger keeps the LATEST stall - the honest retry that stalls again is braked again)', () => {
  const ledger = new Map()
  noteTransitStall(ledger, { key: 'k', now: T0 })
  noteTransitStall(ledger, { key: 'k', now: T0 + 50_000 }) // after the first cooldown expired, it stalled again
  assert.ok(rearmVerdict(ledger, { key: 'k', now: T0 + 60_000 }), '10s after the SECOND stall - braked again')
  assert.strictEqual(rearmVerdict(ledger, { key: 'k', now: T0 + 95_000 }), null, 'the second window expired')
})

test('distinct targets brake independently (the brake is per-target, never per-bot)', () => {
  const ledger = new Map()
  noteTransitStall(ledger, { key: 'oak_log,-143,430', now: T0 })
  assert.ok(rearmVerdict(ledger, { key: 'oak_log,-143,430', now: T0 + 1000 }), 'the stalled target brakes')
  assert.strictEqual(rearmVerdict(ledger, { key: 'sand,-140,428', now: T0 + 1000 }), null, 'a different approach cell never inherits the verdict')
})

test('the brake line parse: the verbatim emitter form, the junk battery (the launch and stall lines are the other lane\'s)', () => {
  const r = parseRearmBrake('F8 [F8] water: same-target re-arm braked (oak_log at [-143,430] stalled 32s ago - the next proxy or the release owns this swim)')
  assert.ok(r)
  assert.deepEqual(r, { bot: 'F8', land: 'oak_log', x: -143, z: 430, ageSec: 32 })
  assert.strictEqual(parseRearmBrake('F8 [F8] water: transit toward known land (oak_log) at [-143,430] d=11'), null, 'the launch line is the transit census\'s lane')
  assert.strictEqual(parseRearmBrake('F8 [F8] water: transit stalled (d=2 after 15 passes - the walls own this swim; the release takes over)'), null, 'the stall line is the transit census\'s lane')
  assert.strictEqual(parseRearmBrake('F8 [F8] water: same-target re-arm braked (oak_log at [-143,430] stalled 3.5s ago - the next proxy or the release owns this swim)'), null, 'the age is an integer seconds stamp, a float escapes to the hatch')
  assert.strictEqual(parseRearmBrake('F8 [F8] water: same-target re-arm braked (oak_log at [-143,430] stalled 32s ago - WRONG TAIL)'), null)
  assert.strictEqual(parseRearmBrake(null), null)
  assert.strictEqual(parseRearmBrake(42), null)
})

test('the census: the family row hand-counted - per-bot, per-target, the age window, the unparsed hatch', () => {
  const lines = [
    'F8 [F8] water: transit toward known land (oak_log) at [-143,430] d=11',
    'F8 [F8] water: transit stalled (d=2 after 15 passes - the walls own this swim; the release takes over)',
    'F8 [F8] water: same-target re-arm braked (oak_log at [-143,430] stalled 12s ago - the next proxy or the release owns this swim)',
    'F8 [F8] water: same-target re-arm braked (oak_log at [-143,430] stalled 33s ago - the next proxy or the release owns this swim)',
    'F10 [F10] water: same-target re-arm braked (sand at [-141,416] stalled 5s ago - the next proxy or the release owns this swim)',
    'F8 [F8] water: pass 4 head=dry shore=none land=none y=46.0 o2=15 probes=0 at=[-141,54,428]'
  ]
  const c = rearmCensus(lines)
  assert.strictEqual(c.brakes.n, 3)
  assert.strictEqual(c.brakes.byBot.F8, 2)
  assert.strictEqual(c.brakes.byBot.F10, 1)
  assert.strictEqual(c.brakes.age.min, 5)
  assert.strictEqual(c.brakes.age.max, 33)
  assert.strictEqual(c.brakes.age.sum, 50)
  assert.strictEqual(c.targets.length, 2)
  assert.strictEqual(c.targets[0].total, 2, 'the twice-braked oak_log seat leads')
  assert.strictEqual(c.targets[0].x, -143)
  assert.strictEqual(c.targets[0].bots.F8, 2)
  assert.strictEqual(c.unparsed, 0, 'the launch/stall/pass lines are other lanes, not hatch fuel')
  const hatch = rearmCensus(['F8 [F8] water: same-target re-arm braked (GARBAGE)'])
  assert.strictEqual(hatch.brakes.n, 0)
  assert.strictEqual(hatch.unparsed, 1, 'a brake-shaped line the grammar refused counts - never dropped')
  const empty = rearmCensus([])
  assert.strictEqual(empty.brakes.n, 0)
  assert.deepEqual(empty.targets, [])
  const blob = rearmCensus('F10 [F10] water: same-target re-arm braked (gravel at [-115,392] stalled 8s ago - the next proxy or the release owns this swim)')
  assert.strictEqual(blob.brakes.n, 1, 'the raw-text form reads too')
})
