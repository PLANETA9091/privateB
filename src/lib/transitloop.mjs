//
// transitloop.mjs - THE LOOP LEDGER (v0.692.0)
//
// The per-bot swim loop's own account. The transit census (v0.427.0)
// prices the launches, the stalls, the ground gained (v0.435.0) and the
// cadence verdict (v0.446.0); the re-arm census (v0.443.0) prices the
// brake - but no row CLOSES THE LOOP for one bot. The 24th flight
// (37421661533) is the contradiction's own face: F12 spent 152 launches
// across 4 targets, paid 13 stalls, ate 10 brakes, and every paired
// stall gained 0.0 ground - while the cadence row said 'the repeats
// earned their keep' (d 6..3, closed 50%). Both rows told the truth and
// the loop never had to reconcile them: the progress rode the re-arms
// (the launch d drifting closer across the face), the swims themselves
// bought NOTHING.
//
// The ledger joins the three parsers' outputs per bot (zero new regexes
// - the one-parser law by import, the v0.689.0 decideweather precedent):
//   launches  'F12 [F12] water: transit toward known land (NAME) at [x,z] d=N'
//   stalls    'F12 [F12] water: transit stalled (d=N after N passes - ...)'
//   brakes    'F12 [F12] water: same-target re-arm braked (NAME at [x,z] stalled Ns ago - ...)'
// The stall pairs with the bot's most recent launch (the log's order is
// the swim's order - the v0.435.0 pairing rule) and its gain is
// launch d - stall d. An unpaired stall (no prior launch by that bot)
// stays evidence, never a fake gain (the honest-evidence law).
//
// THE WHALE VERDICT: a bot with >= LOOP_WHALE_LAUNCHES launches whose
// EVERY paired stall gained <= 0 ground - the loop bought no ground.
// The bar is the 24th's own gap (F12 152 vs the field's next spender's
// 2); the positive-gain loop is never named (the verdict prices
// zero-YIELD loops, not busy ones - the honest fork); below the bar, or
// no pairs, or any gain > 0: no whale - the row stays data and the
// face's smaller loops stay unnamed. Junk-safe null on non-input; a
// launch-free face reads the honest empty shape. Pure: reads, never
// mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.691.0 precedent) - the fleet's own transit bytes are
// the filter-keys, they already ride.
//

import { parseTransitLaunch, parseTransitStall } from './transitcensus.mjs'
import { parseRearmBrake } from './rearm.mjs'

// ---------------------------------------------------------------------------
// (v0.753.0) THE WHALE'S OWN ROTATION - the seat split's own verdict.
//
// The loop ledger (v0.692.0) prices the bot-level whale (the zero-yield
// loop), the pinbill (v0.722.0) prices the fleet-level pin, the cadence
// (v0.446.0) prices ONE seat's flat-vs-descending truth - but no row prices
// the whale's SEAT SPLIT. The 62nd face (37586368766) is the rotation's own
// field read: F14 spent 145 launches across THREE pinned seats (65/44/36),
// every seat flat by the cadence's own law (8..7 = 12% closed, 5..5 and
// 14..14 = 0%), 4 paired stalls gained 0.0 ground - the loop "tried
// different targets" and every target was the same wall. The seat-hopping
// is the disguise both existing rows see past but never name together: the
// bot-level whale says the swims bought nothing, the per-seat cadence says
// each seat is a wall, and the rotation between them is the loop's own
// alibi ("I changed seats").
//
// The gate (the honest fork, every fence inherited):
//   - the whale gate fires (launches >= LOOP_WHALE_LAUNCHES, paired stalls
//     exist, every gain <= 0 - a paying loop is never a rotation)
//   - >= WHALE_ROTATION_SEATS seats (a single seat is the pinned seat's
//     own subject - the v0.446 cadence + the v0.722 pinbill own it)
//   - EVERY seat carries the cadence's own evidence bar (n >= 5) and
//     reads walls by the cadence's own law (closed = (max-min)/max < 0.5;
//     a max of 0 reads walls - no distance left to close)
//   - any seat approaching (closed >= 0.5): the rotation was trying a
//     seat that could pay - the honest silence (never a fake verdict)
// Row format (seat list sorted by launches desc, then key asc; d prints
// max..min, the cadence row's own order):
//   'the whale's own rotation: N seat(s) held the L launch(es) (per-seat
//   walls: [x,z] xN d=A..B, ...) - the loop changed seats and every seat
//   was the same wall (the ground never moved) - the rotation was the
//   wall's own disguise'
// Pure: one pass, zero new regexes (the one-parser law by import -
// parseTransitLaunch / parseTransitStall, the v0.692.0 ledger's own fuel).
// Junk-safe null on non-input; no whale, no row. Mining-surface only, zero
// fleet wiring (the v0.379/.../v0.749.0 precedent).
// ---------------------------------------------------------------------------

// THE ROTATION'S OWN BAR - a single seat is the pinned seat's own subject
// (the cadence v0.446.0 + the pinbill v0.722.0 own that read); the rotation
// needs >= 2 seats before the seat-hopping even exists to name.
export const WHALE_ROTATION_SEATS = 2

// The cadence's own evidence bar (v0.446.0: "short runs (< 5 launches -
// the label's own bar) read NULL") - a seat below it stays unjudged and
// the rotation never fires on a face one thin seat could fake.
const ROTATION_SEAT_EVIDENCE = 5

/**
 * whaleRotationRow(lines) - the whale's own rotation: the seat split's
 * verdict for the zero-yield loop (null unless every gate holds).
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|string} the rotation row, or null (the honest fork)
 */
export function whaleRotationRow (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const bots = new Map()
  for (const line of src) {
    if (typeof line !== 'string') continue
    const p = parseTransitLaunch(line)
    if (p) {
      const b = bots.get(p.bot) ||
        bots.set(p.bot, { launches: 0, seats: new Map(), gains: { n: 0, max: null }, lastLaunchD: null }).get(p.bot)
      b.launches++
      const key = `[${p.x},${p.z}]`
      const s = b.seats.get(key) || b.seats.set(key, { n: 0, min: null, max: null }).get(key)
      s.n++
      if (s.min === null || p.dist < s.min) s.min = p.dist
      if (s.max === null || p.dist > s.max) s.max = p.dist
      b.lastLaunchD = p.dist
      continue
    }
    const st = parseTransitStall(line)
    if (st) {
      const b = bots.get(st.bot)
      if (b && b.lastLaunchD !== null) {
        const gained = b.lastLaunchD - st.dist
        b.gains.n++
        if (b.gains.max === null || gained > b.gains.max) b.gains.max = gained
      }
    }
  }
  // the candidates: every bot passing the whale gate with >= 2 seats, the
  // winner picked by the ledger's own sort (launches desc, bot asc)
  const candidates = []
  for (const [bot, b] of bots) {
    if (b.launches < LOOP_WHALE_LAUNCHES) continue
    if (!(b.gains.n > 0) || b.gains.max === null || b.gains.max > 0) continue
    if (b.seats.size < WHALE_ROTATION_SEATS) continue
    candidates.push({ bot, b })
  }
  candidates.sort((a, c) => c.b.launches - a.b.launches || a.bot.localeCompare(c.bot))
  for (const { b } of candidates) {
    const seats = [...b.seats.entries()]
      .map(([key, s]) => ({ key, n: s.n, min: s.min, max: s.max }))
      .sort((a, c) => c.n - a.n || a.key.localeCompare(c.key))
    let allWalls = true
    for (const s of seats) {
      if (s.n < ROTATION_SEAT_EVIDENCE) { allWalls = false; break }
      const spread = s.max - s.min
      const closed = s.max > 0 ? spread / s.max : 0
      if (closed >= 0.5) { allWalls = false; break }
    }
    if (!allWalls) continue
    const seatList = seats.map(s => `${s.key} x${s.n} d=${s.max}..${s.min}`).join(', ')
    return `the whale's own rotation: ${seats.length} seat(s) held the ${b.launches} launch(es) (per-seat walls: ${seatList}) - the loop changed seats and every seat was the same wall (the ground never moved) - the rotation was the wall's own disguise`
  }
  return null
}

// THE WHALE'S BAR - the 24th's own gap: F12's 152 launches vs the
// field's next spender's 2. A loop below 50 launches has not earned
// the name (the busy-but-small loops stay data, never verdicts).
export const LOOP_WHALE_LAUNCHES = 50

const emptyBot = (bot) => ({
  bot, launches: 0, targets: new Map(), stalls: 0, brakes: 0,
  gains: { n: 0, min: null, max: null, sum: 0 }, lastLaunchD: null
})

/**
 * transitLoopLedger(lines) - the per-bot swim loop's own account, with
 * the whale verdict for the zero-yield loop.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{bots: Array<{bot: string, launches: number,
 *   targets: number, topTarget: {key: string, n: number}|null,
 *   stalls: number, brakes: number,
 *   gains: {n: number, min: number|null, max: number|null, sum: number}|null,
 *   whale: boolean}>,
 *   whale: {bot: string, launches: number, targets: number,
 *   topTarget: {key: string, n: number}|null, stalls: number, brakes: number,
 *   gains: {n: number, min: number|null, max: number|null, sum: number},
 *   whale: boolean}|null}}
 */
export function transitLoopLedger (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const bots = new Map()
  for (const line of src) {
    if (typeof line !== 'string') continue
    const p = parseTransitLaunch(line)
    if (p) {
      const b = bots.get(p.bot) || bots.set(p.bot, emptyBot(p.bot)).get(p.bot)
      b.launches++
      const key = `[${p.x},${p.z}]`
      b.targets.set(key, (b.targets.get(key) || 0) + 1)
      b.lastLaunchD = p.dist
      continue
    }
    const s = parseTransitStall(line)
    if (s) {
      const b = bots.get(s.bot) || bots.set(s.bot, emptyBot(s.bot)).get(s.bot)
      b.stalls++
      if (b.lastLaunchD !== null) {
        const gained = b.lastLaunchD - s.dist
        b.gains.n++
        b.gains.sum += gained
        if (b.gains.min === null || gained < b.gains.min) b.gains.min = gained
        if (b.gains.max === null || gained > b.gains.max) b.gains.max = gained
      }
      continue
    }
    const k = parseRearmBrake(line)
    if (k) {
      const b = bots.get(k.bot) || bots.set(k.bot, emptyBot(k.bot)).get(k.bot)
      b.brakes++
    }
  }
  const rows = [...bots.values()]
    .map(b => {
      let topTarget = null
      for (const [key, n] of b.targets) {
        if (!topTarget || n > topTarget.n) topTarget = { key, n }
      }
      return {
        bot: b.bot,
        launches: b.launches,
        targets: b.targets.size,
        topTarget,
        stalls: b.stalls,
        brakes: b.brakes,
        gains: b.gains.n > 0 ? b.gains : null,
        whale: b.launches >= LOOP_WHALE_LAUNCHES && b.gains.n > 0 && b.gains.max <= 0
      }
    })
    .sort((a, b) => b.launches - a.launches || a.bot.localeCompare(b.bot))
  return { bots: rows, whale: rows.find(r => r.whale) || null }
}
