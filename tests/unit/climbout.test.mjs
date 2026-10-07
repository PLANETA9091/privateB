// THE CLIMB LENS's unit pin (v0.420.0) - the vertical doom's verdict read.
// The verbatims are the held logs' own shapes (face 27 = run 36870593766,
// face 26, and the held-log why census: stalled 43, timeout 23, low-o 13,
// rescue owns the bot 8, wet wall 6, wet-sentinel 1). The lens answers the
// 2230 brief's question: is the doom gate WORKING or OVER-FIRING - the
// verdict lines are its evidence.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseClimbOut, climbOutCensus, classifyClimbWhy, climbFailVerdict, climbFailVerdictRow, climbFailRiders, climbFailRidersRow, climbStageBill, climbStageBillRow, climbStageRiders, climbStageRidersRow } from '../../src/lib/climbout.mjs'

test('the OK verbatims (face 27): gained/steps/dug/secs read whole; the arm rides', () => {
  const a = parseClimbOut('F8 climb out (pre-position): OK +11 levels (10 steps, 23 dug, 26s)')
  assert.equal(a.bot, 'F8')
  assert.equal(a.arm, 'pre-position')
  assert.equal(a.verdict, 'ok')
  assert.equal(a.gained, 11)
  assert.equal(a.steps, 10)
  assert.equal(a.dug, 23)
  assert.equal(a.traversed, null)
  assert.equal(a.secs, 26)

  const b = parseClimbOut('F7 climb out (wood trip): OK +16 levels (16 steps, 43 dug, 53s)')
  assert.equal(b.arm, 'wood trip')
  assert.equal(b.verdict, 'ok')
  assert.equal(b.gained, 16)
})

test('the OK-with-traversed shape reads the traversed slot', () => {
  const a = parseClimbOut('F9 climb out (trip): OK +14 levels (14 steps, 28 dug, 12 traversed, 38s)')
  assert.equal(a.verdict, 'ok')
  assert.equal(a.traversed, 12)
  assert.equal(a.gained, 14)
  assert.equal(a.secs, 38)
})

test('the failure verbatims: multi-word whys, the wait/traversed/stage slots in the emitter order', () => {
  const a = parseClimbOut('F1 climb out (pre-position): failed - stalled')
  assert.equal(a.verdict, 'failed')
  assert.equal(a.why, 'stalled')
  assert.equal(a.whyClass, 'stalled')
  assert.equal(a.stage, null)

  // the multi-word why is the field's own shape (8 hits in the held logs)
  const b = parseClimbOut('F6 climb out (pre-position): failed - rescue owns the bot')
  assert.equal(b.why, 'rescue owns the bot')
  assert.equal(b.whyClass, 'rescue-owns')

  const c = parseClimbOut('F9 climb out (pre-position): failed - timeout (traversed 11)')
  assert.equal(c.why, 'timeout')
  assert.equal(c.traversed, 11)
  assert.equal(c.waitSecs, null)

  const d = parseClimbOut('F9 climb out (pre-position): failed - exhausted (wait 47s)')
  assert.equal(d.why, 'exhausted')
  assert.equal(d.waitSecs, 47)
  assert.equal(d.traversed, null)

  // the stage tag rides the retry ladder's depth (face 27: [stage 2])
  const e = parseClimbOut('F9 climb out (trip): failed - stalled [stage 2]')
  assert.equal(e.why, 'stalled')
  assert.equal(e.stage, 2)
})

test('the retry family: retry-failed, the plan line, no-retry - the arm same', () => {
  const a = parseClimbOut('F9 climb out (bank): retry failed - stalled [stage 1]')
  assert.equal(a.verdict, 'retry-failed')
  assert.equal(a.why, 'stalled')
  assert.equal(a.arm, 'bank')
  assert.equal(a.stage, 1)

  const b = parseClimbOut('F9 climb out (bank): retry (escalated retry after stalled, fenced to 90s of the 150s the chain has left)')
  assert.equal(b.verdict, 'retry-plan')
  assert.ok(b.why.includes('escalated retry after stalled'))

  const c = parseClimbOut('F9 climb out (bank): no retry (the plan refused the climb)')
  assert.equal(c.verdict, 'no-retry')
  assert.equal(c.why, 'the plan refused the climb')

  const d = parseClimbOut('F9 climb out (bank): retry OK +9 levels (9 steps, 20 dug, 22s)')
  assert.equal(d.verdict, 'retry-ok')
  assert.equal(d.gained, 9)
})

test('the doom retarget line reads the gate re-pricing; the armless grammar holds', () => {
  const a = parseClimbOut("F1 climb out (trip): the yard sits 14 levels up - the climb raises its target to the yard's level")
  assert.equal(a.verdict, 'doom-retarget')
  assert.equal(a.why, 'the yard sits 14 levels up')
  assert.equal(a.arm, 'trip')

  // the endphase comments name an armless historical shape - the grammar
  // parses it with arm null (never invents an arm)
  const b = parseClimbOut('F6 climb out: failed - stopped')
  assert.equal(b.verdict, 'failed')
  assert.equal(b.arm, null)
  assert.equal(b.whyClass, 'stopped')
})

test("the undefineds shape (the emitter's own leak): the climb counts, the price stays unknown", () => {
  const a = parseClimbOut('F5 climb out (bank): OK +7 levels (9 steps, 15 dug, undefineds)')
  assert.equal(a.verdict, 'ok')
  assert.equal(a.gained, 7)
  assert.equal(a.dug, 15)
  assert.equal(a.secs, null) // the stamp never invents - the price is unknown

  const b = parseClimbOut('F7 climb out (pre-position): OK +13 levels (16 steps, 56 dug, 9 traversed, undefineds)')
  assert.equal(b.verdict, 'ok')
  assert.equal(b.traversed, 9)
  assert.equal(b.secs, null)

  // the census: the attempt and its gains count; the secs pricing skips
  const c = climbOutCensus([
    'F5 climb out (bank): OK +7 levels (9 steps, 15 dug, undefineds)',
    'F8 climb out (pre-position): OK +11 levels (10 steps, 23 dug, 26s)'
  ])
  assert.equal(c.attempts, 2)
  assert.equal(c.gains.n, 2)
  assert.equal(c.secs.n, 1) // only the priced climb
  assert.equal(c.secs.max, 26)
})

test('classifyClimbWhy: the held-log vocabulary, most-specific-first, unknown honest', () => {
  assert.equal(classifyClimbWhy('stalled'), 'stalled')
  assert.equal(classifyClimbWhy('timeout'), 'timeout')
  assert.equal(classifyClimbWhy('low-o'), 'low-o')
  assert.equal(classifyClimbWhy('wet wall'), 'wet-wall')
  assert.equal(classifyClimbWhy('wet-sentinel'), 'wet-sentinel')
  assert.equal(classifyClimbWhy('rescue owns the bot'), 'rescue-owns')
  assert.equal(classifyClimbWhy('exhausted'), 'exhausted')
  assert.equal(classifyClimbWhy('stopped'), 'stopped')
  assert.equal(classifyClimbWhy('something new'), 'other')
  assert.equal(classifyClimbWhy(''), 'other')
  assert.equal(classifyClimbWhy(null), null)
  assert.equal(classifyClimbWhy(42), null)
})

test('the census accumulation (face 27 hand-counted): 3 OK + 4 failed-ish verdict families', () => {
  const hs = climbOutCensus([
    'F8 climb out (pre-position): OK +11 levels (10 steps, 23 dug, 26s)',
    'F7 climb out (wood trip): OK +16 levels (16 steps, 43 dug, 53s)',
    'F7 climb out (trip): OK +14 levels (14 steps, 28 dug, 38s)',
    'F1 climb out (pre-position): failed - stalled',
    'F9 climb out (pre-position): failed - timeout (traversed 11)',
    'F9 climb out (pre-position): failed - exhausted (wait 47s)',
    'F9 climb out (bank): retry failed - stalled [stage 1]',
    'F9 climb out (bank): retry (escalated retry after stalled)',
    'F6 climb out (pre-position): failed - rescue owns the bot'
  ])
  assert.equal(hs.attempts, 8) // 3 OK + 5 failed (retry-failed counts as an attempt)
  assert.equal(hs.ok, 3)
  assert.equal(hs.failed, 4)
  assert.equal(hs.retryOk, 0)
  assert.equal(hs.retryFailed, 1)
  assert.deepEqual(hs.byWhy, { stalled: 2, timeout: 1, exhausted: 1, 'rescue-owns': 1 })
  assert.deepEqual(hs.byArm, { 'pre-position': 5, 'wood trip': 1, trip: 1, bank: 2 }) // bank: the retry-failed attempt + the retry plan line
  assert.equal(hs.gains.n, 3)
  assert.equal(hs.gains.sum, 41)
  assert.equal(hs.gains.max, 16)
  assert.equal(hs.dug.max, 43)
  assert.equal(hs.secs.max, 53)
  assert.equal(hs.stages.n, 1)
  assert.equal(hs.stages.max, 1)
  assert.equal(hs.retries.plans, 1)
  assert.equal(hs.retries.noRetry, 0)
  assert.equal(hs.unparsed, 0)
})

test('the junk battery: the probe emitters, the chest-ascent lane, the assist lines - none parse as climb out verdicts', () => {
  const hs = climbOutCensus([
    42, null, undefined,
    'F1 [F1] climb bridge: unavailable (no placeable block in the pocket)',
    'F1 [F1] climb diag: level at y=68 blocked toward -1,0 (dug=0)',
    'F6 chest ascent: refused (the clock 14s cannot fund the 45s climb + the 30s walk floor) - the skip stands',
    'F12 chest ascent: climbed +3 levels (dug 5, 4 steps) - the hop gets its route',
    'F1 climb rise assist: helped +2 at y=64',
    'F9 climb wet escape: 3 blocks walked (stalled, walked 1/4)',
    'F1 final bank: 0 (dooms-latched after 2 failed shaft-bottom climb cycles - the chain is refused, the clock mines on)',
    'F9 climb out (bank): the body escaped the grammar'
  ])
  assert.equal(hs.attempts, 0)
  assert.equal(hs.ok, 0)
  assert.equal(hs.unparsed, 1) // the escaped body: head matched, body unknown - counted, never dropped
})

test('the honest zeros: empty input and non-array read the empty row shape', () => {
  for (const input of [[], undefined, null, 'not an array']) {
    const hs = climbOutCensus(input)
    assert.equal(hs.attempts, 0)
    assert.equal(hs.ok, 0)
    assert.equal(hs.failed, 0)
    assert.deepEqual(hs.gains, { n: 0, sum: 0, max: 0 })
    assert.deepEqual(hs.stages, { n: 0, max: 0, byStage: {} })
    assert.equal(hs.unparsed, 0)
  }
})

// (v0.779.0) THE CLIMB FAIL'S OWN VERDICT tests - the climb book's own
// why-level seat (the strict-majority law on the census's own byWhy
// cell) + the riders companion (measure-not-owner). The fixtures are the
// mines' own distributions (the honest-anchor law).

test('climb fail: the face-74 cell fires the verdict (stalled owns the majority); the census cell rides byte-untouched', () => {
  // face 74's own distribution (run 37643508935): stalled:14 timeout:3
  // wet-sentinel:3 wet-wall:2 low-o:1 rescue-owns:1
  const cell = { stalled: 14, timeout: 3, 'wet-sentinel': 3, 'wet-wall': 2, 'low-o': 1, 'rescue-owns': 1 }
  const snapshot = JSON.parse(JSON.stringify(cell))
  const bill = climbFailVerdict(cell)
  assert.deepEqual(bill, { why: 'stalled', owns: 14, ofFails: 24, shareOfFails: 0.583 })
  assert.deepEqual(cell, snapshot) // the census's own cell stays byte-untouched
  assert.equal(climbFailVerdictRow(bill), `the climb fail's own verdict (v0.779.0): stalled owns 14 of 24 fail(s) (58.3%) - THE DOOM'S OWN SEAT: one why's own climbs own the ladder's doom - the why's own front prices the climb the raw split rode unnamed`)
})

test('climb fail: the tie owns nothing; the no-majority mixes keep the deterministic order', () => {
  // face 70's own tie (stalled:7 timeout:7) - the verdict's silence, the
  // riders' duet ('stalled' < 'timeout' byte-wise)
  const f70 = { stalled: 7, timeout: 7, 'wet-wall': 4, 'low-o': 4, 'rescue-owns': 1 }
  assert.equal(climbFailVerdict(f70), null)
  const r70 = climbFailRiders(f70)
  assert.deepEqual(r70, { leader: 'stalled', leaderOwns: 7, runner: 'timeout', runnerOwns: 7, ofFails: 23, pairOwns: 14, shareOfFails: 0.609, duet: true })
  assert.equal(climbFailRidersRow(r70), `the climb fail's own riders (v0.779.0): no solo why owns the majority - stalled x7 + timeout x7 own 14 of 23 fail(s) (60.9%) - THE DOOM'S OWN MIX: the bill's tie law held, the mix is the shape - the climb's own crowd prices the ladder the solo law refused to name`)
  // face 72's runner tie (rescue-owns x4 vs timeout x4) reads byte-wise:
  // 'rescue-owns' < 'timeout' - the rescue-owns class is the runner
  const f72 = { stalled: 8, 'rescue-owns': 4, timeout: 4, 'low-o': 2, 'wet-sentinel': 2, 'wet-wall': 1, stopped: 1 }
  assert.equal(climbFailVerdict(f72), null)
  const r72 = climbFailRiders(f72)
  assert.deepEqual(r72, { leader: 'stalled', leaderOwns: 8, runner: 'rescue-owns', runnerOwns: 4, ofFails: 22, pairOwns: 12, shareOfFails: 0.545, duet: false })
  // face 73's own timeout lead stays under the majority (5 of 14)
  const f73 = { timeout: 5, 'low-o': 4, 'rescue-owns': 2, 'wet-sentinel': 1, stalled: 1, 'wet-wall': 1 }
  assert.equal(climbFailVerdict(f73), null)
  assert.deepEqual(climbFailRiders(f73), { leader: 'timeout', leaderOwns: 5, runner: 'low-o', runnerOwns: 4, ofFails: 14, pairOwns: 9, shareOfFails: 0.643, duet: false })
})

test('climb fail: the junk battery never invents a verdict or a shape', () => {
  for (const junk of [undefined, null, 42, 'str', [], {}]) {
    assert.equal(climbFailVerdict(junk), null, `verdict must stay silent on ${JSON.stringify(junk)}`)
    assert.equal(climbFailRiders(junk), null, `riders must stay silent on ${JSON.stringify(junk)}`)
    assert.equal(climbFailVerdictRow(junk), null)
    assert.equal(climbFailRidersRow(junk), null)
  }
  // non-finite and non-positive counts are skipped, never priced
  const skewed = climbFailVerdict({ stalled: 3, timeout: -1, 'low-o': 0, exhausted: NaN })
  assert.deepEqual(skewed, { why: 'stalled', owns: 3, ofFails: 3, shareOfFails: 1 })
  // a single why owns the book but the riders need two
  assert.deepEqual(climbFailRiders({ stalled: 6 }), null)
  assert.deepEqual(climbFailVerdict({ stalled: 6 }), { why: 'stalled', owns: 6, ofFails: 6, shareOfFails: 1 })
  // a junk-silent verdict feeds no row
  assert.equal(climbFailVerdictRow({ why: 'stalled', owns: 50, ofFails: 30, shareOfFails: 1.667 }), null)
})

test('WIRING: decompose seats the climb fail book beside the fail-whys read', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  // the branch rides the byWhy cell the decompose already prints
  assert.ok(src.includes('climbFailVerdict(c.byWhy)'), 'the verdict must read the census\'s own byWhy cell')
  assert.ok(src.includes('climbFailRiders(c.byWhy)'), 'the riders must read the census\'s own byWhy cell')
  assert.ok(src.includes('climbFailRidersRow'), 'the riders row must ride the import tail')
  // the row prose lives only in the lib (the v0.767.0 wiring law) - the
  // anchors are the full row tails, not any bare substring
  assert.ok(!src.includes("THE DOOM'S OWN SEAT"), 'the verdict row prose must stay in the lib')
  assert.ok(!src.includes("THE DOOM'S OWN MIX"), 'the riders row prose must stay in the lib')
})

// (v0.781.0) THE CLIMB FAIL'S OWN STAGE - the ladder's own seat. The
// verbatims are the held logs' own shapes (face 74 = run 37643508935:
// 'stage ladder depth 3 (max [stage 1])' - the three staged fails all on
// the shallow rung; faces 73/75 carried no [stage N] tail at all - the
// honest silence held there, no row rode).

test('the stage seat: the face-74 staged book owns the shallow rung (the mine\'s own distribution as the agreeing witness)', () => {
  // face 74's own staged census, byte-true: three staged fails, all stage 1
  const bill = climbStageBill({ '1': 3 })
  assert.deepEqual(bill, { stage: 1, owns: 3, ofFails: 3, shareOfFails: 1 })
  assert.equal(
    climbStageBillRow(bill),
    "the climb fail's own stage (v0.781.0): stage 1 owns 3 of 3 staged fail(s) (100.0%) - THE LADDER'S OWN SEAT: one rung's own climbs own the ladder's doom - the rung's own front prices the stall the raw depth rode unnamed"
  )
  // a wider designed ladder: the deep rungs split, the shallow one holds the strict majority
  const wide = climbStageBill({ '1': 5, '2': 3, '3': 1 })
  assert.deepEqual(wide, { stage: 1, owns: 5, ofFails: 9, shareOfFails: 0.556 })
  // the census tallies the same events the n/max cell prices - the fail
  // stream's [stage N] tails land in byStage, the other cells byte-untouched
  const hs = climbOutCensus([
    'F9 climb out (trip): failed - stalled [stage 2]',
    'F9 climb out (pre-position): failed - stalled [stage 1]',
    'F9 climb out (pre-position): failed - timeout (traversed 11)',
    'F8 climb out (pre-position): OK +11 levels (10 steps, 23 dug, 26s)'
  ])
  assert.deepEqual(hs.stages, { n: 2, max: 2, byStage: { '1': 1, '2': 1 } })
  assert.deepEqual(hs.byWhy, { stalled: 2, timeout: 1 })
  assert.equal(hs.ok, 1)
})

test('the stage seat\'s tie law and the ladder\'s own numeric order', () => {
  // a tie owns nothing - the storm-has-no-seat precedent
  assert.equal(climbStageBill({ '1': 3, '2': 3 }), null)
  // a no-majority spread reads the honest silence
  assert.equal(climbStageBill({ '1': 4, '2': 3, '3': 2 }), null)
  // the riders measure the shape the seat refused to name (the same spread)
  const spread = climbStageRiders({ '1': 4, '2': 3, '3': 2 })
  assert.deepEqual(spread, { leader: 1, leaderOwns: 4, runner: 2, runnerOwns: 3, ofFails: 9, pairOwns: 7, shareOfFails: 0.778, duet: false })
  // the numeric order pin: the ladder's own order, never the byte-wise '10' < '2' trap
  const tenVtwo = climbStageRiders({ '10': 3, '2': 3 })
  assert.equal(tenVtwo.leader, 2)
  assert.equal(tenVtwo.runner, 10)
  assert.equal(tenVtwo.duet, true)
  // a single rung seats but the riders need two
  assert.deepEqual(climbStageBill({ '2': 6 }), { stage: 2, owns: 6, ofFails: 6, shareOfFails: 1 })
  assert.equal(climbStageRiders({ '2': 6 }), null)
  // no staged fails at all (faces 73/75's own shape): every door reads the silence
  assert.equal(climbStageBill({}), null)
  assert.equal(climbStageRiders({}), null)
})

test('the stage rows are byte-exact and the junk battery never invents a seat or a shape', () => {
  const riders = climbStageRiders({ '1': 3, '2': 2 })
  assert.deepEqual(riders, { leader: 1, leaderOwns: 3, runner: 2, runnerOwns: 2, ofFails: 5, pairOwns: 5, shareOfFails: 1, duet: false })
  assert.equal(
    climbStageRidersRow(riders),
    "the climb fail's own stage riders (v0.781.0): no solo stage owns the majority - stage 1 x3 + stage 2 x2 own 5 of 5 staged fail(s) (100.0%) - THE LADDER'S OWN MIX: the seat's tie law held, the mix is the shape - the climb's own crowd prices the rungs the solo law refused to name"
  )
  for (const junk of [undefined, null, 42, 'str', [], {}]) {
    assert.equal(climbStageBill(junk), null, `seat must stay silent on ${JSON.stringify(junk)}`)
    assert.equal(climbStageRiders(junk), null, `riders must stay silent on ${JSON.stringify(junk)}`)
    assert.equal(climbStageBillRow(junk), null)
    assert.equal(climbStageRidersRow(junk), null)
  }
  // the emitter's rungs are positive integers - anything else is skipped, never priced
  const skewed = climbStageBill({ '0': 5, '-1': 2, '1.5': 3, '': 1, '2': 7, x: 4 })
  assert.deepEqual(skewed, { stage: 2, owns: 7, ofFails: 7, shareOfFails: 1 })
  // a junk-silent seat feeds no row
  assert.equal(climbStageBillRow({ stage: 3, owns: 50, ofFails: 30, shareOfFails: 1.667 }), null)
  assert.equal(climbStageRidersRow({ leader: 1, leaderOwns: 4, runner: 2, runnerOwns: 3, ofFails: 9, pairOwns: 99, shareOfFails: 11 }), null)
})

test('WIRING: decompose seats the climb stage beside the why seat', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  // the stage branch rides the census's own stages.byStage cell - a
  // different axis than the v0.779.0 why seat (both rows ride when each
  // earns its own print)
  assert.ok(src.includes('climbStageBill(c.stages.byStage)'), 'the seat must read the census\'s own byStage cell')
  assert.ok(src.includes('climbStageRiders(c.stages.byStage)'), 'the riders must read the census\'s own byStage cell')
  assert.ok(src.includes('climbStageRidersRow'), 'the riders row must ride the import tail')
  // the row prose lives only in the lib (the v0.767.0 wiring law) - the
  // anchors are the full row tails, not any bare substring
  assert.ok(!src.includes("THE LADDER'S OWN SEAT"), 'the seat row prose must stay in the lib')
  assert.ok(!src.includes("THE LADDER'S OWN MIX"), 'the riders row prose must stay in the lib')
})
