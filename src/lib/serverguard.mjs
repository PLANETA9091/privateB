// Server-death watchdog for the fleet runner (v0.52.0).
//
// WHAT HAPPENED (fleet 35630279913, run49, mined 2026-09-22): at ts~550s the
// vanilla server stopped answering. Within ~30 s all 19 bot sockets broke with
// `write EPIPE` / `write ECONNRESET`, 6 bots were explicitly kicked with
// `disconnect.timeout` - and the fleet process noticed NOTHING. The bots kept
// executing their end-phase chains against dead sockets (mineflayer never
// emitted 'end': zero `disconnected (` lines in the whole log), the end phase
// hung ~400 s past the deadline, and the run ended in a HARD KILL with a
// partial report (banked=0, 13 'final climb: failed - stalled' - the climbs
// were "stalled" because the server was already dead).
//
// THE LOOK-ALIKE THAT FORCED THE v2 DESIGN (fleet 35639593200, run51): the same
// burst happened at ts~270s - but this time the SERVER LIVED. The wave was
// runner-CPU exhaustion (19 node bots + the JVM on 2-4 cores; the bots' mainLate
// probe froze at 942 ms, the reporter starved 314 s while the heartbeat worker
// kept flowing), the server timed every client out ("lost connection: Timed
// out" x19 in the server console) - and EIGHT bots re-logged and the run
// finished NORMAL END. A naive "socket burst = server death" verdict would
// have killed a run that recovered. So the verdict is no longer the burst:
//
//   burst of transport losses -> SUSPECT (the fleet's links all broke at once)
//     + a successful re-login lands      -> alive (wave, not death) - SUSPECT CLEARED
//     + a TCP probe CONNECTS to the port -> alive (the server accepts clients)
//     + a TCP probe is REFUSED           -> DEAD (nothing is listening: funeral)
//     + GRACE expires without either     -> DEAD (belt: a probe-less environment
//                                           must not hang forever either)
//
// The detector is PURE: it consumes log lines the runner already produces
// (`error: write EPIPE`, `socket error: write ECONNRESET`,
// `KICKED: ...disconnect.timeout`) through the existing miner log hook; probes
// and re-logins are reported by the runner via recordProbe/recordRelogin.

import net from 'node:net'

// Socket-class failures: the TCP link itself broke. A generic bot error
// ('error: no path to goal') must NOT count - only transport death does.
export const SOCKET_LOSS_RE = /\berror: (?:write |read )?(EPIPE|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT)\b/

// The server explicitly telling a client it stopped hearing keepalives. A
// single such kick is one bot's network hiccup; a burst of them is the server
// drowning. Other kick reasons (disconnect.generic, illegal movement) say
// nothing about server health and are ignored.
export const TIMEOUT_KICK_RE = /KICKED: .*disconnect\.timeout/

export const SERVER_DEATH_WINDOW_MS = 90000
export const SERVER_DEATH_FRACTION = 0.5
export const SERVER_DEATH_FLOOR = 3 // tiny fleets (integration runs 2 bots) must still be able to trip
export const SUSPECT_GRACE_MS = 120000 // no probe result and no re-login inside this = dead
export const PROBE_INTERVAL_MS = 5000

export function isSocketLossLine (line) {
  return typeof line === 'string' && SOCKET_LOSS_RE.test(line)
}

export function isTimeoutKickLine (line) {
  return typeof line === 'string' && TIMEOUT_KICK_RE.test(line)
}

export function serverDeathThreshold (total, { fraction = SERVER_DEATH_FRACTION, floor = SERVER_DEATH_FLOOR } = {}) {
  const n = Number(total)
  if (!Number.isFinite(n) || n <= 0) return Infinity // no bots - nothing can die
  // the floor must never exceed the fleet size, or a 2-bot fleet could never trip
  return Math.min(n, Math.max(floor, Math.ceil(n * fraction)))
}

export function createServerGuard ({ total, windowMs = SERVER_DEATH_WINDOW_MS, fraction, floor, graceMs = SUSPECT_GRACE_MS, now = () => Date.now() } = {}) {
  const threshold = serverDeathThreshold(total, { fraction, floor })
  const losses = [] // timestamps of loss events inside the window
  let deadAt = 0
  let suspectAt = 0 // 0 = not suspect
  let totalLosses = 0
  let relogins = 0
  let lastProbe = null // 'ok' | 'refused'

  function clearSuspect (why) {
    suspectAt = 0
    losses.length = 0 // the wave is explained - a fresh burst starts fresh evidence
    return why
  }

  function recordLoss () {
    totalLosses++
    const t = now()
    losses.push(t)
    while (losses.length && t - losses[0] > windowMs) losses.shift()
    if (!suspectAt && !deadAt && losses.length >= threshold) suspectAt = t
    return verdict()
  }

  // A successful login IS the server saying it is alive - the strongest signal.
  function recordRelogin () {
    relogins++
    if (suspectAt && !deadAt) clearSuspect('relogin')
  }

  // The runner probes the server port while suspect; probeServerPort answers
  // 'ok' | 'refused' | 'timeout'. 'ok' = something listens (alive); a refusal
  // means the JVM is gone; a timeout means it stopped answering (equally dead
  // for our purposes - the bots cannot play on a server that never replies).
  function recordProbe (answer) {
    lastProbe = answer
    const alive = answer === 'ok'
    if (suspectAt && !deadAt) {
      if (alive) clearSuspect('probe-ok')
      else deadAt = now()
    } else if (!alive && !suspectAt && !deadAt) {
      // the server port refusing OUTSIDE a burst is odd but not fleet evidence
      // on its own (the runner itself may be between phases) - only note it
    }
    return verdict()
  }

  // GRACE: suspect with neither a re-login nor a probe verdict inside graceMs -
  // declare dead anyway (a probe-less runner must still escape the hang).
  function pollExpiry () {
    if (suspectAt && !deadAt && now() - suspectAt > graceMs) deadAt = now()
    return verdict()
  }

  function verdict () {
    return {
      dead: !!deadAt,
      suspect: !!suspectAt && !deadAt,
      deadAt,
      suspectAt,
      threshold,
      lossesInWindow: losses.length,
      totalLosses,
      relogins,
      lastProbe
    }
  }

  return {
    recordLoss,
    recordRelogin,
    recordProbe,
    pollExpiry,
    get dead () { return !!deadAt },
    get suspect () { return !!suspectAt && !deadAt },
    get deadAt () { return deadAt },
    get suspectAt () { return suspectAt },
    get threshold () { return threshold },
    get lossesInWindow () {
      // prune on read: between recordLoss calls the window keeps sliding - a
      // stale count would exaggerate the report (and the tests caught exactly
      // that: 9 expired losses still showing after a 90s+ jump)
      const t = now()
      while (losses.length && t - losses[0] > windowMs) losses.shift()
      return losses.length
    },
    get totalLosses () { return totalLosses },
    get relogins () { return relogins },
    get lastProbe () { return lastProbe }
  }
}

// The runner-side probe: a bare TCP connect to the server port. A vanilla
// server whose tick loop is drowning still ACCEPTS connections (Netty lives);
// a dead JVM refuses instantly. Either answer is decisive within seconds.
export function probeServerPort ({ host = '127.0.0.1', port = 25565, timeoutMs = 2000 } = {}) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port })
    const done = answer => {
      try { socket.destroy() } catch { /* already gone */ }
      resolve(answer)
    }
    socket.setTimeout(timeoutMs, () => done('timeout'))
    socket.once('connect', () => done('ok'))
    socket.once('error', () => done('refused'))
  })
}
