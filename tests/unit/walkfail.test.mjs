// (v0.410.0) THE WALK-FAIL LENS's tests - the tool-lane chest walks' and
// the sweep verdicts' field read. The verbatims are the face-25 log's own
// shapes (36860108110) - the honest-anchor law: the census is anchored to
// the REAL emitters (toolupgrade/fuelbank/smelting), the junk battery
// rejects the near-misses and the hop lane's own shape (the hop-zero
// census owns that lane - one parser per lane, the v0.409.0 split law).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyWalkWhy, parseWalkFail, parseSweepVerdict, classifySweepReason, walkFailCensus, walkFailBotBill, walkFailBotBillRow, walkFailRiders, walkFailRidersRow, walkFailLaneBill, walkFailLaneBillRow, walkFailLaneRiders, walkFailLaneRidersRow } from '../../src/lib/walkfail.mjs'

test('walk-fail: the face-25 tool-lane verbatims parse with lane, nudge and bot', () => {
  const a = parseWalkFail('F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)')
  assert.equal(a.bot, 'F7')
  assert.equal(a.lane, 'fuel commons')
  assert.equal(a.nudge, true)
  assert.equal(a.why, 'decide-timeout')

  const b = parseWalkFail('F13 iron commune: chest walk failed (Took to long to decide path to goal!)')
  assert.equal(b.lane, 'iron commune')
  assert.equal(b.nudge, false)
  assert.equal(b.why, 'decide-timeout')

  // the DOUBLED-tag variant is the field's own shape (face 25 line 594)
  const c = parseWalkFail('F14 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)')
  assert.equal(c.bot, 'F14')
  assert.equal(c.lane, 'iron commune')
  assert.equal(c.nudge, true)
  assert.equal(c.why, 'no-path')
})

test('walk-fail: the lane walk timeout captures ms; the bare emitter form reads lane bare', () => {
  const a = parseWalkFail('F7 iron commune: chest walk failed (iron commune walk @-118,404: timeout after 528ms)')
  assert.equal(a.why, 'walk-timeout')
  assert.equal(a.ms, 528)
  assert.equal(a.lane, 'iron commune')

  const bare = parseWalkFail('F4 chest walk failed (No path to the goal!)')
  assert.equal(bare.bot, 'F4')
  assert.equal(bare.lane, 'bare')
  assert.equal(bare.why, 'no-path')
})

test('walk-fail: the NESTED-paren why captures to the LAST paren (v0.419.0 - the face-26 nudge-retry nest the v0.410.0 read dropped)', () => {
  const a = parseWalkFail('F9 fuel commons: chest walk failed after the nudge (fuel commons walk @-148,412 (nudge retry): timeout after 2784ms)')
  assert.ok(a, 'the nested shape MUST parse - face 26 carried it and the [^)]* read dropped it whole')
  assert.equal(a.bot, 'F9')
  assert.equal(a.lane, 'fuel commons')
  assert.equal(a.nudge, true)
  assert.equal(a.why, 'walk-timeout')
  assert.equal(a.ms, 2784)
  assert.equal(a.raw, 'fuel commons walk @-148,412 (nudge retry): timeout after 2784ms')
  // the plain shape's raw rides too (the hot-spot lens's @coord currency)
  const b = parseWalkFail('F7 iron commune: chest walk failed (iron commune walk @-118,404: timeout after 528ms)')
  assert.equal(b.raw, 'iron commune walk @-118,404: timeout after 528ms')
})

test('walk-fail: classifyWalkWhy orders most-specific-first and junk reads other', () => {
  assert.equal(classifyWalkWhy('Took to long to decide path to goal!').why, 'decide-timeout')
  assert.equal(classifyWalkWhy('No path to the goal!').why, 'no-path')
  assert.equal(classifyWalkWhy('walk to a machine (sweep): timeout after 2623ms').why, 'walk-timeout')
  assert.equal(classifyWalkWhy('walk governor: bot churned 4 goals without progress - refused for 12s').why, 'governor-refusal')
  assert.equal(classifyWalkWhy('The goal was changed mid-walk').why, 'goal-churn')
  assert.equal(classifyWalkWhy('budget exhausted (walk floor)').why, 'budget-floor')
  assert.equal(classifyWalkWhy('something unheard of').why, 'other')
  assert.equal(classifyWalkWhy(42), null)
})

test('sweep verdict: the face-25 histogram verbatim parses both pairs with counts', () => {
  const v = parseSweepVerdict('F13 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x6, machine unreachable (walk to a machine (sweep): timeout after 17ms) x1')
  assert.equal(v.bot, 'F13')
  assert.equal(v.pairs.length, 2)
  assert.equal(v.pairs[0].n, 6)
  assert.equal(v.pairs[1].n, 1)
  assert.deepEqual(v.junk, [])
})

test('sweep verdict: the governor prose and the defer bucket survive the pair walk', () => {
  const v = parseSweepVerdict('F5 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x2, machine unreachable (walk governor: bot churned 4 goals without progress - walk to a machine (sweep) refused for 12s) x1, sweep deferred (the lanes hold) x1')
  assert.equal(v.pairs.length, 3)
  assert.equal(v.pairs[1].reason, 'machine unreachable (walk governor: bot churned 4 goals without progress - walk to a machine (sweep) refused for 12s)')
  assert.equal(v.pairs[2].reason, 'sweep deferred (the lanes hold)')
})

test('sweep verdict: a reason carrying a comma survives the accumulation (junk tail honest)', () => {
  const v = parseSweepVerdict('F9 sweep: 0 collected - machine unreachable (a, b reason) x2')
  assert.equal(v.pairs.length, 1)
  assert.equal(v.pairs[0].reason, 'machine unreachable (a, b reason)')
  assert.equal(v.pairs[0].n, 2)

  const j = parseSweepVerdict('F9 sweep: 0 collected - some tail without a count')
  assert.equal(j.pairs.length, 0)
  assert.equal(j.junk.length, 1)
})

test('sweep reason: the wrapper classes name themselves; busy/deferred/unknown buckets', () => {
  assert.equal(classifySweepReason('busy').why, 'busy')
  assert.equal(classifySweepReason('sweep deferred (the lanes hold)').why, 'deferred')
  assert.equal(classifySweepReason('machine unreachable (Took to long to decide path to goal!)').why, 'machine-unreachable-decide-timeout')
  assert.equal(classifySweepReason('machine unreachable (walk to a machine (sweep): timeout after 17ms)').why, 'machine-unreachable-walk-timeout')
  assert.equal(classifySweepReason('machine unreachable (something odd)').why, 'machine-unreachable-other')
  assert.equal(classifySweepReason('unknown').why, 'unknown')
  assert.equal(classifySweepReason(7).why, 'unknown')
})

test('census: the face-25 mixed stream accumulates lanes, whys and the A* starvation total', () => {
  const lines = [
    'F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F13 iron commune: chest walk failed (Took to long to decide path to goal!)',
    'F14 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)',
    'F7 iron commune: chest walk failed (iron commune walk @-118,404: timeout after 528ms)',
    'F13 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x6, machine unreachable (walk to a machine (sweep): timeout after 17ms) x1',
    'F13 sweep: 0 collected - machine unreachable (No path to the goal!) x6, machine unreachable (walk to a machine (sweep): timeout after 460ms) x1',
    'F5 sweep: 0 collected (no machines in reach)' // the zero-harvest shape WITHOUT a histogram - not this lens's line
  ]
  const c = walkFailCensus(lines)
  assert.equal(c.walk.total, 4)
  assert.equal(c.walk.nudge, 2)
  assert.equal(c.walk.byLane['fuel commons'], 1)
  assert.equal(c.walk.byLane['iron commune'], 3)
  assert.equal(c.walk.byWhy['decide-timeout'], 2)
  assert.equal(c.walk.byWhy['no-path'], 1)
  assert.equal(c.walk.byBot.F7, 2)
  assert.deepEqual(c.walk.timeouts, [528])

  assert.equal(c.sweep.lines, 2)
  assert.equal(c.sweep.machinesUnreachable, 14)
  assert.equal(c.sweep.byWhy['machine-unreachable-decide-timeout'], 6)
  assert.equal(c.sweep.byWhy['machine-unreachable-no-path'], 6)
  assert.equal(c.sweep.byWhy['machine-unreachable-walk-timeout'], 2)
  assert.deepEqual(c.sweep.timeouts, [17, 460])
  assert.equal(c.sweep.busy, 0)

  // the fleet-wide A* starvation read: the walk-fail decides + the sweep's
  // machine-unreachable decides (the hop lane's own 42 ride the hop census)
  assert.equal(c.decideTotal, 2 + 6)
})

test('census: the junk battery rejects the hop lane, the harvest shape and the near-misses', () => {
  const c = walkFailCensus([
    'F15 [F15] hop: chest at [-113,72,398] d=10 zero: chest unreachable (Took to long to decide path to goal!)', // the hop lane - hopcensus's
    'F9 sweep: collected 7 (iron_ore:7)', // the positive harvest shape
    'F9 sweep: 0 collected (2 idle-empty machines)', // the idle-empty shape - no histogram
    'chest walk failed (no bot tag)', // the untagged tool-lane line - the fleet always tags; junk here
    'F2 chest walk succeeds (No path to the goal!)', // near-miss verb
    42,
    null,
    undefined,
    { line: 'F1 sweep: 0 collected - busy x1' }
  ])
  assert.equal(c.walk.total, 0)
  assert.equal(c.sweep.lines, 0)
  assert.equal(c.decideTotal, 0)
})

test('census: the honest zero and the honest empty anatomy', () => {
  const c = walkFailCensus(['F1 [F1] heartbeat alive', 'no lines of ours here'])
  assert.equal(c.walk.total, 0)
  assert.equal(c.walk.nudge, 0)
  assert.deepEqual(c.walk.timeouts, [])
  assert.equal(c.sweep.lines, 0)
  assert.equal(c.sweep.machinesUnreachable, 0)
  assert.equal(c.decideTotal, 0)
  const e = walkFailCensus('not an array')
  assert.equal(e.decideTotal, 0)
  assert.deepEqual(e.walk.byWhy, {})
})

test('decide clock: the hb rail stamps the decides; the sweep pair stamps n copies', () => {
  const c = walkFailCensus([
    'b] n=1 ts=100s rss=300M late=20ms mainLate=100ms',
    'F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F13 iron commune: chest walk failed (Took to long to decide path to goal!)',
    'F13 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x3, machine unreachable (No path to the goal!) x1',
    'b] n=2 ts=160s rss=310M late=20ms mainLate=100ms',
    'F9 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x2'
  ])
  assert.equal(c.decideTotal, 7) // 2 lanes + 3 pair + 2 pair
  assert.equal(c.clock.timed, 7)
  assert.equal(c.clock.untimed, 0)
  assert.equal(c.clock.clockEnd, 160)
  assert.equal(c.clock.firstTs, 100)
  assert.equal(c.clock.lastTs, 160)
  // the densest 30s window: 5 stamps at ts=100 (2 lanes + 3 pair copies)
  assert.equal(c.clock.maxBurst, 5)
  assert.equal(c.clock.burstWindowS, 30)
})

test('decide clock: a decide before the first hb stays untimed and out of the windows', () => {
  const c = walkFailCensus([
    'F4 chest walk failed (Took to long to decide path to goal!)',
    'b] n=1 ts=50s rss=300M late=20ms mainLate=100ms',
    'F7 iron commune: chest walk failed (Took to long to decide path to goal!)'
  ])
  assert.equal(c.decideTotal, 2)
  assert.equal(c.clock.timed, 1)
  assert.equal(c.clock.untimed, 1)
  assert.equal(c.clock.firstTs, 50)
  assert.equal(c.clock.maxBurst, 1)
})

test('decide clock: the honest zero keeps the clock shape', () => {
  const c = walkFailCensus(['b] n=1 ts=10s rss=300M late=20ms mainLate=100ms', 'no decides here'])
  assert.equal(c.decideTotal, 0)
  assert.equal(c.clock.timed, 0)
  assert.equal(c.clock.untimed, 0)
  assert.equal(c.clock.clockEnd, 10)
  assert.equal(c.clock.maxBurst, 0)
})

// (v0.773.0) THE WALK-FAIL'S OWN SEATS - the chest-walk book's bot-level
// lens tests. The face-72 cell is the mine's own byBot distribution
// (37632243441): 42 fails across 18 bots, no solo owner - the bill's tie
// law reads the honest silence and the riders price the crowd.
test('walk-fail seats: the face-72 cell - the bill silent, the riders price the crowd', () => {
  // the mine's own per-bot read (decompose-face72.txt line 310), byte-honest
  const byBot = { F7: 6, F17: 5, F8: 4, F11: 4, F16: 3, F9: 3, F2: 2, F14: 2, F19: 2, F18: 2, F13: 2, F6: 1, F3: 1, F15: 1, F1: 1, F5: 1, F10: 1, F4: 1 }
  assert.equal(Object.values(byBot).reduce((a, b) => a + b, 0), 42)
  const bill = walkFailBotBill(byBot)
  assert.equal(bill, null) // F7's 6 own at most a quarter - no strict majority, the tie law holds
  const r = walkFailRiders(byBot)
  assert.deepEqual(r, { leader: 'F7', leaderOwns: 6, runner: 'F17', runnerOwns: 5, ofFails: 42, pairOwns: 11, shareOfFails: 0.262, duet: false })
  assert.equal(walkFailRidersRow(r), `the walk-fail's own riders (v0.773.0): no solo walker owns the majority - F7 x6 + F17 x5 own 11 of 42 fail(s) (26.2%) - THE CROWD'S OWN WALK: the bill's tie law held, the spread is the shape - the fleet's own crowd prices the starves the solo law refused to name`)
  // the additive law: the census's own cells stay byte-untouched and the
  // lens reads THE SAME cell the decompose prints (zero re-parsing)
  const c = walkFailCensus([
    'F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F7 iron commune: chest walk failed (No path to the goal!)',
    'F17 iron commune: chest walk failed (Took to long to decide path to goal!)',
    'F8 fuel commons: chest walk failed (iron commune walk @-118,404: timeout after 528ms)'
  ])
  assert.equal(c.walk.total, 4)
  assert.deepEqual(c.walk.byBot, { F7: 2, F17: 1, F8: 1 })
  const cr = walkFailRiders(c.walk.byBot)
  assert.deepEqual(cr, { leader: 'F7', leaderOwns: 2, runner: 'F17', runnerOwns: 1, ofFails: 4, pairOwns: 3, shareOfFails: 0.75, duet: false })
})

test('walk-fail seats: the bill owns in its strict-majority case; the tie owns nothing', () => {
  const bill = walkFailBotBill({ F7: 23, F17: 5, F8: 4 })
  assert.deepEqual(bill, { bot: 'F7', owns: 23, ofFails: 32, shareOfFails: 0.719 })
  assert.equal(walkFailBotBillRow(bill), `the walk-fail's own bill (v0.773.0): F7 owns 23 of 32 fail(s) (71.9%) - THE REPEAT WALKER'S OWN SEAT: one walker's own lanes own the starves - the crowded sky's own verdict prices the walker's walks`)
  // a tie owns nothing (the storm-has-no-seat precedent) - and the tied
  // riders keep the deterministic order (count desc, then the name's own)
  const tie = walkFailBotBill({ F7: 6, F17: 6 })
  assert.equal(tie, null)
  const tr = walkFailRiders({ F17: 6, F7: 6 })
  assert.equal(tr.duet, true)
  // the deterministic order: count desc, then the NAME's own - and 'F17' <
  // 'F7' byte-wise ('1' < '7' at index 1), so the tie reads F17 first
  assert.equal(tr.leader, 'F17')
  assert.equal(tr.runner, 'F7')
  assert.equal(walkFailRidersRow(tr), `the walk-fail's own riders (v0.773.0): no solo walker owns the majority - F17 x6 + F7 x6 own 12 of 12 fail(s) (100.0%) - THE CROWD'S OWN WALK: the bill's tie law held, the spread is the shape - the fleet's own crowd prices the starves the solo law refused to name`)
})

test('walk-fail seats: the junk battery never invents a rider or a shape', () => {
  for (const junk of [undefined, null, 42, 'str', [], {}]) {
    assert.equal(walkFailBotBill(junk), null, `bill must stay silent on ${JSON.stringify(junk)}`)
    assert.equal(walkFailRiders(junk), null, `riders must stay silent on ${JSON.stringify(junk)}`)
    assert.equal(walkFailBotBillRow(junk), null)
    assert.equal(walkFailRidersRow(junk), null)
  }
  // non-finite and non-positive counts are skipped, never priced
  const skewed = walkFailBotBill({ F7: 3, F9: -1, F10: 0, F11: NaN })
  assert.deepEqual(skewed, { bot: 'F7', owns: 3, ofFails: 3, shareOfFails: 1 })
  // a single walker owns the book but the riders need two
  assert.deepEqual(walkFailRiders({ F7: 6 }), null)
  // a junk-silent bill feeds no row
  assert.equal(walkFailBotBillRow({ bot: 'F7', owns: 50, ofFails: 30, shareOfFails: 1.667 }), null)
})

test('WIRING: decompose seats the walk-fail book in the census\'s own shadow', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  // the branch rides the byBot cell the decompose already prints
  assert.ok(src.includes('walkFailBotBill(wf.walk.byBot)'), 'the bill must read the census\'s own byBot cell')
  assert.ok(src.includes('walkFailRiders(wf.walk.byBot)'), 'the riders must read the census\'s own byBot cell')
  assert.ok(src.includes('walkFailRidersRow'), 'the riders row must ride the import tail')
  // the row prose lives only in the lib (the v0.767.0 wiring law) - the
  // anchors are the row tails, NOT the bare 'THE CROWD' (the v0.727.0
  // crowded-sky row legitimately prints inline in the decompose)
  assert.ok(!src.includes("THE CROWD'S OWN WALK"), 'the row prose must stay in the lib')
  assert.ok(!src.includes("THE REPEAT WALKER'S OWN SEAT"), 'the row prose must stay in the lib')
})

test('walk-fail lane: the face-73 cell - the fuel lane owns the book (the bill\'s first field case)', () => {
  // the census's own byLane cell stays byte-untouched and the lens reads
  // THE SAME cell the decompose prints (zero re-parsing - the additive law)
  const c = walkFailCensus([
    'F18 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F11 iron commune: chest walk failed (No path to the goal!)',
    'F5 food commons: chest walk failed (walk timeout after 7037ms)'
  ])
  assert.equal(c.walk.total, 3)
  assert.deepEqual(c.walk.byLane, { 'fuel commons': 1, 'iron commune': 1, 'food commons': 1 })
  // face 73's own lane distribution as the agreeing witness (the mine's
  // own split: fuel commons=21 iron commune=9 food commons=7)
  const bill = walkFailLaneBill({ 'fuel commons': 21, 'iron commune': 9, 'food commons': 7 })
  assert.deepEqual(bill, { lane: 'fuel commons', owns: 21, ofFails: 37, shareOfFails: 0.568 })
  assert.equal(walkFailLaneBillRow(bill), `the walk-fail's own lane bill (v0.776.0): fuel commons owns 21 of 37 fail(s) (56.8%) - THE LANE'S OWN SEAT: one lane's own walks own the starves - the lane's own front prices the walks the raw split rode unnamed`)
})

test('walk-fail lane: the tie owns nothing; the no-majority mix keeps the deterministic order', () => {
  // a tie owns nothing (the storm-has-no-seat precedent) - and the tied
  // riders keep the deterministic order (count desc, then the name's own:
  // 'fuel commons' < 'iron commune' byte-wise)
  const tie = walkFailLaneBill({ 'fuel commons': 5, 'iron commune': 5 })
  assert.equal(tie, null)
  const tr = walkFailLaneRiders({ 'iron commune': 5, 'fuel commons': 5 })
  assert.equal(tr.duet, true)
  assert.equal(tr.leader, 'fuel commons')
  assert.equal(tr.runner, 'iron commune')
  // the no-majority spread: the top lane at or under the rest reads the
  // bill's silence, the riders price the pair's concentration
  const spread = walkFailLaneBill({ 'iron commune': 9, 'food commons': 7, 'fuel commons': 6 })
  assert.equal(spread, null)
  const sr = walkFailLaneRiders({ 'iron commune': 9, 'food commons': 7, 'fuel commons': 6 })
  assert.deepEqual(sr, { leader: 'iron commune', leaderOwns: 9, runner: 'food commons', runnerOwns: 7, ofFails: 22, pairOwns: 16, shareOfFails: 0.727, duet: false })
  assert.equal(walkFailLaneRidersRow(sr), `the walk-fail's own lane riders (v0.776.0): no solo lane owns the majority - iron commune x9 + food commons x7 own 16 of 22 fail(s) (72.7%) - THE LANE MIX'S OWN WALK: the bill's tie law held, the mix is the shape - the lanes' own crowd prices the starves the solo law refused to name`)
})

test('walk-fail lane: the junk battery never invents a lane or a shape', () => {
  for (const junk of [undefined, null, 42, 'str', [], {}]) {
    assert.equal(walkFailLaneBill(junk), null, `bill must stay silent on ${JSON.stringify(junk)}`)
    assert.equal(walkFailLaneRiders(junk), null, `riders must stay silent on ${JSON.stringify(junk)}`)
    assert.equal(walkFailLaneBillRow(junk), null)
    assert.equal(walkFailLaneRidersRow(junk), null)
  }
  // non-finite and non-positive counts are skipped, never priced
  const skewed = walkFailLaneBill({ 'fuel commons': 3, 'iron commune': -1, 'food commons': 0, bare: NaN })
  assert.deepEqual(skewed, { lane: 'fuel commons', owns: 3, ofFails: 3, shareOfFails: 1 })
  // a single lane owns the book but the riders need two
  assert.deepEqual(walkFailLaneRiders({ 'fuel commons': 6 }), null)
  assert.deepEqual(walkFailLaneBill({ 'fuel commons': 6 }), { lane: 'fuel commons', owns: 6, ofFails: 6, shareOfFails: 1 })
  // a junk-silent bill feeds no row
  assert.equal(walkFailLaneBillRow({ lane: 'fuel commons', owns: 50, ofFails: 30, shareOfFails: 1.667 }), null)
})

test('WIRING: decompose seats the walk-fail lane book beside the bot seats', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  // the branch rides the byLane cell the decompose already prints
  assert.ok(src.includes('walkFailLaneBill(wf.walk.byLane)'), 'the lane bill must read the census\'s own byLane cell')
  assert.ok(src.includes('walkFailLaneRiders(wf.walk.byLane)'), 'the lane riders must read the census\'s own byLane cell')
  assert.ok(src.includes('walkFailLaneRidersRow'), 'the lane riders row must ride the import tail')
  // the row prose lives only in the lib (the v0.767.0 wiring law) - the
  // anchors are the full row tails, not any bare substring
  assert.ok(!src.includes("THE LANE'S OWN SEAT"), 'the lane bill row prose must stay in the lib')
  assert.ok(!src.includes("THE LANE MIX'S OWN WALK"), 'the lane riders row prose must stay in the lib')
})
