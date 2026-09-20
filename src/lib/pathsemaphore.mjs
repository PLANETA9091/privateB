// (v0.17.4) Fleet-wide pathfinder throttle.
//
// THE EVIDENCE (fleet #124, 600s, master v0.17.2): mining ran at RECORD pace
// (1928 blocks by t-542 = 3.56 b/s, matching #122's 3.57) and then the fleet
// process starved: the 15s reporter printed NOTHING for ~309 seconds of run
// time, physics stopped ticking ("Timeout waiting for 4 ticks after 5200ms"
// on 15 bots), 15 connections ECONNRESET, every per-bot stat reset on the
// rejoin, and the reported rate collapsed to 0.41 b/s. Same class as the
// v0.6.4 OOM ("99.6% live A* state, reporter starved") - but bounded heap
// (151 MB) and bounded searchRadius (v0.6.5) only removed the memory cliff,
// not the CPU one: 19 bots issuing A* searches at once oversubscribe the
// 2-core runner's event loop and EVERYTHING stalls (reporter, physics,
// sockets, stat counters).
//
// THE FIX: cap how many pathfinder searches run at the same time. A queue
// keeps the rest waiting in FIFO order; callers already treat gotoSafe as
// best-effort (every call site catches), so a bounded wait costs one bot a
// moment, not the fleet its CPU. The per-call timeout starts when the search
// actually STARTS (activation), not while queued - a queued bot does not
// burn its caller's budget.
//
// (v0.21.0) PRIORITY INSIDE THE QUEUE. FLEET v0.19.2 EVIDENCE (927 blocks,
// banked=0): at final-bank time 19 bots enqueue walks at once and the throttle
// showed path=6a/10q - a BANK walk (the only walk that turns mined blocks into
// banked stock) can sit behind a dozen next-column walks and its dist-scaled
// budget burns while queued position does not matter to mining pace at all.
// Higher priority dequeues first; FIFO within the same priority (the old
// behavior is exactly priority 0 everywhere). Wire format of stats() is
// UNCHANGED (the heartbeat line is parsed by log readers/tests).

/** Priority classes for fleet walks - the queue serves higher classes first. */
export const PATH_PRIO_NORMAL = 0 // mining columns, relocations, everything default
export const PATH_PRIO_TRIP = 1 // wood/ore steering trips (a bot's commute)
export const PATH_PRIO_BANK = 2 // bank/yard walks - the only walk that banks stock

/**
 * @param {object} [opts]
 * @param {number} [opts.maxConcurrent=6] simultaneous searches allowed
 * @param {number} [opts.queueCap=40] max queued searches (overflow rejects)
 */
export function createPathThrottle ({ maxConcurrent = 6, queueCap = 40 } = {}) {
  const max = Number.isFinite(maxConcurrent) && maxConcurrent >= 1 ? Math.floor(maxConcurrent) : 6
  const cap = Number.isFinite(queueCap) && queueCap >= 1 ? Math.floor(queueCap) : 40
  let active = 0
  let maxActive = 0
  let rejected = 0
  const queue = []

  const pump = () => {
    while (active < max && queue.length > 0) {
      // highest priority first; among equals, FIFO (a linear scan of <=40
      // entries is free next to the A* searches this gate is throttling)
      let bestIdx = 0
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].prio > queue[bestIdx].prio) bestIdx = i
      }
      const next = queue.splice(bestIdx, 1)[0]
      active++
      if (active > maxActive) maxActive = active
      next.start()
    }
  }

  return {
    /**
     * Run fn() under the concurrency cap. fn may be sync or return a promise.
     * Rejects with 'path throttle: queue full' when the queue overflows.
     * @template T
     * @param {() => T | Promise<T>} fn
     * @param {object} [opts]
     * @param {number} [opts.priority] higher dequeues first (default 0 = FIFO as before)
     * @returns {Promise<T>}
     */
    run (fn, { priority = PATH_PRIO_NORMAL } = {}) {
      const prio = Number.isFinite(priority) && priority >= 0 ? Math.floor(priority) : PATH_PRIO_NORMAL
      return new Promise((resolve, reject) => {
        const start = () => {
          let result
          try {
            result = Promise.resolve(fn())
          } catch (e) {
            active--
            pump()
            reject(e)
            return
          }
          result.then(resolve, reject).finally(() => {
            active--
            pump()
          })
        }
        if (active < max) {
          active++
          if (active > maxActive) maxActive = active
          start()
        } else if (queue.length < cap) {
          queue.push({ prio, start })
        } else {
          rejected++
          reject(new Error('path throttle: queue full'))
        }
      })
    },

    /** Point-in-time counters for the fleet report. */
    stats () {
      return { active, queued: queue.length, maxActive, rejected, max: max, cap: cap }
    }
  }
}
