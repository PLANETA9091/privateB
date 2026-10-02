//
// tablegate.test.mjs - THE TABLE GATE (v0.495.0) unit tests.
// The lines are byte-verbatim from the stored faces (face 42 = run108,
// face 43 = run84a fleet19.log), hand-traced first, then pinned.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  tableGate, timeoutMs, TABLE_OK_RE, TABLE_FAIL_RE, TABLE_DROUGHT_RE,
  TABLE_RUNG_RE, TABLE_ATTEMPT_RE, TABLE_ALLFAIL_RE, TABLE_STICKS_RE
} from '../../src/lib/tablegate.mjs'
import { armoryCensus } from '../../src/lib/armorycensus.mjs'
import { VERDICT_RE } from '../../src/lib/upgradecensus.mjs'

// Face 42's table gate, verbatim and in the live order: three droughts
// rescued 3/3 by the plank rung, three clean gates, and F3's [upgrade]
// machinery - two timeout attempts plus the all-variants verdict, the
// flow dying below with a different terminal (upgradecensus's skin).
const FACE42_MINI = [
  'F16 [toolupgrade] craft crafting_table: no craftable recipe variant (ingredients missing?)',
  'F16 [toolupgrade] plank rung: converted 1->5 same-type planks (need 4, from oak_log)',
  'F16 [toolupgrade] spare table: crafted',
  'F9 [toolupgrade] craft crafting_table: no craftable recipe variant (ingredients missing?)',
  'F9 [toolupgrade] plank rung: converted 1->5 same-type planks (need 4, from oak_log)',
  'F9 [toolupgrade] spare table: crafted',
  'F17 [toolupgrade] spare table: crafted',
  'F15 [toolupgrade] craft crafting_table: no craftable recipe variant (ingredients missing?)',
  'F15 [toolupgrade] plank rung: converted 1->4 same-type planks (need 4, from oak_log)',
  'F15 [toolupgrade] spare table: crafted',
  'F3 [toolupgrade] [upgrade] craft crafting_table: variant#2 attempt0 failed: craft crafting_table: timeout after 7000ms',
  'F3 [toolupgrade] [upgrade] craft crafting_table: variant#2 attempt1 failed: craft crafting_table: timeout after 7000ms',
  'F3 [toolupgrade] [upgrade] craft crafting_table: all 1 variant(s) failed, last: craft crafting_table: timeout after 7000ms',
  'F13 [toolupgrade] spare table: crafted',
  'F19 [toolupgrade] spare table: crafted'
]

// Face 43's table gate, verbatim: the woodless pocket - zero gates
// opened, F4's clean refusal (no wood legs at all) and F5's
// sticks-but-no-planks signature (sticks do not substitute for the
// 2x2's 4-of-one-type plank floor).
const FACE43_MINI = [
  'F15 [toolupgrade] [upgrade] craft crafting_table: variant#2 attempt0 failed: craft crafting_table: timeout after 7000ms',
  'F15 [toolupgrade] [upgrade] craft crafting_table: variant#2 attempt1 failed: craft crafting_table: timeout after 7000ms',
  'F15 [toolupgrade] [upgrade] craft crafting_table: all 1 variant(s) failed, last: craft crafting_table: timeout after 7000ms',
  'F4 [toolupgrade] craft crafting_table: no craftable recipe variant (ingredients missing?)',
  'F4 [toolupgrade] spare table: FAILED',
  'F5 [toolupgrade] sticks: crafted (have 5)',
  'F5 [toolupgrade] craft crafting_table: no craftable recipe variant (ingredients missing?)',
  'F5 [toolupgrade] spare table: FAILED'
]

test('v0.495.0 face-42 mini: six gates all opened, the plank rung rescues 3/3 droughts, F3 pays the timeout tax', () => {
  const g = tableGate(FACE42_MINI)
  assert.equal(g.totals.ok, 6)
  assert.equal(g.totals.failed, 0)
  assert.equal(g.totals.droughts, 3)
  assert.equal(g.totals.rungs, 3)
  // The rung yield: 1->5 buys 4 planks, 1->5 buys 4, 1->4 buys 3.
  assert.equal(g.totals.rungPlanks, 11)
  assert.equal(g.totals.attempts, 2)
  assert.equal(g.totals.timeoutMs, 14000)
  assert.equal(g.totals.otherAttempts, 0)
  assert.equal(g.totals.allFails, 1)
  assert.equal(g.totals.total, 15)
  // The clean gate: F17's single line, no struggle legs at all (no
  // opener exists - the pure census law).
  assert.deepEqual(g.bots.F17, {
    ok: 1, failed: 0, droughts: 0, rungs: 0, rungPlanks: 0,
    sticks: 0, stickHolds: 0, attempts: 0, timeoutMs: 0,
    otherAttempts: 0, allFails: 0
  })
  // The rescued gate: drought -> rung -> crafted, one episode's legs.
  assert.equal(g.bots.F16.droughts, 1)
  assert.equal(g.bots.F16.rungs, 1)
  assert.equal(g.bots.F16.rungPlanks, 4)
  assert.equal(g.bots.F16.ok, 1)
  // The timeout bot: two priced attempts, the all-failed verdict, zero
  // gate opened (the tax bought nothing).
  assert.equal(g.bots.F3.ok, 0)
  assert.equal(g.bots.F3.attempts, 2)
  assert.equal(g.bots.F3.timeoutMs, 14000)
  assert.equal(g.bots.F3.allFails, 1)
})

test('v0.495.0 face-43 mini: the woodless pocket - zero gates opened, F4 pays clean, F5 shows the sticks-but-no-planks signature', () => {
  const g = tableGate(FACE43_MINI)
  assert.equal(g.totals.ok, 0)
  assert.equal(g.totals.failed, 2)
  assert.equal(g.totals.droughts, 2)
  assert.equal(g.totals.rungs, 0)
  assert.equal(g.totals.sticks, 1)
  assert.equal(g.totals.stickHolds, 5)
  assert.equal(g.totals.attempts, 2)
  assert.equal(g.totals.timeoutMs, 14000)
  assert.equal(g.totals.allFails, 1)
  assert.equal(g.totals.total, 8)
  // F4: the zero-wood bot - the drought and the refusal, nothing else.
  assert.deepEqual(g.bots.F4, {
    ok: 0, failed: 1, droughts: 1, rungs: 0, rungPlanks: 0,
    sticks: 0, stickHolds: 0, attempts: 0, timeoutMs: 0,
    otherAttempts: 0, allFails: 0
  })
  // F5: sticks exist (have 5) but the 2x2 needs 4 planks of ONE type -
  // the stick rung does not substitute for the plank floor.
  assert.equal(g.bots.F5.sticks, 1)
  assert.equal(g.bots.F5.stickHolds, 5)
  assert.equal(g.bots.F5.droughts, 1)
  assert.equal(g.bots.F5.failed, 1)
  assert.equal(g.bots.F5.rungs, 0)
})

test('v0.495.0 both-faces aggregate: the woodless law - every refused bot has zero plank rungs, the rung is the difference', () => {
  const g = tableGate([...FACE42_MINI, ...FACE43_MINI])
  assert.equal(g.totals.ok, 6)
  assert.equal(g.totals.failed, 2)
  assert.equal(g.totals.droughts, 5)
  assert.equal(g.totals.rungs, 3)
  assert.equal(g.totals.rungPlanks, 11)
  assert.equal(g.totals.attempts, 4)
  assert.equal(g.totals.timeoutMs, 28000)
  assert.equal(g.totals.allFails, 2)
  assert.equal(g.totals.sticks, 1)
  assert.equal(g.totals.total, 23)
  // THE WOODLESS LAW: both refused bots sum zero plank rungs; all
  // three rescued gates rode their rung to 'crafted'.
  const failedRungs = Object.entries(g.bots)
    .filter(([bot, b]) => b.failed > 0)
    .reduce((a, [, b]) => a + b.rungs, 0)
  assert.equal(failedRungs, 0)
  // The timeout tax bought zero tables on both faces. The per-name
  // map merges the two runs' bots (the cross-face lesson, fire-2330):
  // F15 is BOTH lives - face-42's F15 opened its gate (ok 1) AND
  // face-43's F15 paid the tax (attempts 2, allFails 1) - while F3,
  // face-43-absent, stays the clean zero.
  assert.equal(g.bots.F3.ok, 0)
  assert.equal(g.bots.F15.ok, 1)
  assert.equal(g.bots.F15.attempts, 2)
  assert.equal(g.bots.F15.allFails, 1)
  assert.equal(g.bots.F15.timeoutMs, 14000)
})

test('v0.495.0 the scope pins: the lane hand-off law holds, the flow terminal is never claimed, non-timeout whys land the honest bucket', () => {
  // The arms-lane parser never touches the toolupgrade skins - one
  // parser per emitter (countergap pins 'spare table:' out, the armory
  // census reads the 'F2 sword:' skins only).
  assert.equal(armoryCensus(FACE42_MINI).total, 0)
  assert.equal(armoryCensus(FACE43_MINI).total, 0)
  // The flow terminal ('tool upgrade: failed -> ...') belongs to
  // upgradecensus's VERDICT_RE - the table gate never claims it.
  const flowTerminal = 'F4 tool upgrade: failed -> none (cannot make a spare table (no 4 planks of one type?))'
  assert.equal(tableGate([flowTerminal]).totals.total, 0)
  assert.equal(VERDICT_RE.test(flowTerminal), true)
  // The drought RE reads both skins (bare flow + [upgrade] machinery).
  assert.equal(TABLE_DROUGHT_RE.test('F9 [toolupgrade] craft crafting_table: no craftable recipe variant (ingredients missing?)'), true)
  assert.equal(TABLE_DROUGHT_RE.test('F9 [toolupgrade] [upgrade] craft crafting_table: no craftable recipe variant (ingredients missing?)'), true)
  // A non-timeout attempt why: priced zero, filed the honest bucket.
  const other = 'F7 [toolupgrade] [upgrade] craft crafting_table: variant#1 attempt0 failed: craft crafting_table: interrupted'
  const g = tableGate([other])
  assert.equal(g.totals.attempts, 1)
  assert.equal(g.totals.otherAttempts, 1)
  assert.equal(g.totals.timeoutMs, 0)
  assert.equal(g.bots.F7.otherAttempts, 1)
  // The timeout helper: the tail-anchored read, junk-safe.
  assert.equal(timeoutMs('craft crafting_table: timeout after 7000ms'), 7000)
  assert.equal(timeoutMs('interrupted'), 0)
  assert.equal(timeoutMs(undefined), 0)
  // The RE anchors: the all-failed verdict's nested why rides the wide
  // capture; the sticks skin reads the have-field.
  assert.equal(TABLE_ALLFAIL_RE.test(FACE42_MINI[12]), true)
  assert.equal(TABLE_ATTEMPT_RE.exec(FACE42_MINI[10])[3], '0')
  assert.equal(TABLE_STICKS_RE.exec('F5 [toolupgrade] sticks: crafted (have 5)')[2], '5')
  assert.equal(TABLE_RUNG_RE.exec('F15 [toolupgrade] plank rung: converted 1->4 same-type planks (need 4, from oak_log)')[5], 'oak_log')
  assert.equal(TABLE_OK_RE.test('F17 [toolupgrade] spare table: crafted'), true)
  assert.equal(TABLE_FAIL_RE.test('F4 [toolupgrade] spare table: FAILED'), true)
})

test('v0.495.0 junk battery: non-strings skipped, garbage and blobs read the honest zero', () => {
  assert.equal(tableGate(null), null)
  assert.equal(tableGate('not an array'), null)
  const g = tableGate([undefined, null, 42, { line: true }, '', 'garbage line', 'F1 [toolupgrade] spare table: crafted ', '  F1 [toolupgrade] spare table: crafted', 'F1 [toolupgrade] spare table: CRAFTED', 'blob (spare table: crafted) (F2)'])
  assert.equal(g.totals.ok, 0)
  assert.equal(g.totals.total, 0)
  assert.deepEqual(g.bots, {})
  // An empty face reads the honest zero (the table-less fleet is
  // itself the read).
  const z = tableGate([])
  assert.equal(z.totals.ok, 0)
  assert.equal(z.totals.total, 0)
})
