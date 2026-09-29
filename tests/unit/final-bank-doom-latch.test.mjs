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
