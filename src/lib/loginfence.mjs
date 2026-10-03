// (v0.546.0) THE LOGIN FENCE - the rebuild path's login leg, settled on every branch.
//
// THE SEAM: the fleet's dead-client machinery grew one probe per seat (the scout's
// loop-top verdict 0.539.0, the miner's shift-loop verdict 0.541.0), a craft gate
// (0.542.0) and the seal place fence (0.544.0) - every one of them reachable only
// AFTER the login completed. The login itself sat BEFORE all of them, and the
// `ready` promise both bots hand the runner settled on exactly two legs:
// 'spawn' -> resolve, 'error' -> reject. The protocol client's other verdict was
// never wired: endSocket (minecraft-protocol client.js setSocket) emits 'end' -
// NOT 'error' - on every clean close path (socket close / end / timeout, a kick
// packet during LOGIN state, a server restart mid-login), and mineflayer's loader
// forwards it as bot 'end'. A session whose socket died during login therefore
// settled NOTHING: `await miner.ready` / `await scout.ready` hung forever, the
// 12-attempt / 6-attempt rebuild loop froze above its own deadline check, zero
// retry lines printed, zero probes ever read - the frozen book ONE level above
// the 0.539.0 defect, through a leg the probes cannot reach into. The second hole
// is the silence class: TCP accepted, the server never answers the handshake - no
// 'end', no 'error', nothing ever fires; only a wall-clock fence can bound it.
// The third hole was the scout's spawn listener alone: its waitForWorld throw
// orphaned the promise (an async listener's rejection nobody awaits - the fleet's
// unhandledRejection net logs it and keeps the process alive, ready pending
// forever).
//
// THE WIRE: one machine, four settle legs, both bots ride it -
//   spawn + boot -> resolve (the bot's own spawn bootstrap, unchanged in place;
//                   a boot throw becomes a REJECTION - never an orphan),
//   end          -> reject ('the session ended before spawn (<reason>) - the
//                   attempt rebuilds': the client's own verdict, the same native
//                   byte the 0.539.0 probe reads, now heard before spawn too),
//   error        -> reject (the pre-existing leg, kept byte-for-byte),
//   fence        -> reject after LOGIN_READY_TIMEOUT_MS ('the login never
//                   completed within ...ms - the attempt rebuilds'): the silence
//                   class's only possible bound. 60s is generous by design - a
//                   healthy local login plus the 20s waitForWorld bootstrap fits
//                   inside with margin; a false fire costs one attempt slot of
//                   twelve and the backoff owns the cadence from there.
// Settle-once: the first leg wins, the fence is cleared on EVERY settle, and a
// late 'end' after a resolved login is consumed quietly (zero
// unhandledRejections - the winnable-race law, v0.543.0). Junk-safe: a mock bot
// needs only once() - the same surface the old executor required; a bot without
// an 'error' path walks the fence instead (the mock's own silence is bounded).
//
// The caller keeps its shape: the runner's catch prints 'attempt failed: <the
// message>', failStreak grows, reconnectDelayMs owns the retry - the login-phase
// kick reason rides the retry line verbatim (the field evidence the 0.52.0
// watchdog class wants, now for deaths that happen BEFORE the first spawn).

export const LOGIN_READY_TIMEOUT_MS = 60000

export function createLoginReady (bot, { timeoutMs = LOGIN_READY_TIMEOUT_MS, boot = null } = {}) {
  return new Promise((resolve, reject) => {
    let done = false
    let fence = null
    const settle = fn => v => {
      if (done) return
      done = true
      if (fence) clearTimeout(fence)
      fn(v)
    }
    const ok = settle(resolve)
    const bad = settle(reject)
    fence = setTimeout(() => bad(new Error(`the login never completed within ${timeoutMs}ms - the attempt rebuilds`)), timeoutMs)
    if (boot) bot.once('spawn', () => { Promise.resolve().then(boot).then(ok, bad) })
    else bot.once('spawn', () => ok(bot))
    bot.once('end', reason => bad(new Error(`the session ended before spawn (${reason ?? 'no reason'}) - the attempt rebuilds`)))
    bot.once('error', bad)
  })
}
