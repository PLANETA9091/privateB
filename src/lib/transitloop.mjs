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
