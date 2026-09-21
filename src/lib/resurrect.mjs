// The SERVER RESURRECTION policy (v0.56.0, pure - no bot/child-process deps).
//
// WHAT HAPPENED: the server-death watchdog (v0.52.0) ends the run honestly at
// exit 14 the moment the fleet's transport burst + a refused TCP probe prove
// the JVM is gone. Honest, but wasteful: a vanilla JVM that died mid-run on a
// 2-4 core runner is usually an infra death (the runner OOM-killed the JVM,
// a crash loop), not a world death - the world dir survives, a fresh boot
// takes ~30-60s, and the bots' own reconnect backoff (12 attempts, capped
// 30s + 4s phase = ~34s apart, deadline-gated) already knows how to re-enter
// a server that comes back. The 02:53 handoff named the next rung: "the
// watchdog only shuts down honestly today - restarting the JVM + mass
// re-login is the next rung".
//
// THE POLICY (every branch must say WHY):
//   restart - the run has runway AND a restart attempt left: reboot the JVM,
//             re-login through the existing backoff, keep mining.
//   quit    - no restarts left (a flapping server must not eat the CI budget
//             in a boot loop), OR the runway is shorter than the boot floor
//             (a boot + mass re-login needs minutes; a restart fired in the
//             last two minutes of a 600s run buys nothing but a slower
//             funeral), OR the runway is unknown (junk clock - never act on
//             junk).
// Pure arithmetic so CI can test every branch without a JVM.
export const RESURRECT_MAX = 1 // one attempt per run: a server that dies twice is a pattern, not an accident
export const RESURRECT_FLOOR_MS = 180000 // boot ~30-60s + 19 relogins ~30s + mining time worth having

/**
 * Decide what the fleet should do when the server-death watchdog fires.
 * @param {object} p
 * @param {number} p.remainingMs ms until the run's deadline (junk -> quit)
 * @param {number} [p.restartsUsed] restarts already spent this run (junk/negative -> 0)
 * @param {number} [p.maxRestarts] attempts allowed (default RESURRECT_MAX)
 * @param {number} [p.floorMs] minimum runway a restart needs (default RESURRECT_FLOOR_MS)
 * @returns {{action:'restart', remainingMs:number, floorMs:number, maxRestarts:number}
 *          |{action:'quit', why:string}}
 */
export function resurrectPlan ({ remainingMs, restartsUsed = 0, maxRestarts = RESURRECT_MAX, floorMs = RESURRECT_FLOOR_MS } = {}) {
  const max = Number.isFinite(maxRestarts) && maxRestarts >= 0 ? Math.floor(maxRestarts) : RESURRECT_MAX
  const usedRaw = Number(restartsUsed)
  const used = Number.isFinite(usedRaw) && usedRaw > 0 ? Math.floor(usedRaw) : 0
  const rem = typeof remainingMs === 'number' ? remainingMs : NaN // (v0.57.1 fix) the clock is the RUNWAY GRANT: a numeric string must NOT coerce into one ('600000' acted as restart). restartsUsed strings still coerce the CONSERVATIVE way below - they spend, never grant.
  if (!Number.isFinite(rem) || rem <= 0) return { action: 'quit', why: `unknown or spent runway (remainingMs ${remainingMs})` }
  if (used >= max) return { action: 'quit', why: `no restarts left (${used}/${max} spent - a flapping server must not boot-loop the CI budget)` }
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? floorMs : RESURRECT_FLOOR_MS
  if (rem < floor) return { action: 'quit', why: `only ${Math.round(rem / 1000)}s of runway - a boot + re-login needs ${Math.round(floor / 1000)}s` }
  return { action: 'restart', remainingMs: rem, floorMs: floor, maxRestarts: max }
}
