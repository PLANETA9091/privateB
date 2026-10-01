// (v0.443.0) THE SAME-TARGET RE-ARM BRAKE - the water-cure brief's stage (b),
// the zero-gain loop's cross-episode gate.
//
// THE FIELD EVIDENCE (three faces, one loop): a bot's transit toward known
// land stalls (the walls own the swim - the v0.82.0 latch condemns it for
// the REST OF THE EPISODE), the rescue ends, and the NEXT rescue episode
// re-arms the SAME target at the SAME walls. Face 27's F1 launched 73 times
// at [-134,413]; face 29's 49/64 launches sat on two bot-pinned seats
// (F10 x29 [-141,416], F18 x20 [-115,392]); face 30's F8 launched 26 times
// at [-143,430] with the ground gained 0..0. The per-episode latch dies with
// its episode - nothing carried the verdict across episodes, so every new
// rescue paid the same wall from the start.
//
// THE BRAKE (per-bot, cross-episode, two legs):
//   1. the STALL RECORD: when the land branch's transit stall verdict fires,
//      the target key (name,x,z - the launch line's own identity) enters the
//      bot's ledger with the epoch ms.
//   2. the RE-ARM GATE: a later episode's landBearingFromMap checks the
//      nearest land's key against the ledger - a key inside its cooldown is
//      SKIPPED (the next LAND_PROXY is a different approach cell; no proxy
//      left = the release/probes/hold branches own the pass - the cooldown
//      leg the episode machinery already built).
// The cooldown expires and the target re-arms honestly: if the walls still
// own the column the swim stalls again and the ledger re-arms the brake (a
// longer period between zero-gain burns, never a permanent ban).
//
// THE JUNK/ABSENCE LAW: a missing key, a junk type, a future stamp - the
// verdict is null and the legacy path runs BYTE-IDENTICAL. The brake adds
// one refusal at one call site; it owns no new control flow beyond that.
//
// Pure functions only (the dropwalk/plantop precedent): the fleet wiring
// passes its own ledger, now and cooldown; this file never sees a bot.

// The cooldown window: the field cadence between rescue episodes on the held
// faces ran ~20-25s (F8's 26 launches over 600s) - 45s outlives the next
// episode or two, so the immediate re-arm (the zero-gain burn) is gone while
// an honest re-try inside the same face stays.
export const REARM_COOLDOWN_MS = 45000

/**
 * Record one transit stall for the target key (the brake's fuel).
 * @param {Map<string, number>} ledger key -> the stall's epoch ms (mutated in place)
 * @param {{key: string, now: number}} e the target key and the stall time
 * @returns {boolean} true when recorded (junk inputs return false, the ledger untouched)
 */
export function noteTransitStall (ledger, { key, now } = {}) {
  if (!(ledger instanceof Map) || typeof key !== 'string' || key.length === 0) return false
  if (!Number.isFinite(now)) return false
  ledger.set(key, now)
  return true
}

/**
 * The re-arm verdict for one target key: braked while the last stall's age
 * is inside the cooldown. Absence (never stalled), junk, a clock-skewed
 * future stamp and an expired cooldown all read null - the gate silent, the
 * legacy launch byte-identical.
 * @param {Map<string, number>} ledger key -> the stall's epoch ms
 * @param {{key: string, now: number, cooldownMs?: number}} e
 * @returns {null|{key: string, ageMs: number, cooldownMs: number}} non-null = braked
 */
export function rearmVerdict (ledger, { key, now, cooldownMs = REARM_COOLDOWN_MS } = {}) {
  if (!(ledger instanceof Map) || typeof key !== 'string' || key.length === 0) return null
  if (!Number.isFinite(now) || !Number.isFinite(cooldownMs) || cooldownMs < 0) return null
  const at = ledger.get(key)
  if (at === undefined || !Number.isFinite(at)) return null
  const ageMs = now - at
  if (ageMs < 0) return null // a future stamp is a clock lie - never brake on one
  if (ageMs >= cooldownMs) return null // the cooldown expired: the honest re-try
  return { key, ageMs, cooldownMs }
}

// The brake's own log line (the emitter's grammar, pinned for the census):
//   `F8 [F8] water: same-target re-arm braked (oak_log at [-143,430] stalled 32s ago - the next proxy or the release owns this swim)`
const TAG = '^(F\\d+) \\[\\1\\] '
export const REARM_BRAKE_RE = new RegExp(TAG +
  'water: same-target re-arm braked \\(([a-z][a-z0-9_]*) at \\[(-?\\d+),(-?\\d+)\\] stalled (\\d+)s ago - the next proxy or the release owns this swim\\)$')

/**
 * Parse one re-arm brake line, or null.
 * @param {string} [line]
 * @returns {null|{bot: string, land: string, x: number, z: number, ageSec: number}}
 */
export function parseRearmBrake (line) {
  if (typeof line !== 'string') return null
  const m = line.match(REARM_BRAKE_RE)
  if (!m) return null
  return { bot: m[1], land: m[2], x: Number(m[3]), z: Number(m[4]), ageSec: Number(m[5]) }
}

/**
 * The re-arm census over a face log (pure; the decompose field read): the
 * brake line's own family row - how many re-arms the brake refused, per bot
 * and per target, and the ages it saw (the cooldown's field window).
 * Accepts an array of lines or a raw text blob (split on newline). Junk-safe:
 * a brake-shaped line the grammar refused counts unparsed, never dropped.
 * @param {string[]|string} [lines] the face log
 * @returns {{brakes: {n: number, byBot: {}, age: {n: number, min: number|null, max: number|null, sum: number}}, targets: Array<{key: string, x: number, z: number, total: number, bots: {}, land: string}>, unparsed: number}}
 */
export function rearmCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const brakes = { n: 0, byBot: {}, age: { n: 0, min: null, max: null, sum: 0 } }
  const targets = new Map()
  let unparsed = 0
  for (const l of rows) {
    const p = parseRearmBrake(l)
    if (p) {
      brakes.n++
      brakes.byBot[p.bot] = (brakes.byBot[p.bot] || 0) + 1
      if (brakes.age.min === null || p.ageSec < brakes.age.min) brakes.age.min = p.ageSec
      if (brakes.age.max === null || p.ageSec > brakes.age.max) brakes.age.max = p.ageSec
      brakes.age.sum += p.ageSec
      brakes.age.n++
      const key = `${p.x},${p.z}`
      let t = targets.get(key)
      if (!t) {
        t = { key, x: p.x, z: p.z, total: 0, bots: {}, land: p.land }
        targets.set(key, t)
      }
      t.total++
      t.bots[p.bot] = (t.bots[p.bot] || 0) + 1
      continue
    }
    if (/^F\d+ \[F\d+\] water: same-target re-arm/.test(l)) unparsed++
  }
  const sorted = [...targets.values()].sort((a, b) => b.total - a.total)
  return { brakes, targets: sorted, unparsed }
}
