// (v0.412.0) THE DROP-WALK LENS's tests - the vein sweep's per-fail drop-walk
// line. The verbatims are the face-26 log's own shapes (36864564525) plus the
// run68-era 4000ms form (the budget's evolution is data, not a constant) and
// the unit-test-pinned no-spot doomed form. The junk battery rejects the
// aggregate ledger row (drops.mjs's own counter), the smelt sweep verdict
// (walkfail.mjs's lane) and the prose lines - one parser per emitter, the
// v0.409.0 split law.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DROP_WALK_FAIL_RE, classifyDropFailWhy, parseDropWalkFail, dropWalkCensus, dropWalkVerdict, dropWalkVerdictRow } from '../../src/lib/dropwalk.mjs'

test('drop-walk: the face-26 timeout verbatim parses bot, spot, ms, dy, range', () => {
  const a = parseDropWalkFail('F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)')
  assert.equal(a.bot, 'F7')
  assert.deepEqual([a.x, a.y, a.z], [-136, 46, 414])
  assert.equal(a.why, 'timeout')
  assert.equal(a.timeoutMs, 8000)
  assert.equal(a.dy, 3.0)
  assert.equal(a.range, 2)

  // the run68-era form carried the OLD 4000ms budget - the field is read,
  // never the constant (v0.288.0 moved the emitter's own value)
  const b = parseDropWalkFail('F2 [F2] vein sweep: the drop walk to [-125,45,411] failed - sweep drops: timeout after 4000ms (dy 2.2, range 2)')
  assert.equal(b.timeoutMs, 4000)
  assert.equal(b.dy, 2.2)

  // range 1 with a negative dy - the below family on the tight goal
  const c = parseDropWalkFail('F2 [F2] vein sweep: the drop walk to [-129,42,408] failed - sweep drops: timeout after 4000ms (dy -0.4, range 1)')
  assert.equal(c.range, 1)
  assert.equal(c.dy, -0.4)
})

test('drop-walk: the doomed-goal form captures the age and the optional spot', () => {
  const a = parseDropWalkFail('F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2)')
  assert.equal(a.bot, 'F9')
  assert.equal(a.why, 'doomed')
  assert.equal(a.doomedAgeS, 44)
  assert.deepEqual(a.doomedSpot, { x: -143, y: 56, z: 419 })

  // the no-spot variant (the unit-pinned shape - a young doom has no spot yet)
  const b = parseDropWalkFail('F14 [F14] vein sweep: the drop walk to [-136,47,415] failed - doomed goal (ledgered 5s ago) - sweep drops refused (dy -1.0, range 2)')
  assert.equal(b.why, 'doomed')
  assert.equal(b.doomedAgeS, 5)
  assert.equal(b.doomedSpot, null)
})

test('drop-walk: the fleet-goal-ceiling form captures goals, window and the refusal seconds', () => {
  const a = parseDropWalkFail('F5 [F5] vein sweep: the drop walk to [-113,41,430] failed - fleet goal ceiling: 30 goals fleet-wide in 5s - sweep drops refused for 14s (dy -2.0, range 2)')
  assert.equal(a.bot, 'F5')
  assert.equal(a.why, 'ceiling')
  assert.equal(a.ceilingGoals, 30)
  assert.equal(a.ceilingWindowS, 5)
  assert.equal(a.refusedS, 14)
})

test('drop-walk: the classifier battery - the unknown verdict stays honest as other', () => {
  assert.equal(classifyDropFailWhy('sweep drops: timeout after 8000ms').why, 'timeout')
  assert.equal(classifyDropFailWhy('doomed goal (ledgered 7s ago) - sweep drops refused').why, 'doomed')
  assert.equal(classifyDropFailWhy('fleet goal ceiling: 30 goals fleet-wide in 5s - sweep drops refused for 4s').why, 'ceiling')
  // the water-rescue form is the field's fourth shape (face 26 line 1874) -
  // the bot's own rescue holds the controls, the drop walks ride it out
  assert.equal(classifyDropFailWhy('water rescue in progress (sweep drops refused)').why, 'water-rescue')
  // the bare no-path verdict is the field's fifth shape (face 27, F17 r1)
  assert.equal(classifyDropFailWhy('No path to the goal!').why, 'no-path')
  const o = classifyDropFailWhy('some future verdict the walk layer invented')
  assert.equal(o.why, 'other')
  assert.equal(classifyDropFailWhy(null).why, 'other')
  assert.equal(classifyDropFailWhy(undefined).why, 'other')
  assert.equal(classifyDropFailWhy(42).why, 'other')
})

test('drop-walk: the regex rejects the tail-less and the malformed lines', () => {
  assert.equal(DROP_WALK_FAIL_RE.test('F14 [F14] vein sweep: the drop walk to [-136,47,415] failed - doomed goal (ledgered 5s ago) - sweep drops refused'), false)
  assert.equal(DROP_WALK_FAIL_RE.test('F7 vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)'), false)
  assert.equal(DROP_WALK_FAIL_RE.test('vein sweep: 2 drop(s) in reach (2 dug)'), false)
  assert.equal(parseDropWalkFail('F7 [F7] vein sweep: the drop walk to [x,y,z] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)'), null)
  assert.equal(parseDropWalkFail(null), null)
  assert.equal(parseDropWalkFail(1234), null)
})

test('drop-walk: the junk battery - the sibling lanes and the prose stay out', () => {
  assert.equal(parseDropWalkFail('sweep drop ledger: sweeps=14 picked=66u failed=29 (below x12, plane x4, above x13) deepSkip=16 lipDig=0 supportDig=0 seal1=0 seal2=0 seal3=6 near=2 far=4 cut=0 nthick=0 nthin=0 ngap=2 step=0 stepcut=0 above1=5 aboveHigh=8'), null)
  assert.equal(parseDropWalkFail('F5 sweep: 0 collected - machine unreachable (walk to a machine (sweep): timeout after 4659ms) x1'), null)
  assert.equal(parseDropWalkFail('F7 [F7] vein sweep: +2u walked from the drops (2 dug)'), null)
  assert.equal(parseDropWalkFail('F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2) and prose rode along'), null)
  assert.equal(parseDropWalkFail('F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back'), null)
  assert.equal(parseDropWalkFail('F8 [F8] hop: chest at [-118,65,412] d=17 zero: chest unreachable (walk to chest (retry): timeout after 30000ms)'), null)
})

test('census: the accumulation over a mixed stream sums bots, whys, timeouts, dy families', () => {
  const lines = [
    'F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)',
    'F7 [F7] vein sweep: the drop walk to [-136,47,415] failed - sweep drops: timeout after 8000ms (dy 4.4, range 2)',
    'F10 [F10] vein sweep: the drop walk to [-125,45,412] failed - sweep drops: timeout after 8000ms (dy 2.0, range 2)',
    'F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2)',
    'F5 [F5] vein sweep: the drop walk to [-113,41,430] failed - fleet goal ceiling: 30 goals fleet-wide in 5s - sweep drops refused for 14s (dy -2.0, range 2)',
    'F2 [F2] vein sweep: the drop walk to [-129,42,408] failed - sweep drops: timeout after 4000ms (dy -0.4, range 1)'
  ]
  const c = dropWalkCensus(lines)
  assert.equal(c.fails, 6)
  assert.deepEqual(c.byBot, { F7: 2, F10: 1, F9: 1, F5: 1, F2: 1 })
  assert.deepEqual(c.byWhy, { timeout: 4, doomed: 1, ceiling: 1 })
  assert.deepEqual(c.timeouts, { n: 4, maxMs: 8000, sumMs: 28000, walked0: 0, moved1: 0, walkedNull: 4, maxWalked: null })
  assert.deepEqual([c.doomed.n, c.doomed.maxAgeS, c.doomed.withSpot], [1, 44, 1])
  assert.deepEqual([c.ceiling.n, c.ceiling.maxGoals, c.ceiling.maxRefusedS], [1, 30, 14])
  assert.equal(c.dy.min, -2.0)
  assert.equal(c.dy.max, 4.4)
  assert.deepEqual([c.dy.below, c.dy.plane, c.dy.above], [3, 0, 3])
  assert.deepEqual(c.range, { 2: 5, 1: 1 })
  assert.equal(c.unparsed, 0)
})

test('census: the unknown verdict counts in fails and byWhy other - never dropped', () => {
  const c = dropWalkCensus([
    'F3 [F3] vein sweep: the drop walk to [-100,40,400] failed - some future verdict (dy 0.0, range 2)'
  ])
  assert.equal(c.fails, 1)
  assert.deepEqual(c.byWhy, { other: 1 })
  assert.equal(c.dy.plane, 1)
  assert.equal(c.timeouts.n, 0)
})

test('census: the unparsed escape hatch - a built-for line whose shape escaped', () => {
  const c = dropWalkCensus([
    'F8 [F8] vein sweep: the drop walk to [-110,41,448] failed - sweep drops: timeout after 8000ms without the dy tail',
    'F1 [F1] vein sweep: 3 drop(s) in reach (3 dug)'
  ])
  assert.equal(c.fails, 0)
  assert.equal(c.unparsed, 1)
})

test('census: the honest zeros and the honest empty anatomy', () => {
  const c = dropWalkCensus(['F1 [F1] heartbeat alive', 'calm face - no drop walks died here'])
  assert.equal(c.fails, 0)
  assert.deepEqual(c.byBot, {})
  assert.deepEqual(c.byWhy, {})
  assert.deepEqual(c.timeouts, { n: 0, maxMs: 0, sumMs: 0, walked0: 0, moved1: 0, walkedNull: 0, maxWalked: null })
  assert.deepEqual([c.doomed.n, c.doomed.withSpot], [0, 0])
  assert.deepEqual([c.ceiling.n, c.ceiling.maxGoals], [0, 0])
  assert.equal(c.dy.min, null)
  assert.equal(c.dy.max, null)
  assert.deepEqual([c.dy.below, c.dy.plane, c.dy.above], [0, 0, 0])
  assert.deepEqual(c.range, {})
  assert.equal(c.unparsed, 0)
  const e = dropWalkCensus('not an array')
  assert.equal(e.fails, 0)
  assert.deepEqual(e.range, {})
})

// (v0.415.0) THE DROP CLOCK - the fail cohort's WHEN (the walkfail/bankfail
// v0.413.0 pattern): every parsed fail stamps its line's hb moment; a fail
// before the first heartbeat stays untimed - the stamp never invents.
test('drop clock: interleaved heartbeats stamp every fail - burst over the 30s window', () => {
  const c = dropWalkCensus([
    '[workerguard] b] n=1 ts=100s rss=300M late=0ms mainLate=0ms',
    'F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)',
    '[workerguard] b] n=2 ts=110s rss=310M late=0ms mainLate=0ms',
    'F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2)',
    '[workerguard] b] n=3 ts=120s rss=320M late=0ms mainLate=0ms',
    'F17 [F17] vein sweep: the drop walk to [-122,55,408] failed - No path to the goal! (dy -0.4, range 1)',
    '[workerguard] b] n=4 ts=150s rss=330M late=0ms mainLate=0ms',
    'F10 [F10] vein sweep: the drop walk to [-125,45,412] failed - sweep drops: timeout after 8000ms (dy 2.0, range 2)',
    '[workerguard] b] n=5 ts=160s rss=340M late=0ms mainLate=0ms'
  ])
  // by hand: stamps 100,110,120,150 - clockEnd 160. Window 30s exclusive:
  // [100]=1, [100,110]=2, [100,110,120]=3, at 150 both 100 (50>30) and 110
  // (40>30) fall out, 150-120=30 is NOT >30 -> [120,150]=2. Max burst 3.
  assert.equal(c.fails, 4)
  assert.deepEqual(c.clock, {
    timed: 4,
    untimed: 0,
    clockEnd: 160,
    firstTs: 100,
    lastTs: 150,
    maxBurst: 3,
    burstWindowS: 30
  })
})

test('drop clock: a fail before the first heartbeat stays untimed - never invented', () => {
  const c = dropWalkCensus([
    'F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)',
    '[workerguard] b] n=1 ts=50s rss=300M late=0ms mainLate=0ms',
    'F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago) - sweep drops refused (dy -2.0, range 2)',
    '[workerguard] b] n=2 ts=60s rss=310M late=0ms mainLate=0ms'
  ])
  assert.equal(c.fails, 2)
  assert.equal(c.clock.timed, 1)
  assert.equal(c.clock.untimed, 1)
  assert.equal(c.clock.firstTs, 50)
  assert.equal(c.clock.lastTs, 50)
  assert.equal(c.clock.clockEnd, 60)
  assert.equal(c.clock.maxBurst, 1)
})

// (v0.418.0) THE WALKED LEG - the timeout anatomy's first split. The emit
// site appends the displacement across the failed try (', walked X.X'); the
// legacy two-field tail parses byte-identically with walked null - the
// stamp never invents.
test('walked: the three-field tail parses the displacement; the legacy tail reads null', () => {
  // the verbatim shape the v0.418.0 emitter now prints (stuck class)
  const a = parseDropWalkFail('F2 [F2] vein sweep: the drop walk to [-132,46,408] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2, walked 0.0)')
  assert.equal(a.why, 'timeout')
  assert.equal(a.timeoutMs, 8000)
  assert.equal(a.walked, 0)
  // the route class - the bot moved but never arrived (one-decimal form)
  const b = parseDropWalkFail('F5 [F5] vein sweep: the drop walk to [-145,56,425] failed - sweep drops: timeout after 8000ms (dy 1.5, range 2, walked 2.5)')
  assert.equal(b.walked, 2.5)
  // the integer form (toFixed prints X.X, but the field is data - read it)
  const c = parseDropWalkFail('F17 [F17] vein sweep: the drop walk to [-127,42,411] failed - sweep drops: timeout after 8000ms (dy -2.0, range 1, walked 3)')
  assert.equal(c.walked, 3)
  // a refusal can carry the field too (the caller measures unconditionally)
  const d = parseDropWalkFail('F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2, walked 0.0)')
  assert.equal(d.why, 'doomed')
  assert.equal(d.walked, 0)
  // the legacy two-field tail - every pre-0.418.0 tree, walked null
  const legacy = parseDropWalkFail('F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)')
  assert.equal(legacy.walked, null)
})

test('walked: the census splits TIMEOUTS only - a refusal walked 0.0 stays out', () => {
  const c = dropWalkCensus([
    'F2 [F2] vein sweep: the drop walk to [-132,46,408] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2, walked 0.0)',
    'F2 [F2] vein sweep: the drop walk to [-130,46,407] failed - sweep drops: timeout after 8000ms (dy 2.0, range 2, walked 0.4)',
    'F1 [F1] vein sweep: the drop walk to [-158,53,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2, walked 2.5)',
    'F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2, walked 0.0)',
    'F1 [F1] vein sweep: the drop walk to [-155,45,416] failed - sweep drops: timeout after 4000ms (dy 1.0, range 2)'
  ])
  assert.equal(c.fails, 5)
  assert.equal(c.timeouts.n, 4)
  // by hand: 0.0 and 0.4 are below the walkgovernor's own 1.0 progress law
  // (stuck x2), 2.5 moved (x1), the last timeout rides the legacy tail
  // (walkedNull x1). The doomed refusal's walked 0.0 MUST NOT feed the
  // split - the bot never had a chance to move.
  assert.deepEqual([c.timeouts.walked0, c.timeouts.moved1, c.timeouts.walkedNull], [2, 1, 1])
  assert.equal(c.timeouts.maxWalked, 2.5)
  assert.deepEqual(c.byWhy, { timeout: 4, doomed: 1 })
})

test('walked: a junk walked field rejects the whole line - the escape hatch owns it', () => {
  const c = dropWalkCensus([
    'F5 [F5] vein sweep: the drop walk to [-139,62,427] failed - sweep drops: timeout after 8000ms (dy 2.0, range 2, walked lots)',
    'F5 [F5] vein sweep: the drop walk to [-145,55,426] failed - sweep drops: timeout after 8000ms (dy 2.0, range 2, walked 1.2.3)'
  ])
  assert.equal(c.fails, 0)
  assert.equal(c.unparsed, 2)
})

test('drop clock: no heartbeats - every fail untimed, clockEnd null; non-array input honest', () => {
  const c = dropWalkCensus([
    'F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)',
    'F2 [F2] vein sweep: the drop walk to [-129,42,408] failed - sweep drops: timeout after 4000ms (dy -0.4, range 1)'
  ])
  assert.equal(c.fails, 2)
  assert.deepEqual([c.clock.timed, c.clock.untimed], [0, 2])
  assert.equal(c.clock.clockEnd, null)
  assert.equal(c.clock.firstTs, null)
  assert.equal(c.clock.maxBurst, 0)
  const e = dropWalkCensus('not an array')
  assert.deepEqual([e.clock.timed, e.clock.clockEnd], [0, null])
})

// (v0.420.0) THE NOPATH GOAL ROW - the no-path verdict's own detail leg. The
// F17 anomaly (face 27: the fleet's ONLY no-path, 3 of the 9 fails) proved
// the byWhy count alone cannot name WHERE the walk layer proves dead
// geometry - the goal coordinate rides every fail line already, the census
// keeps it now (dedup'd first-seen, NOPATH_GOAL_CAP belt).
test('no-path: the goal row counts and dedups the A*-proved dead goals', () => {
  const c = dropWalkCensus([
    // the face-27 verbatim (F17 r1): the terrace goal beside the live water
    // column [-126,53..54,407..408]
    'F17 [F17] vein sweep: the drop walk to [-122,55,408] failed - No path to the goal! (dy -0.4, range 1)',
    // the same sphere re-proved from another stance - deduped, n counts both
    'F17 [F17] vein sweep: the drop walk to [-122,55,408] failed - No path to the goal! (dy -0.4, range 1)',
    // a second dead sphere from a different bot
    'F4 [F4] vein sweep: the drop walk to [-110,45,396] failed - No path to the goal! (dy 0.0, range 1)'
  ])
  assert.equal(c.fails, 3)
  assert.equal(c.nopath.n, 3)
  assert.deepEqual(c.nopath.goals, ['[-122,55,408]', '[-110,45,396]'])
  // first-seen order survives a later repeat
  assert.equal(c.nopath.goals[0], '[-122,55,408]')
})

test('no-path: honest zero without the shape; the cap keeps the newest 24', () => {
  const c = dropWalkCensus([
    'F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)',
    'F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2)'
  ])
  assert.equal(c.nopath.n, 0)
  assert.deepEqual(c.nopath.goals, [])
  // 26 distinct dead spheres - the belt drops the OLDEST two (first-seen)
  const lines = []
  for (let i = 0; i < 26; i++) {
    lines.push(`F${(i % 19) + 1} [F${(i % 19) + 1}] vein sweep: the drop walk to [-1${i},45,40${i % 10}] failed - No path to the goal! (dy 0.0, range 1)`)
  }
  const capped = dropWalkCensus(lines)
  assert.equal(capped.nopath.n, 26)
  assert.equal(capped.nopath.goals.length, 24)
  // by hand: i=0 ('-10') and i=1 ('-11') fell off the front, i=2 leads
  assert.equal(capped.nopath.goals[0], '[-12,45,402]')
  assert.equal(capped.nopath.goals[23], '[-125,45,405]')
})

test('no-path: the face-27 anomaly battery reproduces by hand - 9 fails, F17 leads, one dead sphere', () => {
  // the face's own 9 drop-walk fails, in log order (lines 490..798):
  // F17 no-path + doomed (the ledger echo, 0s), F11 x2, F13 x2, F17 timeout,
  // F10 timeout + doomed - the anomaly's exact shape
  const c = dropWalkCensus([
    'F17 [F17] vein sweep: the drop walk to [-122,55,408] failed - No path to the goal! (dy -0.4, range 1)',
    'F17 [F17] vein sweep: the drop walk to [-122,53,407] failed - doomed goal (ledgered 0s ago at [-122,53,407]) - sweep drops refused (dy -2.0, range 2)',
    'F11 [F11] vein sweep: the drop walk to [-133,48,408] failed - sweep drops: timeout after 8000ms (dy -1.0, range 2)',
    'F11 [F11] vein sweep: the drop walk to [-132,47,408] failed - sweep drops: timeout after 8000ms (dy -1.8, range 2)',
    'F13 [F13] vein sweep: the drop walk to [-130,46,407] failed - sweep drops: timeout after 8000ms (dy 1.0, range 2)',
    'F17 [F17] vein sweep: the drop walk to [-127,55,411] failed - sweep drops: timeout after 8000ms (dy 0.0, range 1)',
    'F13 [F13] vein sweep: the drop walk to [-129,46,406] failed - sweep drops: timeout after 8000ms (dy 1.0, range 2)',
    'F10 [F10] vein sweep: the drop walk to [-132,47,409] failed - sweep drops: timeout after 8000ms (dy 0.0, range 1)',
    'F10 [F10] vein sweep: the drop walk to [-128,45,408] failed - doomed goal (ledgered 26s ago at [-129,45,408]) - sweep drops refused (dy -1.1, range 2)'
  ])
  assert.equal(c.fails, 9)
  assert.deepEqual(c.byWhy, { 'no-path': 1, doomed: 2, timeout: 6 })
  assert.deepEqual(c.byBot, { F17: 3, F11: 2, F13: 2, F10: 2 })
  assert.deepEqual(c.nopath, { n: 1, goals: ['[-122,55,408]'] })
  // the terrace/deep split by hand: F17's three ride y 53..55 (the water
  // terrace), every other bot's fail rides y 45..48 (the deep floor)
  assert.equal(c.dy.min, -2.0)
  assert.equal(c.dy.max, 1.0)
  assert.deepEqual([c.dy.below, c.dy.plane, c.dy.above], [5, 2, 2])
})

test('drop-walk verdict: the face-74 cell - timeout owns the book (the verdict\'s first field case)', () => {
  // the census's own byWhy cell stays byte-untouched and the lens reads
  // THE SAME cell the decompose prints (zero re-parsing - the additive law)
  const c = dropWalkCensus([
    'F2 [F2] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)',
    'F8 [F8] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2)',
    'F5 [F5] vein sweep: the drop walk to [-113,41,430] failed - goal admission: no standable cell in the goal\'s arrival sphere - sweep drops refused (dy -2.0, range 2)'
  ])
  assert.equal(c.fails, 3)
  assert.deepEqual(c.byWhy, { timeout: 1, doomed: 1, admission: 1 })
  // face 74's own why distribution as the agreeing witness (the mine's
  // own split: timeout=11 admission=6 doomed=3)
  const v = dropWalkVerdict({ timeout: 11, admission: 6, doomed: 3 })
  assert.deepEqual(v, { why: 'timeout', owns: 11, ofFails: 20, shareOfFails: 0.55 })
  assert.equal(dropWalkVerdictRow(v), `the drop-walk's own verdict (v0.778.0): timeout owns 11 of 20 fail(s) (55.0%) - THE DROP'S OWN FRONT: the walk layer's own verdict names the class - the honest refusals stay the fleet's own saves, the burns price the lane's cure`)
})

test('drop-walk verdict: the tie owns nothing; the junk battery never invents an owner', () => {
  // a tie owns nothing (the storm-has-no-seat precedent)
  assert.equal(dropWalkVerdict({ timeout: 5, doomed: 5 }), null)
  // a no-majority spread reads the honest silence (top at or under the rest)
  assert.equal(dropWalkVerdict({ timeout: 4, admission: 4, doomed: 3 }), null)
  for (const junk of [undefined, null, 42, 'str', [], {}]) {
    assert.equal(dropWalkVerdict(junk), null, `verdict must stay silent on ${JSON.stringify(junk)}`)
    assert.equal(dropWalkVerdictRow(junk), null)
  }
  // non-finite and non-positive counts are skipped, never priced
  const skewed = dropWalkVerdict({ timeout: 3, doomed: -1, admission: 0, other: NaN })
  assert.deepEqual(skewed, { why: 'timeout', owns: 3, ofFails: 3, shareOfFails: 1 })
  // a junk-silent verdict feeds no row
  assert.equal(dropWalkVerdictRow({ why: 'timeout', owns: 50, ofFails: 30, shareOfFails: 1.667 }), null)
})

test('WIRING: decompose seats the drop-walk book beside the rent read', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  // the branch rides the byWhy cell the decompose already prints
  assert.ok(src.includes('dropWalkVerdict(dw.byWhy)'), 'the verdict must read the census\'s own byWhy cell')
  assert.ok(src.includes('dropWalkVerdictRow'), 'the verdict row must ride the import tail')
  // the row prose lives only in the lib (the v0.767.0 wiring law) - the
  // anchor is the full row tail, not any bare substring
  assert.ok(!src.includes("THE DROP'S OWN FRONT"), 'the verdict row prose must stay in the lib')
})
