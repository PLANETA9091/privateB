// v0.372.0 THE CRITICAL-LUNG VETO - the F6 ladder's residual whale.
// MEASURED (face 36760275928, mined 2026-10-01): F6 froze head-wet in the
// lake column [-127,52,411] and the v0.361.0 saver relogged it four
// consecutive times - every reconnect dropped the bot back into the SAME
// water and the server kept draining across every reconnect dead window
// (the ladder the bypass echoes read: o2 4 -> 1 -> 0). The streak-4 fatal
// page woke to o2=0 and a 1.9s window ('breath mirror [rescue-ran] ... its
// own timeline lines own the failure') - the rescue machinery worked AS
// DESIGNED and lost, because the DECISION that fed the loop never read the
// bar. The veto: one relog already failed (r >= 1) + the bar critical =>
// the relog is refused, the air stays in-session, the sentry re-pages and
// the rescue re-verdicts on the same client.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { frozenRelogDecision, OXYGEN_CRITICAL_LEVEL, FROZEN_RELOG_LOOP_CAP } from '../../src/lib/drowning.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const minerSrc = readFileSync(join(here, '../../src/bots/miner.mjs'), 'utf8')

const VETO_WHY = /critical lungs on a proven column/

test('criticalLungVeto: the veto class - one relog already failed and the bar reads critical', () => {
  assert.equal(OXYGEN_CRITICAL_LEVEL, 4, 'the critical bar the veto reads (the run77-era constant)')
  for (const r of [1, 2, 3]) {
    const d = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: 4, consecutiveRelogs: r })
    assert.equal(d.relog, false, `streak ${r}: the reconnect lane is refused`)
    assert.equal(d.loopBreak, true, `streak ${r}: the refusal names its class for the caller's log lane`)
    assert.match(d.why, VETO_WHY, `streak ${r}: the why names the lungs`)
    assert.match(d.why, /the reconnect spends the air the rescue still owns/, `streak ${r}: the why names the spend`)
  }
  const one = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: 4, consecutiveRelogs: 1 })
  assert.match(one.why, /1 relog deep/, 'the singular reads honest')
  const three = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: 1, consecutiveRelogs: 3 })
  assert.match(three.why, /3 relogs deep/, 'the plural reads honest')
})

test('criticalLungVeto: the F6 ladder replay - the ladder stops at the FIRST critical read', () => {
  // face 36760275928's ladder: relog #1 lived (o2 healthy), relogs #2-#4
  // each dropped the bot back into the column with the bar sinking
  // (o2 4 -> 1 -> 0). The old decision relogged every one of them; the
  // veto refuses from relog #2 (r >= 1) on - the fatal o2=0 page never
  // gets its reconnect spend.
  const ladder = [
    { r: 0, o2: 12 }, // relog #1: the saver keeps its authority (o2 healthy)
    { r: 1, o2: 4 },  // relog #2: VETOED (the old code fired it)
    { r: 2, o2: 1 },  // relog #3: VETOED
    { r: 3, o2: 0 }   // relog #4: VETOED
  ]
  for (const { r, o2 } of ladder) {
    const d = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: o2, consecutiveRelogs: r })
    if (r === 0) {
      assert.equal(d.relog, true, 'relog #1: the one-off freeze keeps the fast lane (the v0.96.0 law)')
      assert.equal(d.loopBreak, undefined, 'relog #1: no break field on the saver path')
    } else {
      assert.equal(d.relog, false, `relog #${r + 1} (o2=${o2}): the ladder is refused`)
      assert.equal(d.loopBreak, true, `relog #${r + 1} (o2=${o2}): the refusal rides the loop-break lane`)
    }
  }
})

test('criticalLungVeto: the first relog keeps the fast lane even on dead lungs', () => {
  // A one-off freeze with critical lungs is exactly the fast lane's client:
  // the stand-down takes ~75s to arm, the reconnect takes seconds. The veto
  // needs the loop PROVEN (r >= 1) - a missing cycle never spends one.
  for (const o2 of [4, 1, 0, -1]) {
    const d = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: o2, consecutiveRelogs: 0 })
    assert.equal(d.relog, true, `o2=${o2}: the first wet relog fires (the v0.96.0 saver, byte-identical)`)
    assert.equal(d.loopBreak, undefined, `o2=${o2}: no break field`)
  }
  const deep = frozenRelogDecision({ frozenStandDowns: 3, headWet: true, oxygen: 0, consecutiveRelogs: 0 })
  assert.deepEqual(deep, { relog: true, why: '3 consecutive frozen verdicts' },
    'the legacy threshold on a first-ever wet relog rides byte-identical')
})

test('criticalLungVeto: the boundary is the constant - o2 5 keeps the saver, o2 4 vetoes', () => {
  assert.equal(FROZEN_RELOG_LOOP_CAP, 4, 'the CAP constant this veto bounds')
  const above = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: 5, consecutiveRelogs: 2 })
  assert.deepEqual(above, { relog: true, why: 'frozen while head-wet (1 verdict) - the drowning clock owns this client' },
    'one bar above critical: the saver keeps its byte-identical why')
  const at = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: 4, consecutiveRelogs: 2 })
  assert.equal(at.loopBreak, true, 'at the critical bar: the veto fires')
})

test('criticalLungVeto: the legacy leak is closed - the lungs outrank the threshold', () => {
  // The legacy path (n >= t) returned relog UNCONDITIONALLY before - a wet
  // bot with critical lungs that rode three verdicts past a veto would have
  // had the ladder resumed from the legacy lane. The lungs do not care
  // which path armed the relog.
  const leaked = frozenRelogDecision({ frozenStandDowns: 3, headWet: true, oxygen: 0, consecutiveRelogs: 1 })
  assert.equal(leaked.relog, false, 'the legacy lane cannot relog a critical-lung column bot')
  assert.equal(leaked.loopBreak, true, 'the refusal names its class')
  const dry = frozenRelogDecision({ frozenStandDowns: 3, headWet: true, oxygen: 20, consecutiveRelogs: 1 })
  assert.deepEqual(dry, { relog: true, why: '3 consecutive frozen verdicts' },
    'the legacy backstop rides byte-identical when the lungs are not critical')
})

test('criticalLungVeto: junk oxygen never spends a veto (the gates-decide convention)', () => {
  for (const junk of [undefined, null, NaN, '0', -Infinity]) {
    const d = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: junk, consecutiveRelogs: 2 })
    assert.equal(d.relog, true, `junk o2 ${String(junk)}: the lost read cannot spend the emergency`)
    assert.equal(d.loopBreak, undefined, `junk o2 ${String(junk)}: no break field`)
  }
})

test('criticalLungVeto: junk streaks never arm a veto either', () => {
  for (const junk of [undefined, null, NaN, -4, '3']) {
    const d = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: 0, consecutiveRelogs: junk })
    assert.equal(d.relog, true, `junk streak ${String(junk)} reads 0 - the veto needs a PROVEN cycle`)
    assert.equal(d.loopBreak, undefined, `junk streak ${String(junk)}: no break field`)
  }
})

test('criticalLungVeto: the CAP priority - the lungs are the sharper story when both arm', () => {
  // r >= CAP arms the loop break AND (at o2=0) the veto: the veto's why
  // wins - the loop count is academic when the lungs are spent. With the
  // bar healthy the CAP break's why rides byte-identical.
  const both = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: 0, consecutiveRelogs: 4 })
  assert.match(both.why, VETO_WHY, 'the veto outranks the CAP break when both arm')
  const capOnly = frozenRelogDecision({ frozenStandDowns: 1, headWet: true, oxygen: 20, consecutiveRelogs: 4 })
  assert.match(capOnly.why, /wet-relog loop proven \(4 consecutive\)/, 'the CAP break keeps its byte-identical why')
  assert.match(capOnly.why, /the legacy threshold owns the next relog/, 'the CAP backstop story intact')
})

test('criticalLungVeto: the DRY path is untouched - the veto is a wet gate', () => {
  const dry = frozenRelogDecision({ frozenStandDowns: 1, headWet: false, oxygen: 0, consecutiveRelogs: 1 })
  assert.deepEqual(dry, { relog: false, why: '1/3 flat stand-downs' },
    'a dry frozen bot with a critical bar rides the flat stand-down (the wet branch owns the veto)')
  assert.equal(dry.loopBreak, undefined, 'no break field on the dry path')
})

test('criticalLungVeto: the wiring pins - the verdict bar reaches the decision', () => {
  const call = minerSrc.indexOf('frozenRelogDecision({ frozenStandDowns, hasEntity:')
  assert.ok(call >= 0, 'the single decision call site exists')
  const slice = minerSrc.slice(call, call + 240)
  assert.ok(slice.includes('headWet: frozenDownWet'), 'the wet read rides the call')
  assert.ok(slice.includes('oxygen: frozenDownO2'), 'the bar at the verdict rides the call (the veto reads frozenDownO2)')
  assert.ok(slice.includes('consecutiveRelogs: frozenRelogStreaks.get(username)'), 'the streak rides the call')
  assert.ok(minerSrc.includes("log(`${tag} water: frozen-relog loop break (#${frozenRelogStreaks.get(username) || 0} consecutive) (${esc.why})"),
    'the refusal rides the existing loop-break log lane (the decompose counter stays out - it counts /frozen client relog/)')
})
