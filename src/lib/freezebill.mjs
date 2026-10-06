// (v0.724.0) THE FREEZE GATE'S OWN LADDER - the frozen client relog's own
// byte anatomy: the streaks, the gate windows, the freeze context.
//
// The relog lane's meter is priced (the relog bill v0.715.0 joins the
// relogs to the walk-out's stalled deliveries; the kick bill v0.717.0
// reads the churn's split) but the FREEZE EVENT's own bytes ride unread:
// the raw counter row (v0.425.0's census) counts the lines and moves on.
// Every frozen client relog line carries the client's own state:
//   '#<N> consecutive'      - the freeze STREAK (the consecutive depth),
//   'pages <N>s'            - the frozen-return GATE the sentry held
//                             (the ladder: 10s -> 20s -> 40s -> 60s, the
//                             window doubling as the streak climbs),
//   'o2=<n> health=<f>'     - the vitals the client carried INTO the
//                             freeze (froze at full o2 = the physics died
//                             healthy; o2 low = the drowning clock won
//                             the race to the freeze),
//   'window=<skin>'         - the threshold's own skin (legacy/current).
//
// freezeBill(lines) folds those bytes per bot. THE LADDER VERDICT: a bot
// whose streak reaches 3+ is THE FULL LADDER's rider - the gate doubled
// twice and the client still froze (the patience is not the cure: the
// 45th's F17 rode #1..#4 with the gate 10s -> 60s and froze every time;
// the reconnect lane's widening never saved the physics). Below the bar
// the bill reads the low end honestly (the empty ladder cell - the
// gate's early rungs, no futility named).
//
// The health rides the client's own float noise (14.000000953674316) -
// the bill rounds to one decimal (the lib's own normalization, stated
// here; the raw bytes stay the log's).
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only,
// the v0.379/.../v0.723.0 precedent).
//

// The freeze line's own byte: the bot token, the streak, the head-wet
// verdict (the era's one freeze skin - the drowning clock's own), the
// gate's pages, the vitals, the window skin. The health is the client's
// float (the [-?\\d.]+ keeps the noise honest).
const FREEZE_RELOG_RE = /^(F\d+) \[\1\] water: frozen client relog \(#(\d+) consecutive\) \(frozen while head-wet \((\d+) verdict\) - the drowning clock owns this client\) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages (\d+)s \(the frozen-return gate\) - o2=(\d+) health=(-?[\d.]+) window=(\w+)$/

// THE LADDER VERDICT's bar: the gate doubled twice by streak 3
// (10s -> 20s -> 40s) - the patience's own ceiling met.
const LADDER_STREAK = 3

/**
 * freezeBill(lines) - the frozen relog's own ladder read, per bot.
 *
 * @param {string[]|string|null} lines the face log (array or raw blob)
 * @returns {null|{n: number,
 *   streaks: Object<string, number>,
 *   gates: Object<string, number>,
 *   byBot: Object<string, {n: number, maxStreak: number, maxGate: number,
 *     freezes: Array<{streak: number, gate: number, o2: number,
 *       health: number, window: string}>}>,
 *   ladder: Object<string, {maxStreak: number, maxGate: number}>}}
 *   null when the face rode no frozen relog (the honest silence).
 */
export function freezeBill (lines) {
  const list = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!list) return null
  const bill = { n: 0, streaks: {}, gates: {}, byBot: {}, ladder: {} }
  for (const line of list) {
    if (typeof line !== 'string') continue
    const m = line.match(FREEZE_RELOG_RE)
    if (!m) continue
    const [, bot, streak, , pages, o2, health, win] = m
    bill.n++
    const s = Number(streak)
    const g = Number(pages)
    bill.streaks[streak] = (bill.streaks[streak] || 0) + 1
    bill.gates[pages] = (bill.gates[pages] || 0) + 1
    const b = bill.byBot[bot] || (bill.byBot[bot] = { n: 0, maxStreak: 0, maxGate: 0, freezes: [] })
    b.n++
    if (s > b.maxStreak) b.maxStreak = s
    if (g > b.maxGate) b.maxGate = g
    // the freeze context: the vitals the client carried INTO the freeze
    // (the health rounds to one decimal - the float noise stays out)
    b.freezes.push({
      streak: s,
      gate: g,
      o2: Number(o2),
      health: Math.round(Number(health) * 10) / 10,
      window: win
    })
    // THE LADDER VERDICT - the streak's own depth prices the futility
    if (s >= LADDER_STREAK) {
      const l = bill.ladder[bot] || (bill.ladder[bot] = { maxStreak: 0, maxGate: 0 })
      if (s > l.maxStreak) l.maxStreak = s
      if (g > l.maxGate) l.maxGate = g
    }
  }
  if (bill.n === 0) return null
  return bill
}
