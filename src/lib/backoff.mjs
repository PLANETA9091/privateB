// (v0.16.3) Reconnect backoff for the bot fleet.
//
// THE PROBLEM (fleet #121, #122 evidence): the 2-core hosted runner's vanilla
// server stalls under load; every bot's TCP connection dies with ECONNRESET in
// the same second, and the OLD retry loop put every kicked bot back online
// after the SAME fixed 3 s - a synchronized reconnect herd that re-triggers
// the very stall that killed the first round. Fleet #122 lost 68 connection
// hits and 16 reconnects to this cycle; per-bot counters reset on every
// reboot, so the reported rate collapsed to a fraction of the real one.
//
// THE FIX: reconnectDelayMs() returns a per-bot, per-attempt delay with
//   1. exponential growth on CONSECUTIVE failures (storm -> back off hard),
//   2. +/- jitter around the exponential (equal-delay bots desynchronize),
//   3. a deterministic golden-ratio phase per bot index (19 bots land in
//      distinct slices of one phase window - no two bots reconnect together),
//   4. a hard floor (a fresh transient kick still retries promptly) and
//      ceiling (a bot never sleeps past the deadline for nothing).
// The caller resets the consecutive-failure counter whenever a bot logs in
// and makes progress, so a single mid-run kick after minutes of work retries
// fast while a real storm backs off step by step.

const GOLDEN = 0.6180339887498949

/**
 * Delay before a bot's next connection attempt.
 *
 * @param {object} [opts]
 * @param {number} [opts.attempt=0]    consecutive-failure count (0 = first retry)
 * @param {number} [opts.index=0]      bot slot in the fleet (spreads phases)
 * @param {number} [opts.baseMs=2000]  delay at attempt 0
 * @param {number} [opts.capMs=30000]  ceiling of the exponential part
 * @param {number} [opts.jitter=0.5]   +/- fraction around the exponential value (0..1)
 * @param {number} [opts.phaseSpanMs=4000] width of the per-bot phase window
 * @param {number} [opts.floorMs=750]  never below this (a retry must make progress)
 * @param {() => number} [opts.rand]   RNG in [0,1); injectable for tests
 * @returns {number} delay in ms (integer)
 */
export function reconnectDelayMs ({
  attempt = 0,
  index = 0,
  baseMs = 2000,
  capMs = 30000,
  jitter = 0.5,
  phaseSpanMs = 4000,
  floorMs = 750,
  rand = Math.random
} = {}) {
  const n = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0
  const base = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 2000
  const cap = Number.isFinite(capMs) && capMs >= base ? capMs : base
  const jit = Number.isFinite(jitter) ? Math.min(1, Math.max(0, jitter)) : 0.5
  const span = Number.isFinite(phaseSpanMs) && phaseSpanMs >= 0 ? phaseSpanMs : 0
  const floor = Number.isFinite(floorMs) && floorMs >= 0 ? floorMs : 0
  const rng = typeof rand === 'function' ? rand : Math.random

  // 1. exponential on consecutive failures, capped
  const exp = Math.min(cap, base * Math.pow(2, n))
  // 2. +/- jitter/2 around it -> [exp - half, exp + half]
  const half = (exp * jit) / 2
  let delay = exp - half + rng() * half * 2
  // 3. deterministic per-bot phase: slot i lands at i*golden mod 1 of the window
  if (span > 0 && index > 0) delay += ((index * GOLDEN) % 1) * span
  // 4. clamp
  return Math.max(floor, Math.min(cap + span, Math.round(delay)))
}

/**
 * Fleet-wide view: the delays 19 bots would pick at a given attempt, used by
 * tests and by the fleet log to prove the herd is actually spread.
 */
export function fleetSpread ({ attempt = 0, count = 19, ...rest } = {}) {
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(reconnectDelayMs({ attempt, index: i, rand: () => 0.5, ...rest }))
  }
  return out
}

// (v0.545.0) THE STALLED-LOGIN FENCE - the reconnect machinery's own bound.
// The bots' ready promise (miner.mjs, scout.mjs) settles ONLY on 'spawn' or
// 'error': a server that accepts the TCP connection but stalls the login (the
// v0.14.2 join-storm class - the vanilla network thread stalls >30s under a
// 19-login chunk-send burst; and mineflayer can stay silent for minutes on a
// half-dead socket - fleet19 measured ~450s of silent sockets with zero
// 'disconnected (' lines) leaves the promise unsettled FOREVER: the session's
// `await ready` never returns, the 12-attempt backoff budget never walks, and
// the loop-top deadline check is unreachable - the frozen book, one leg ABOVE
// the shift loop the 0.541.0 loop-top probe bounds (the probes cannot reach
// into the login leg). THE LAW: a login that has not spawned in 30000ms has
// earned a retry, not an infinite hold - the fence's catch ends the abandoned
// client (the zombie's socket and its timers die with bot.end()), re-throws
// into the session's own catch (the kick counter, the stat snapshot, the
// backoff delay), and the next attempt walks. 30000 = the measured stall
// boundary (v0.14.2's evidence names >30s network-thread stalls; a healthy
// login spawns in seconds, even under the join spread).
export const LOGIN_SPAWN_TIMEOUT_MS = 30000
