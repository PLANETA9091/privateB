// The stalled-login fence's wiring pins (v0.545.0).
//
// THE SEAM: the relog loop's login leg sat ABOVE the shift loop the 0.541.0
// loop-top probe bounds - `await ready` with NO fence. The ready promise
// (miner.mjs, scout.mjs) settles ONLY on 'spawn' or 'error': a server that
// accepts TCP but stalls the login (the v0.14.2 join-storm class, the ~450s
// of silent sockets fleet19 measured) leaves it unsettled FOREVER - the
// session await never returns, the 12-attempt backoff budget never walks,
// the loop-top deadline check is unreachable: the frozen book's last naked
// seat outside the shift machinery.
//
// THE WIRE: both ready awaits (the miner's 12-attempt session, the scout's
// 6-attempt patrol) fenced with the reconnect machinery's OWN constant
// (LOGIN_SPAWN_TIMEOUT_MS in backoff.mjs - the same machine, the same law
// that owns the retry delays). The fence's catch ends the abandoned client
// (the zombie's socket and its interval timers die with bot.end()) and
// re-throws into the session's own catch - the kick counter, the stat
// snapshot, the backoff delay, the retry line's why all walk as before. No
// new log line: the fence's message rides lastWhy through the EXISTING
// retry line (the 0.542.0 gate's own channel shape).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LOGIN_SPAWN_TIMEOUT_MS } from '../../src/lib/backoff.mjs'
import { withTimeout } from '../../src/lib/jobqueue.mjs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
const backoffSrc = readFileSync(new URL('../../src/lib/backoff.mjs', import.meta.url), 'utf8')

test('THE LAW: LOGIN_SPAWN_TIMEOUT_MS is 30000 (the measured stall boundary, backoff.mjs is its home)', () => {
  assert.equal(LOGIN_SPAWN_TIMEOUT_MS, 30000)
  assert.match(backoffSrc, /export const LOGIN_SPAWN_TIMEOUT_MS = 30000/)
  assert.match(backoffSrc, /THE STALLED-LOGIN FENCE/)
})

test('REGRESSION PIN: fleet19 carries ZERO naked ready awaits (the frozen-login class is dead)', () => {
  const nakedMiner = fleetSrc.match(/await miner\.ready/g) || []
  const nakedScout = fleetSrc.match(/await scout\.ready/g) || []
  assert.equal(nakedMiner.length, 0, `every miner.ready rides the fence (got ${nakedMiner.length} naked)`)
  assert.equal(nakedScout.length, 0, `every scout.ready rides the fence (got ${nakedScout.length} naked)`)
})

test('THE WIRE: both fenced forms byte-exact, ONE site each, riding the fleet import', () => {
  assert.equal(fleetSrc.match(/import \{ reconnectDelayMs, LOGIN_SPAWN_TIMEOUT_MS \} from '\.\.\/src\/lib\/backoff\.mjs'/g).length, 1)
  assert.equal(fleetSrc.match(/await withTimeout\(miner\.ready, LOGIN_SPAWN_TIMEOUT_MS, 'login spawn'\)/g).length, 1)
  assert.equal(fleetSrc.match(/await withTimeout\(scout\.ready, LOGIN_SPAWN_TIMEOUT_MS, 'login spawn'\)/g).length, 1)
})

test('THE CLEANUP: each fence ends the abandoned client and re-throws into the session catch', () => {
  assert.equal(fleetSrc.match(/try \{ miner\.bot\?\.end\(\) \} catch \{ \/\* the socket is already gone \*\/ \}/g).length, 1)
  assert.equal(fleetSrc.match(/try \{ scout\.bot\?\.end\(\) \} catch \{ \/\* the socket is already gone \*\/ \}/g).length, 1)
  assert.match(fleetSrc, /throw e \/\/ the session's own catch counts the failure, the backoff re-enters/)
  assert.match(fleetSrc, /throw e \/\/ the scout's attempt catch prints the why, the 3s wait re-enters/)
})

test('BEHAVIOR: a stalled login fences into the session catch - the zombie client is ended exactly once', async () => {
  let ended = 0
  const zombieBot = { end: () => { ended++ } }
  const ready = new Promise(() => {}) // the stalled login: TCP open, no 'spawn', no 'error'
  let caught = null
  try {
    await withTimeout(ready, 25, 'login spawn')
    assert.fail('the fence must reject')
  } catch (e) {
    try { zombieBot?.end() } catch { /* the socket is already gone */ }
    caught = e // the session's own catch receives the throw
  }
  assert.equal(ended, 1, 'the abandoned client dies with the fence')
  assert.equal(caught.message, 'login spawn: timeout after 25ms', 'the why rides lastWhy through the retry line')
  // the fence's why must NOT read as a kick (the honest why: a stall, not a
  // server kick) - the session catch's own classifier decides
  assert.equal(/kicked|end|disconnect/i.test(caught.message), false)
})

test('BEHAVIOR: the fence loses nothing on a healthy login - the late resolve of the loser is consumed quietly', async () => {
  let unhandled = 0
  const counter = () => { unhandled++ }
  process.on('unhandledRejection', counter)
  try {
    let lateResolve
    const slowReady = new Promise(r => { lateResolve = r }) // resolves AFTER the fence fires
    await assert.rejects(
      withTimeout(slowReady, 10, 'login spawn'),
      /login spawn: timeout after 10ms/
    )
    lateResolve() // the stalled server finally spawns the zombie - nobody is waiting
    await new Promise(r => setTimeout(r, 30)) // give the late settle its window
    assert.equal(unhandled, 0, 'the late resolve is consumed by the race, zero unhandledRejections')
  } finally {
    process.off('unhandledRejection', counter)
  }
  const healthy = { name: 'the bot object' }
  const passed = await withTimeout(Promise.resolve(healthy), 25, 'login spawn')
  assert.equal(passed, healthy, 'a ready that settles in time passes straight through')
})
