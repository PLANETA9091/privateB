//
// reachmap.test.mjs - THE REACH'S OWN RADIUS (v0.740.0) unit tests.
// The refusal lines are byte-verbatim from the 53rd's own face
// (run 37553652417, the live order): 17 last-mile refusals across 10
// bots, every tail carrying the raw walker's distance (16 timeout
// class, 1 no-net-progress class). THE MAIDEN READ: 16 of 17 died at
// d=4.3-9.1 - INSIDE the direct envelope's own band (the v0.597.0
// precedent) - one outlier at d=15.2. The heal's law: the distance
// rides the SAME COMMONS_LASTMILE_RE match (one parser per shape -
// the capture is additive, the why map's digit-free classes stay
// byte-stable), and the lens (reachmap.mjs) prices the bands without
// parsing anything.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commonsLedger } from '../../src/lib/commonsledger.mjs'
import { reachRadius, reachRadiusRow, reachClock, reachClockRow } from '../../src/lib/reachmap.mjs'

// The 53rd's own refusals, byte-verbatim and in the live order (the
// bots' anchor reads open one sweep each - the refusal is anatomy,
// never a terminal, so a bot's second refusal rides the same or a
// reopened sweep; the grammar holds either way).
const ANCHOR = bot => `${bot} fuel commons: the anchor chest is read first`
const FACE53_LINES = [
  ANCHOR('F10'),
  ANCHOR('F2'),
  ANCHOR('F19'),
  ANCHOR('F5'),
  ANCHOR('F12'),
  ANCHOR('F14'),
  ANCHOR('F18'),
  ANCHOR('F13'),
  ANCHOR('F11'),
  ANCHOR('F6'),
  'F10 fuel commons: the last mile refused (raw walk timeout after 2402ms (d=9.1))',
  'F2 fuel commons: the last mile refused (raw walk timeout after 6990ms (d=7.0))',
  'F19 fuel commons: the last mile refused (raw walk: no net progress for 8161ms (best d=4.3))',
  'F5 fuel commons: the last mile refused (raw walk timeout after 1923ms (d=8.0))',
  'F12 fuel commons: the last mile refused (raw walk timeout after 6314ms (d=8.1))',
  'F14 fuel commons: the last mile refused (raw walk timeout after 381ms (d=7.1))',
  'F18 fuel commons: the last mile refused (raw walk timeout after 6276ms (d=7.0))',
  'F13 fuel commons: the last mile refused (raw walk timeout after 3288ms (d=7.0))',
  'F11 fuel commons: the last mile refused (raw walk timeout after 5694ms (d=7.0))',
  'F2 fuel commons: the last mile refused (raw walk timeout after 4908ms (d=7.0))',
  'F6 fuel commons: the last mile refused (raw walk timeout after 4092ms (d=15.2))',
  'F12 fuel commons: the last mile refused (raw walk timeout after 7048ms (d=8.0))',
  'F18 fuel commons: the last mile refused (raw walk timeout after 2528ms (d=8.1))',
  'F11 fuel commons: the last mile refused (raw walk timeout after 2103ms (d=8.0))',
  'F14 fuel commons: the last mile refused (raw walk timeout after 1224ms (d=8.7))',
  'F13 fuel commons: the last mile refused (raw walk timeout after 1955ms (d=8.3))',
  'F11 fuel commons: the last mile refused (raw walk timeout after 1078ms (d=8.1))'
]

test('reachRadius: the 53rd\'s own 17 - the distances ride the same match', () => {
  const cl = commonsLedger(FACE53_LINES)
  assert.ok(cl, 'reads the face')
  assert.equal(cl.totals.lastMile, 17, 'every refusal counted once')
  assert.equal(cl.totals.lastMileD.length, 17, 'every tail carried a d=')
  assert.deepEqual([...cl.totals.lastMileD].sort((a, b) => a - b),
    [4.3, 7, 7, 7, 7, 7, 7.1, 8, 8, 8, 8.1, 8.1, 8.1, 8.3, 8.7, 9.1, 15.2],
    'the 53rd\'s own distances (the best-d class rides its closest reach)')
  assert.equal(cl.bots.F11.lastMileD.length, 3, 'F11 the repeat refuser')
  assert.equal(cl.bots.F19.lastMileD[0], 4.3, 'the no-net-progress class rides best d=')
})

test('reachRadius: the 53rd\'s bands - one straight hop, one outlier', () => {
  const r = reachRadius(commonsLedger(FACE53_LINES))
  assert.ok(r, 'reads the ledger')
  assert.equal(r.refusals, 17)
  assert.equal(r.withD, 17)
  assert.equal(r.dMax, 15.2)
  assert.deepEqual(r.bands, { close: 1, mid: 15, far: 1 }, '16 of 17 inside the envelope\'s own band')
})

test('reachRadiusRow: the 53rd\'s own verdict - the approach\'s price rides with the last mile\'s', () => {
  const row = reachRadiusRow(reachRadius(commonsLedger(FACE53_LINES)))
  assert.ok(row, 'the face refused, the row speaks')
  assert.ok(row.startsWith("the reach's own radius: the last mile refused 17 walk(s)"), 'the head')
  assert.ok(row.includes('d read on 17 of 17 (max 15.2, bands: d<5 x1 / d5-10 x15 / d10+ x1)'), 'the bands byte-exact')
  assert.ok(row.includes("- 1 walk(s) died beyond the envelope's own band (d>10) - the approach's own price rides with the last mile's"), 'the far class')
})

test('reachRadiusRow: the all-inside class - the raw clock\'s own price', () => {
  const lines = [
    ANCHOR('F2'),
    'F2 fuel commons: the last mile refused (raw walk timeout after 6990ms (d=7.0))',
    'F2 fuel commons: the last mile refused (raw walk timeout after 2402ms (d=9.1))'
  ]
  const row = reachRadiusRow(reachRadius(commonsLedger(lines)))
  assert.ok(row)
  assert.ok(row.includes('d read on 2 of 2 (max 9.1, bands: d<5 x0 / d5-10 x2 / d10+ x0)'), 'the inside bands')
  assert.ok(row.includes("- the walks die inside the envelope's own band (the bot stands one straight hop from the chest, the raw clock cannot close it)"), 'the inside verdict')
})

test('reachRadiusRow: the bare class - the old faces\' refusals carry no distance', () => {
  const lines = [
    ANCHOR('F3'),
    'F3 fuel commons: the last mile refused (raw walk timeout after 2000ms)'
  ]
  const cl = commonsLedger(lines)
  assert.equal(cl.totals.lastMile, 1)
  assert.equal(cl.totals.lastMileD.length, 0, 'no d= - the honest gap')
  const row = reachRadiusRow(reachRadius(cl))
  assert.ok(row)
  assert.ok(row.includes("d read on none - the bare refusals carry no distance (the old faces' shape)"), 'the bare verdict')
})

test('reachRadius: the honest silences and the byte-stability fences', () => {
  // zero refusals: the row stays silent (no row invented)
  const quiet = commonsLedger([ANCHOR('F9'), 'F9 fuel commons: budget spent (0/1 units)'])
  assert.equal(quiet.totals.lastMile, 0)
  assert.equal(reachRadiusRow(reachRadius(quiet)), null, 'zero refusals = no row')
  // junk ledger: null without a totals, the empty ledger's totals read zero
  assert.equal(reachRadius(null), null)
  assert.equal(reachRadius({}), null)
  const r0 = reachRadius(commonsLedger([]))
  assert.ok(r0, 'the empty face still reads a ledger')
  assert.equal(r0.refusals, 0)
  assert.equal(reachRadiusRow(r0), null)
  // non-string rows skipped
  const junked = commonsLedger([null, 42, ANCHOR('F2'), undefined, 'F2 fuel commons: the last mile refused (raw walk timeout after 1000ms (d=3.0))'])
  assert.equal(junked.totals.lastMile, 1)
  assert.deepEqual(junked.totals.lastMileD, [3])
  // THE BYTE-STABILITY FENCE: the why map's digit-free classes stay
  // untouched by the d capture (the 52nd's own shape reads 1 with the
  // same class head as before the heal)
  const stable = commonsLedger([ANCHOR('F2'), 'F2 fuel commons: the last mile refused (raw walk timeout after 2000ms (d=6.7))'])
  assert.deepEqual(stable.totals.lastMileWhys, { 'raw walk timeout after Nms': 1 }, 'the digit-free class unchanged')
  assert.deepEqual(stable.totals.lastMileD, [6.7], 'the distance rides beside it')
})

// ---- (v0.742.0) THE LAST MILE'S OWN CLOCK - the radius's own twin ----

test('reachClock: the 53rd\'s own 17 clocks - the elapsed ms ride the same match', () => {
  const cl = commonsLedger(FACE53_LINES)
  const c = reachClock(cl)
  assert.ok(c, 'reads the ledger')
  assert.equal(c.refusals, 17)
  assert.equal(c.withMs, 17, 'every tail carried an after/for Nms')
  assert.equal(c.msSum, 66365, 'the 53rd\'s own spend (2402+6990+8161+1923+6314+381+6276+3288+5694+4908+4092+7048+2528+2103+1224+1955+1078)')
  assert.equal(c.msMax, 8161, 'the no-net-progress class spent the longest')
  // the twin law: the radius's own read stands beside it unchanged
  const r = reachRadius(cl)
  assert.equal(r.dMax, 15.2, 'the d capture untouched by the clock capture')
  assert.deepEqual([...cl.totals.lastMileD].sort((a, b) => a - b),
    [4.3, 7, 7, 7, 7, 7, 7.1, 8, 8, 8, 8.1, 8.1, 8.1, 8.3, 8.7, 9.1, 15.2])
})

test('reachClockRow: the 53rd\'s own verdict - the raw walk\'s own rent', () => {
  const row = reachClockRow(reachClock(commonsLedger(FACE53_LINES)))
  assert.ok(row, 'clocks rode, the row speaks')
  assert.equal(row, "the last mile's own clock: the refused walks spent 66.4s dying (max 8.2s across 17 read(s)) - the raw walk's own rent")
})

test('reachClockRow: the honest silences and the mixed face', () => {
  // no refusals at all: no row
  const quiet = reachClock(commonsLedger([ANCHOR('F9'), 'F9 fuel commons: budget spent (0/1 units)']))
  assert.equal(quiet.withMs, 0)
  assert.equal(reachClockRow(quiet), null, 'zero clocks = no row')
  // the bare class: a refusal whose tail carries no after/for Nms
  const bare = commonsLedger([ANCHOR('F2'), 'F2 fuel commons: the last mile refused (raw walk refused by the caller)'])
  assert.equal(bare.totals.lastMile, 1)
  assert.equal(bare.totals.lastMileMs.length, 0, 'no ms - the honest gap')
  assert.equal(reachClockRow(reachClock(bare)), null)
  // the mixed face: one bare + one clocked - the count is the read's
  const mixed = commonsLedger([
    ANCHOR('F2'),
    'F2 fuel commons: the last mile refused (raw walk refused by the caller)',
    'F2 fuel commons: the last mile refused (raw walk timeout after 1224ms (d=8.7))'
  ])
  const cm = reachClock(mixed)
  assert.equal(cm.refusals, 2)
  assert.equal(cm.withMs, 1, 'only the clocked tail rides the column')
  assert.equal(cm.msSum, 1224)
  assert.ok(reachClockRow(cm).includes('(max 1.2s across 1 read(s))'))
  // junk ledger + non-string rows
  assert.equal(reachClock(null), null)
  assert.equal(reachClock({}), null)
  const junked = reachClock(commonsLedger([null, 7, ANCHOR('F2'), undefined, 'F2 fuel commons: the last mile refused (raw walk stalled after 1955ms (d=8.3))']))
  assert.deepEqual([junked.withMs, junked.msSum, junked.msMax], [1, 1955, 1955])
})
