import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { finalBankDoomLatch, FINAL_BANK_DOOM_LATCH_CYCLES } from '../../src/lib/endphase.mjs'

// ---------------------------------------------------------------------------
// (v0.316.0) THE SHAFT-BOTTOM DOOM LATCH. MEASURED (fleet 36592026195, the
// four-instrument face, mined 2713 @ 4.52 b/s): banked=83 with every bot's
// final bank reading 0 - 17 verdicts rode 'still underground after 1-2 climb
// attempts' and F9 alone printed the SAME verdict SEVEN times (log lines
// 1766->2514), each reconnect re-entry re-paying two fenced climbOut calls
// on the same shaft bottom. The latch counts the failed cycles and refuses
// the chain at the door from the third entry.

const FLEET = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('the fleet datum: two failed shaft-bottom cycles latch the third entry', () => {
  // the F9 shape: cycle 1 and 2 each paid the stagger + two fenced climbs and
  // earned the identical zero - the third entry must not pay again
  assert.equal(finalBankDoomLatch({ failedCycles: 1 }).latched, false)
  assert.equal(finalBankDoomLatch({ failedCycles: 2 }).latched, true)
  // the observed extremes: one cycle keeps the chain honest, seven (the F9
  // count) is deep inside the latch
  assert.equal(finalBankDoomLatch({ failedCycles: 7 }).latched, true)
})

test('the boundary is exact and the failed count rides back out', () => {
  const one = finalBankDoomLatch({ failedCycles: 1 })
  assert.equal(one.latched, false)
  assert.equal(one.failed, 1)
  const two = finalBankDoomLatch({ failedCycles: 2 })
  assert.equal(two.latched, true)
  assert.equal(two.failed, 2)
})

test('the threshold override: a stricter latch moves the door', () => {
  assert.equal(finalBankDoomLatch({ failedCycles: 2, latchCycles: 3 }).latched, false)
  assert.equal(finalBankDoomLatch({ failedCycles: 3, latchCycles: 3 }).latched, true)
  // junk threshold reads the default 2 (the fleet's priced shape)
  assert.equal(finalBankDoomLatch({ failedCycles: 2, latchCycles: NaN }).latched, true)
  assert.equal(finalBankDoomLatch({ failedCycles: 2, latchCycles: 0 }).latched, true)
  assert.equal(finalBankDoomLatch({ failedCycles: 2, latchCycles: -4 }).latched, true)
})

test('the junk battery: missing evidence is not a doom (the body-guard law)', () => {
  for (const junk of [null, undefined, NaN, 'three', {}, -1, -100]) {
    const v = finalBankDoomLatch({ failedCycles: junk })
    assert.equal(v.latched, false, `junk ${String(junk)} never latches`)
    assert.equal(v.failed, 0)
  }
  // the body guard itself: a null CALL must not throw
  assert.equal(finalBankDoomLatch(null).latched, false)
  assert.equal(finalBankDoomLatch().latched, false)
})

test('the constants pin: the latch sits at two failed cycles', () => {
  assert.equal(FINAL_BANK_DOOM_LATCH_CYCLES, 2)
})

test('wiring: the fleet runner feeds the latch and refuses at the door', () => {
  // the import rides the endphase line
  assert.ok(
    /import \{[^}]*finalBankDoomLatch[^}]*\} from '\.\.\/src\/lib\/endphase\.mjs'/.test(FLEET),
    'finalBankDoomLatch is imported from endphase.mjs'
  )
  // the per-bot closure counter exists (run-scoped, survives reconnects)
  assert.ok(FLEET.includes('let finalBankDoomCycles = 0'), 'the per-bot cycle counter is declared')
  // the failed cycle feeds the latch AT the 'still underground' verdict site
  const verdictIdx = FLEET.indexOf('the chain from the shaft bottom is doomed walks)`)')
  assert.ok(verdictIdx > 0, 'the verdict render site exists')
  const incrementIdx = FLEET.indexOf('finalBankDoomCycles++', verdictIdx)
  assert.ok(incrementIdx > verdictIdx && incrementIdx - verdictIdx < 400, 'the increment rides the verdict')
  // the latch gate sits BEFORE the night hold and is bankable-gated
  const gateIdx = FLEET.indexOf('if (bankable && doomLatch.latched)')
  const nightIdx = FLEET.indexOf("surfaceHoldVerdict({ timeOfDay: miner.bot.time?.timeOfDay, purpose: 'final-bank' })")
  assert.ok(gateIdx > 0, 'the latch gate exists')
  assert.ok(nightIdx > gateIdx, 'the latch outranks the night hold (the refusal is the terminal truth)')
  // the refusal names itself and hands the clock back
  assert.ok(FLEET.includes('dooms-latched after'), 'the refusal line names the latch')
  assert.ok(FLEET.includes('the chain is refused, the clock mines on'), 'the refusal names where the clock goes')
})

// ---------------------------------------------------------------------------
// (v0.351.0) THE ONE-SHOT RE-ARM - face 36710193486 (the ninth, calm) priced
// the latch's own tail: F16 latched at 2 failed climb cycles and the chain was
// refused for the REST of the run ('final bank: 0 (dooms-latched ...)' five
// verdicts deep) while the pocket grew unbanked. The latch now carries ONE
// re-arm: the first latched verdict opens the 120s cooldown; once paid, the
// door opens for exactly one more cycle - a still-doomed bottom re-latches
// terminally, a proven climb un-dooms the bottom entirely.
import { FINAL_BANK_DOOM_REARM_MS } from '../../src/lib/endphase.mjs'

test('the face-9 datum: the re-arm grants after the cooldown, never before it', () => {
  const t0 = 1000000
  // the first latched verdict: no timestamp yet -> the latch stands, no re-arm
  const first = finalBankDoomLatch({ failedCycles: 2, rearmed: false, latchAt: 0, now: t0 })
  assert.equal(first.latched, true)
  assert.equal(first.rearmGranted, false)
  // the cooldown riding: 119s in - still the terminal latch
  const mid = finalBankDoomLatch({ failedCycles: 2, rearmed: false, latchAt: t0, now: t0 + 119000 })
  assert.equal(mid.latched, true)
  assert.equal(mid.rearmGranted, false)
  // the cooldown paid: the door opens for exactly one more cycle
  const armed = finalBankDoomLatch({ failedCycles: 2, rearmed: false, latchAt: t0, now: t0 + 120000 })
  assert.equal(armed.latched, false, 'the re-armed chain rides')
  assert.equal(armed.rearmGranted, true, 'the grant names itself')
  // the exact boundary is inclusive (t0 + rearmMs grants)
  assert.equal(finalBankDoomLatch({ failedCycles: 2, rearmed: false, latchAt: t0, now: t0 + FINAL_BANK_DOOM_REARM_MS }).rearmGranted, true)
})

test('the one-shot law: a spent re-arm never grants again - the next failure re-latches terminally', () => {
  const t0 = 1000000
  const spent = finalBankDoomLatch({ failedCycles: 3, rearmed: true, latchAt: t0, now: t0 + 999999 })
  assert.equal(spent.latched, true, 'the re-armed cycle failed -> terminal')
  assert.equal(spent.rearmGranted, false, 'no second re-arm, ever')
  // even a still-standing count cannot re-grant once the shot is spent
  assert.equal(finalBankDoomLatch({ failedCycles: 2, rearmed: true, latchAt: t0, now: t0 + 120000 }).latched, true)
})

test('the re-arm junk battery: junk in any clock keeps the terminal latch (missing evidence is not a re-arm)', () => {
  const t0 = 1000000
  for (const [latchAt, now, rearmMs] of [[0, t0 + 999999, 120000], [t0, NaN, 120000], [t0, undefined, 120000], [t0, t0 + 999999, 0], [t0, t0 + 999999, -5], [NaN, t0 + 999999, 120000]]) {
    const v = finalBankDoomLatch({ failedCycles: 2, rearmed: false, latchAt, now, rearmMs })
    assert.equal(v.latched, true, `latchAt=${latchAt} now=${now} rearmMs=${rearmMs} never re-arms`)
    assert.equal(v.rearmGranted, false)
  }
  // the deeper body-guard: junk counts keep the fresh shape (rearmGranted rides)
  const junk = finalBankDoomLatch({ failedCycles: 'three' })
  assert.equal(junk.latched, false)
  assert.equal(junk.rearmGranted, false)
})

test('the constants pin: the re-arm cooldown sits at 120s', () => {
  assert.equal(FINAL_BANK_DOOM_REARM_MS, 120000)
})

test('wiring: the re-arm rides the door, outranks the night hold, and a proven climb un-dooms the bottom', () => {
  // the re-arm state lives next to the per-bot cycle counter (run-scoped)
  assert.ok(FLEET.includes('let finalBankDoomLatchAt = 0'), 'the cooldown timestamp is declared')
  assert.ok(FLEET.includes('let finalBankDoomRearmed = false'), 'the one-shot spend flag is declared')
  // the latch call feeds the re-arm inputs
  assert.ok(/finalBankDoomLatch\(\{ failedCycles: finalBankDoomCycles, rearmed: finalBankDoomRearmed, latchAt: finalBankDoomLatchAt, now: Date\.now\(\) \}\)/.test(FLEET), 'the latch reads the re-arm state')
  // the re-arm line names the window and the terminal consequence
  assert.ok(FLEET.includes('the doom latch re-arms once'), 'the re-arm names itself at the door')
  assert.ok(FLEET.includes('the next failure re-latches'), 'the re-arm names the terminal consequence')
  // the night hold yields to the re-arm (a deferral would spend the shot on the hold)
  const rearmIdx = FLEET.indexOf('the doom latch re-arms once')
  const nightGateIdx = FLEET.indexOf("!doomLatch.rearmGranted && surfaceHoldVerdict")
  assert.ok(rearmIdx > 0 && nightGateIdx > rearmIdx, 'the night-hold gate carries the re-arm exemption after the re-arm line')
  // a proven climb resets the doom state (the evidence was refuted)
  const okIdx = FLEET.indexOf('A PROVEN CLIMB UN-DOOMS THE BOTTOM')
  assert.ok(okIdx > 0, 'the un-doom comment rides the OK site')
  const resetIdx = FLEET.indexOf('finalBankDoomCycles = 0', okIdx)
  assert.ok(resetIdx > okIdx && resetIdx - okIdx < 300, 'the reset rides the OK verdict')
})
