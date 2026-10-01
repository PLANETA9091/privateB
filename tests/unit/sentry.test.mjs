// (v0.422.0) THE SENTRY LENS - the drowning sentry's per-pass read. These
// pins freeze the emitter's own grammar (miner.mjs's v0.81.0 pass line +
// v0.268.0's o2SensorLabel join), the three land forms (hit / blind
// 'n/a' / ledgered 'name d=N'), the o2 renderer's three shapes (value /
// 'reset(-1)' / '?', the v0.249.0 junk-pin contract), the junk policy
// (one parser per emitter: the rescue verdicts, the frozen physics lines
// and every other lane REJECTED) and the census math (the sight split,
// the o2 arc with the code's own thresholds, the planar spots).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SENTRY_PASS_RE, parseSentryPass, sentryCensus } from '../../src/lib/sentry.mjs'
import { OXYGEN_CRITICAL_LEVEL, OXYGEN_RESCUE_LEVEL } from '../../src/lib/drowning.mjs'

const HIT = 'F12 [F12] water: pass 4 head=dry shore=hit r=3 land=none y=62.1 o2=20 probes=0 at=[-151,62,396]'
const BLIND = 'F7 [F7] water: pass 0 head=wet shore=none land=n/a y=51.1 o2=3 probes=0 at=[-135,51,424]'
const LEDGERED = 'F5 [F5] water: pass 7 head=dry shore=none land=birch_log d=5 y=50.4 o2=19 probes=0 at=[-115,50,397]'

test('pass parse: the verbatim shore-hit form - the r series, the dry-head land=none, the at pin', () => {
  const p = parseSentryPass(HIT)
  assert.ok(p)
  assert.strictEqual(p.bot, 'F12')
  assert.strictEqual(p.pass, 4)
  assert.strictEqual(p.head, 'dry')
  assert.strictEqual(p.shore, 'hit')
  assert.strictEqual(p.r, 3)
  assert.strictEqual(p.landKind, 'none')
  assert.strictEqual(p.landName, null)
  assert.strictEqual(p.landD, null)
  assert.strictEqual(p.y, 62.1)
  assert.deepEqual(p.o2, { kind: 'value', value: 20 })
  assert.strictEqual(p.probes, 0)
  assert.deepEqual(p.at, { x: -151, y: 62, z: 396 })
})

test('pass parse: the verbatim BLIND form - wet head, no shore, no land, the pass-0 re-arm', () => {
  const p = parseSentryPass(BLIND)
  assert.ok(p)
  assert.strictEqual(p.head, 'wet')
  assert.strictEqual(p.shore, 'none')
  assert.strictEqual(p.r, null)
  assert.strictEqual(p.landKind, 'na')
  assert.strictEqual(p.pass, 0)
  assert.deepEqual(p.o2, { kind: 'value', value: 3 })
  assert.deepEqual(p.at, { x: -135, y: 51, z: 424 })
})

test('pass parse: the LEDGERED form - the map names land the shore scan missed (birch_log d=5)', () => {
  const p = parseSentryPass(LEDGERED)
  assert.ok(p)
  assert.strictEqual(p.shore, 'none')
  assert.strictEqual(p.landKind, 'known')
  assert.strictEqual(p.landName, 'birch_log')
  assert.strictEqual(p.landD, 5)
  assert.strictEqual(p.sight, undefined, 'the sight math belongs to the census, never the parse')
})

test('pass parse: the o2 renderer\'s non-numeric shapes - reset(-1) and ? carry kind, never a value', () => {
  const base = 'F9 [F9] water: pass 1 head=wet shore=none land=n/a y=49.0 o2=PROBE probes=0 at=[-100,49,400]'
  const reset = parseSentryPass(base.replace('o2=PROBE', 'o2=reset(-1)'))
  assert.ok(reset)
  assert.deepEqual(reset.o2, { kind: 'reset', value: null }, 'the -1 sentinel is the stale-bar family, not a measurement')
  const unk = parseSentryPass(base.replace('o2=PROBE', 'o2=?'))
  assert.ok(unk)
  assert.deepEqual(unk.o2, { kind: 'unknown', value: null }, 'the v0.249.0 junk pin: a non-number renders ?')
})

test('pass parse: negative y and the tight tail - no trailing junk after the at bracket', () => {
  assert.ok(parseSentryPass('F2 [F2] water: pass 2 head=wet shore=none land=n/a y=-3.5 o2=7 probes=1 at=[-3,-4,5]'))
  assert.strictEqual(parseSentryPass(HIT + ' x'), null, 'a tail past the bracket is junk')
  assert.strictEqual(parseSentryPass(null), null)
  assert.strictEqual(parseSentryPass(42), null)
})

test('junk battery: every other lane\'s water line and the neighboring lenses REJECTED', () => {
  const battery = [
    'F10 [F10] water: rescue complete in 1.3s',
    'F15 [F15] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 6.2s',
    'F10 [F10] water: frozen physics (10 flat passes at y=49.4, o2=20, head WET) - standing down, the reconnect lane owns this',
    'F10 [F10] water: frozen client relog (#1 consecutive) - o2=20 health=20 window=legacy',
    'F7 [F7] climb wet escape: 1 blocks walked (low-o2, walked 1/4)',
    'F17 [F17] climb wet ascend: dug the ceiling water at [-126,54,408] (the vertical digs instead, 1/4)',
    'server guard: losses=0 (window 0/10) relogins=21 probe=n/a dead=no revives=0 restarts=0',
    '   deficits: 100/5 (5.0%)',
    'F8 map trip: gravel',
    'the water: pass of the matter', // prose - the token must lead the grammar
    'F7 [F7] water: pass x head=wet', // a broken pass line is junk, not a parse
    'F7 [F7] water: pass 3 head=soaked shore=none land=n/a y=51.1 o2=3 probes=0 at=[-135,51,424]' // head is an enum
  ]
  for (const line of battery) assert.strictEqual(parseSentryPass(line), null, line)
})

test('census accumulation (hand-counted): 5 lines - the sight split, the r series, the o2 arc, the episodes', () => {
  const lines = [
    HIT, // pass 4, dry, hit r=3, o2=20, at -151,396
    'F12 [F12] water: pass 8 head=dry shore=hit r=1 land=none y=62.0 o2=20 probes=0 at=[-152,62,398]', // hit r=1
    BLIND, // pass 0, wet, blind, o2=3, at -135,424
    LEDGERED, // pass 7, dry, ledgered, o2=19, at -115,397
    'F6 [F6] water: pass 2 head=wet shore=none land=n/a y=52.0 o2=0 probes=0 at=[-134,52,424]' // blind, o2=0
  ]
  const c = sentryCensus(lines)
  assert.strictEqual(c.passes, 5)
  assert.strictEqual(c.episodes, 1, 'exactly one pass-0 line')
  assert.strictEqual(c.passMax, 8)
  assert.deepEqual(c.byHead, { wet: 2, dry: 3 })
  assert.strictEqual(c.shore.hit, 2)
  assert.strictEqual(c.shore.none, 3)
  assert.deepEqual(c.shore.r, { n: 2, max: 3, sum: 4 })
  assert.deepEqual(c.sight, { hit: 2, ledgered: 1, blind: 2 })
  assert.strictEqual(c.land.known, 1)
  assert.deepEqual(c.land.byLand, { birch_log: 1 })
  assert.deepEqual(c.land.d, { n: 1, max: 5, sum: 5 })
  assert.strictEqual(c.land.na, 2)
  assert.strictEqual(c.land.none, 2)
  assert.strictEqual(c.o2.n, 5)
  assert.strictEqual(c.o2.sum, 20 + 20 + 3 + 19 + 0)
  assert.strictEqual(c.o2.min, 0)
  assert.strictEqual(c.o2.max, 20)
  assert.strictEqual(c.o2.at20, 2)
  assert.strictEqual(c.o2.at0, 1)
  assert.strictEqual(c.o2.critical, 2, 'o2 0 and 3 ride OXYGEN_CRITICAL_LEVEL=' + OXYGEN_CRITICAL_LEVEL)
  assert.strictEqual(c.o2.rescueBand, 2, 'the same two ride OXYGEN_RESCUE_LEVEL=' + OXYGEN_RESCUE_LEVEL)
  assert.strictEqual(c.o2.reset, 0)
  assert.strictEqual(c.o2.unknown, 0)
  assert.strictEqual(c.spots.length, 5, 'five distinct planar spots')
  assert.strictEqual(c.unparsed, 0)
})

test('census: the threshold buckets are the code\'s own constants - one truth with drowning.mjs', () => {
  const c = sentryCensus([
    'F6 [F6] water: pass 2 head=wet shore=none land=n/a y=52.0 o2=' + (OXYGEN_CRITICAL_LEVEL + 1) + ' probes=0 at=[-1,52,4]',
    'F6 [F6] water: pass 3 head=wet shore=none land=n/a y=52.0 o2=' + OXYGEN_CRITICAL_LEVEL + ' probes=0 at=[-1,52,4]',
    'F6 [F6] water: pass 4 head=wet shore=none land=n/a y=52.0 o2=' + (OXYGEN_RESCUE_LEVEL + 1) + ' probes=0 at=[-1,52,4]'
  ])
  assert.strictEqual(c.o2.critical, 1, 'exactly at the critical level rides critical; one above does not')
  assert.strictEqual(c.o2.rescueBand, 2, 'the critical read also rides the rescue band')
})

test('census: the same planar spot eats pass after pass - the spot row, y first-seen, bots named', () => {
  const c = sentryCensus([
    'F7 [F7] water: pass 0 head=wet shore=none land=n/a y=51.1 o2=3 probes=0 at=[-134,51,424]',
    'F7 [F7] water: pass 5 head=wet shore=none land=n/a y=52.2 o2=5 probes=0 at=[-134,52,424]',
    'F15 [F15] water: pass 9 head=dry shore=none land=n/a y=52.4 o2=20 probes=0 at=[-134,52,424]'
  ])
  assert.strictEqual(c.spots.length, 1, 'the planar key folds the y drift')
  const sp = c.spots[0]
  assert.strictEqual(sp.key, '-134,424')
  assert.strictEqual(sp.total, 3)
  assert.strictEqual(sp.y, 51.1, 'first-seen altitude rides, later never overwrites')
  assert.deepEqual(sp.bots, { F7: 2, F15: 1 })
})

test('census: the o2 sentinels count themselves, never the value arc', () => {
  const base = 'F9 [F9] water: pass 1 head=wet shore=none land=n/a y=49.0 o2=PROBE probes=0 at=[-100,49,400]'
  const c = sentryCensus([base.replace('o2=PROBE', 'o2=reset(-1)'), base.replace('o2=PROBE', 'o2=?'), HIT])
  assert.strictEqual(c.passes, 3)
  assert.strictEqual(c.o2.n, 1, 'only the numeric read feeds the arc')
  assert.strictEqual(c.o2.sum, 20)
  assert.strictEqual(c.o2.reset, 1)
  assert.strictEqual(c.o2.unknown, 1)
})

test('census: the escape hatch - a pass-shaped line that fails the grammar counts unparsed', () => {
  const c = sentryCensus(['F9 [F9] water: pass broken tail here', HIT, 'F10 [F10] water: rescue complete in 1.3s'])
  assert.strictEqual(c.passes, 1)
  assert.strictEqual(c.unparsed, 1, 'the pass-shaped junk is counted, never silently dropped')
})

test('census: honest zeros - the empty stream and the non-array both read the zero shape', () => {
  const z = sentryCensus([])
  assert.strictEqual(z.passes, 0)
  assert.strictEqual(z.episodes, 0)
  assert.strictEqual(z.passMax, null)
  assert.deepEqual(z.byHead, { wet: 0, dry: 0 })
  assert.deepEqual(z.sight, { hit: 0, ledgered: 0, blind: 0 })
  assert.strictEqual(z.shore.r.max, null)
  assert.strictEqual(z.o2.min, null)
  assert.deepEqual(z.spots, [])
  const e = sentryCensus('not an array')
  assert.strictEqual(e.passes, 0)
})

test('regex export: the token pins the grammar - the bot tag self-matches, the enum tails hold', () => {
  assert.ok(SENTRY_PASS_RE.test(BLIND))
  assert.ok(!SENTRY_PASS_RE.test('F12 [F13] water: pass 4 head=dry shore=hit r=3 land=none y=62.1 o2=20 probes=0 at=[-151,62,396]'), 'the tag must self-match')
  assert.ok(!SENTRY_PASS_RE.test('F7 [F7] water: passes 4 head=dry shore=hit r=3 land=none y=62.1 o2=20 probes=0 at=[-151,62,396]'), 'the token is the singular pass')
})
