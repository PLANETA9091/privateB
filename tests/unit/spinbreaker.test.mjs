// Tests for (v0.227.0) THE SPIN BREAKER - the funnel-level SYNC re-issue
// breaker in gotoSafe. MEASURED (36270815237, the first readable run53-class
// OOM): a famine wood trip completed its walk in ~0.1s and re-issued ~1.0s
// later, forever - 'pf:goal wood trip @+0.0s <- pf:done wood trip @+-0.1s <-
// pf:goal wood trip @+-1.0s'. The ~1.1s promise-churn cycle sits JUST UNDER
// the goal brake's 6/5s burst and starves the timers phase, so the alloc
// valve's 1s sampler never got a turn: rss 361M -> 2476M, GRACE VOID,
// SIGTERM at t=241s. The breaker must be sync (Date.now state only), keyed
// on the SAME label re-issued inside its own pf:done window, and refuse at
// zero cost before any think window.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gotoSafe,
  spinBreakerStats,
  resetSpinBreaker,
  resetWalkGovernors,
  SPIN_BREAKER_WINDOW_MS,
  SPIN_REISSUE_LIMIT,
  SPIN_BREAKER_HOLD_MS
} from '../../src/lib/jobqueue.mjs'
import { PATH_PRIO_BANK } from '../../src/lib/pathsemaphore.mjs'
import { installNoteSink } from '../../src/lib/blackbox.mjs' // (v0.229.0) the pf:spin ring-note pins

// A mock bot whose walk completes instantly - the famine fingerprint: the
// done lands ~0ms after the goal, the re-issue follows in the same burst.
function instantBot () {
  return { pathfinder: { goto: () => Promise.resolve('done'), stop: () => {} } }
}

// A mock bot whose walk fails with a BUDGET timeout - budget timeouts never
// record a doomed goal (geometry unproven), so the re-issues hit ONLY the
// spin breaker and the cadence pins stay clean.
function failingBot () {
  return { pathfinder: { goto: () => Promise.reject(new Error('timeout after 500ms')), stop: () => {} } }
}

test('spin breaker: the spin class reads - two fast same-label cycles admit, the THIRD same-label call refuses', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const bot = instantBot()
  // cycle 1: no history - admitted, the done lands in the book
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  // re-issue 1 (fast, same label): tolerated - SPIN_REISSUE_LIMIT = 1
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  // re-issue 2 (fast, same label): the spin reads - refused at zero cost
  await assert.rejects(
    gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }),
    /spin breaker/
  )
  const st = spinBreakerStats()
  assert.equal(st.reissues, 2, 'both fast re-issues fed the book')
  assert.equal(st.holds, 1, 'the refusal armed the per-bot hold')
})

test('spin breaker: the whole spin + refusal lands inside one sub-second burst - no timer needs to fire', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const bot = instantBot()
  const t0 = Date.now()
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }), /spin breaker/)
  const elapsed = Date.now() - t0
  // the postmortem's lesson: the valve's 1s sampler never got a turn - the
  // breaker must catch the spin INSIDE that window, on pure sync state
  assert.ok(elapsed < 1000, `the spin verdict landed in ${elapsed}ms, under the valve's own 1s sampler`)
})

test('spin breaker: never fires across distinct labels (alternating walks are honest work)', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const bot = instantBot()
  for (let i = 0; i < 6; i++) {
    await gotoSafe(bot, { x: i }, { label: i % 2 ? 'wood trip' : 'walk to yard', timeoutMs: 500 })
  }
  const st = spinBreakerStats()
  assert.equal(st.refusals, 0, 'alternating labels never accumulate the count')
  assert.equal(st.holds, 0, 'no hold ever armed')
})

test('spin breaker: the window edge is honest - AT the window the re-issue is free, 1ms inside it counts', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const realNow = Date.now
  let fake = 1_000_000
  Date.now = () => fake
  try {
    const bot = instantBot()
    // walk 1 settles at fake time T
    await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
    // re-issued exactly AT the window edge: NOT a fast re-issue (the walk had
    // its full budget) - free, and the fresh done replaces the book
    fake += SPIN_BREAKER_WINDOW_MS
    await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
    // 1ms INSIDE the window from the fresh done: fast - re-issue 1 tolerated
    fake += SPIN_BREAKER_WINDOW_MS - 1
    await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
    // another re-issue 1ms inside again: re-issue 2 - the spin reads
    fake += SPIN_REISSUE_LIMIT // +1ms, still deep inside the window
    await assert.rejects(
      gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }),
      /spin breaker/
    )
  } finally {
    Date.now = realNow
    resetSpinBreaker()
  }
})

test('spin breaker: a stale label (outside the window) resets the count - slow honest work never accumulates', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const realNow = Date.now
  let fake = 2_000_000
  Date.now = () => fake
  try {
    const bot = instantBot()
    for (let i = 0; i < 4; i++) {
      await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
      fake += SPIN_BREAKER_WINDOW_MS + 1 // every re-issue lands OUTSIDE the window
    }
    const st = spinBreakerStats()
    assert.equal(st.reissues, 0, 'no fast re-issue was ever counted')
    assert.equal(st.refusals, 0, 'the honest 10s+ cadence never refused')
  } finally {
    Date.now = realNow
    resetSpinBreaker()
  }
})

test('spin breaker: the refusal rides the existing funnel refusal shape (named, paced, labeled)', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const bot = instantBot()
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  const t0 = Date.now()
  await assert.rejects(
    gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }),
    e => {
      assert.match(e.message, /spin breaker: wood trip re-issued/)
      assert.match(e.message, /run53 alloc-storm class/, 'the message names the evidence class')
      assert.match(e.message, /refused for \d+s/, 'the message carries the hold remaining (the funnel shape)')
      return true
    }
  )
  assert.ok(Date.now() - t0 >= 20, 'the refusal keeps the 25ms refusal pace (the caller-pacing contract)')
})

test('spin breaker: the hold refuses the same label but a DIFFERENT label walks (the funnel never traps a walker)', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const bot = instantBot()
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }), /spin breaker/)
  // hold live: same label refused again (zero cost, the hold's own remaining named)
  await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }), /hold live/)
  // a different label walks THROUGH the hold
  await gotoSafe(bot, { x: 2 }, { label: 'walk to yard', timeoutMs: 500 })
})

test('spin breaker: a different label COMPLETING mid-hold clears it (a bot that moved on is not spinning)', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const bot = instantBot()
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }), /spin breaker/)
  assert.equal(spinBreakerStats().holds, 1)
  // the yard walk completes mid-hold: the hold clears, the book re-points
  await gotoSafe(bot, { x: 2 }, { label: 'walk to yard', timeoutMs: 500 })
  assert.equal(spinBreakerStats().clears, 1, 'the clear is counted')
  // the original label walks again free (the hold is gone, the label went stale)
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  const st = spinBreakerStats()
  assert.equal(st.refusals, 1, 'no further refusals after the clear')
})

test('spin breaker: a served hold resets clean - the bot walks the same label again after the hold expires', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const realNow = Date.now
  let fake = 3_000_000
  Date.now = () => fake
  try {
    const bot = instantBot()
    await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
    await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
    await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }), /spin breaker/)
    // past the hold: the hold is served, the state resets clean
    fake += SPIN_BREAKER_HOLD_MS + 1
    await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }) // must not throw
    const st = spinBreakerStats()
    assert.equal(st.refusals, 1, 'exactly the arming refusal, no recurrence')
  } finally {
    Date.now = realNow
    resetSpinBreaker()
  }
})

test('spin breaker: FAILED walks stay OUT of the book (failure churn is the stall governor\'s jurisdiction)', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const bot = failingBot() // 'timeout after' - transient, never a doomed record
  await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 2000 }), /timeout after/)
  await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 2000 }), /timeout after/)
  await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 2000 }), /timeout after/)
  // the postmortem's spin is a SUCCESS-completion spin (the famine walk ARRIVES
  // and re-issues); failed-walk re-issues build their churn in the stall
  // governor and the doomed ledger, and the walk-retry ladder's own
  // 'Path was stopped' -> immediate retry must keep flowing untouched
  const st = spinBreakerStats()
  assert.equal(st.reissues, 0, 'no failed walk ever fed the spin book')
  assert.equal(st.refusals, 0, 'the failure cadence is not the spin class')
  resetWalkGovernors() // the 3 zero-progress failures stay under the stall limit; drop them for the next test
})

test('spin breaker: NO priority bypass - a bank-priority spin is the same storm', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const bot = instantBot()
  await gotoSafe(bot, { x: 1 }, { label: 'walk to yard', timeoutMs: 500, priority: PATH_PRIO_BANK })
  await gotoSafe(bot, { x: 1 }, { label: 'walk to yard', timeoutMs: 500, priority: PATH_PRIO_BANK })
  await assert.rejects(
    gotoSafe(bot, { x: 1 }, { label: 'walk to yard', timeoutMs: 500, priority: PATH_PRIO_BANK }),
    /spin breaker/
  )
})

test('spin breaker: a fresh bot with no history is never refused', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const before = spinBreakerStats().refusals
  await gotoSafe(instantBot(), { x: 1 }, { label: 'deploy', timeoutMs: 500 })
  assert.equal(spinBreakerStats().refusals, before, 'the first walk of any bot always flows')
})

test('spin breaker: the constants carry the postmortem calibration', () => {
  assert.equal(SPIN_BREAKER_WINDOW_MS, 10000, "the postmortem's own line: 'a sub-10s re-issue IS the anomaly'")
  assert.equal(SPIN_REISSUE_LIMIT, 1, 'one fast re-issue tolerated, the second reads the spin')
  assert.equal(SPIN_BREAKER_HOLD_MS, 30000, 'the hold bounds the recurrence well under the valve floor')
  assert.ok(SPIN_BREAKER_HOLD_MS > SPIN_BREAKER_WINDOW_MS, 'the hold outlives the window (a served hold never re-arms from stale state)')
})

test('spin breaker: resetWalkGovernors covers the spin book (the funnel-wide reset)', async () => {
  resetWalkGovernors()
  const bot = instantBot()
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
  resetWalkGovernors()
  const before = spinBreakerStats().reissues
  await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }) // the same bot object, a clean book
  assert.equal(spinBreakerStats().reissues, before, 'the reset dropped the per-bot history')
})

// (v0.229.0) THE 'pf:spin' RING NOTE - the refusal's own form in the black
// box. The 36276860090 field face caught the breaker biting 4x ('sweep
// drops') with ZERO ring trace: the refusal lived only in the caller's
// catch, and a silent-catch caller (the wood-trip gather is one) left the
// dump reading 'pf:goal <- pf:done <- pf:goal' - the hold indistinguishable
// from the caller's own pause. The note must ride the SAME sink as the
// pf:queue/pf:goal/pf:done notes and carry the label.
test('spin breaker: the refusal rides the black box as pf:spin <label> - the ring keeps the refusal form', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const captured = []
  installNoteSink({ note: (label, tsMs) => captured.push({ label, tsMs }) })
  try {
    const bot = instantBot()
    await gotoSafe(bot, { x: 1 }, { label: 'sweep drops', timeoutMs: 500 }) // admitted - NO pf:spin on the success path
    await gotoSafe(bot, { x: 1 }, { label: 'sweep drops', timeoutMs: 500 }) // tolerated re-issue
    await assert.rejects(
      gotoSafe(bot, { x: 1 }, { label: 'sweep drops', timeoutMs: 500 }),
      /spin breaker/
    )
    const spins = captured.filter(c => c.label.startsWith('pf:spin'))
    assert.equal(spins.length, 1, 'exactly one refusal note - the spin refusal is the only pf:spin writer')
    assert.equal(spins[0].label, 'pf:spin sweep drops', 'the note carries the spinning label')
    assert.equal(typeof spins[0].tsMs, 'number', 'the note carries the ring timestamp')
    assert.ok(captured.some(c => c.label.startsWith('pf:done')), 'the success path kept its own pf:done notes (the sink rides both)')
  } finally {
    installNoteSink(null) // the sink is a test fixture - the other suites stay no-op
    resetSpinBreaker()
    resetWalkGovernors()
  }
})

test('spin breaker: a hold-live refusal notes too - the hold must never read as the caller pause', async () => {
  resetSpinBreaker()
  resetWalkGovernors()
  const captured = []
  installNoteSink({ note: label => captured.push(label) })
  try {
    const bot = instantBot()
    await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
    await gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 })
    await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }), /spin breaker/)
    await assert.rejects(gotoSafe(bot, { x: 1 }, { label: 'wood trip', timeoutMs: 500 }), /spin breaker.*hold live/)
    const spins = captured.filter(l => l.startsWith('pf:spin'))
    assert.equal(spins.length, 2, 'the fresh-arm refusal AND the held refusal both left their note')
    assert.ok(spins.every(l => l === 'pf:spin wood trip'), 'both notes are the same interned label (the held path allocates nothing)')
  } finally {
    installNoteSink(null)
    resetSpinBreaker()
    resetWalkGovernors()
  }
})
