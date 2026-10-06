// (v0.722.0) THE PINNED SEAT'S OWN BILL - the water lane's own launch
// anatomy: which bot keeps launching at the same unreachable land.
//
// The 45th's read (fire 0330, priced by hand): F17 rode 79 of the face's
// 83 transit launches at ONE target [-129,403] and stood 51 passes at
// [-129,*,401] y=47.2 - the pinned seat, the fleet-side front with
// coordinates. No existing lens named it: the sentry census folds the
// passes (its spot row showed [-129,401] x46) but never the launches,
// and the transit loop ledger's whale needs 50+ launches WITH the
// zero-gain stall pairing - the seat's own shape (a bot re-aiming one
// land point) rode between them. The bill prices the seat directly.
//
// pinBill(lines) folds the water lane's two launch families per bot:
//   - the transit launches: 'water: transit toward known land (<block>)
//     at [<x>,<z>] d=<n>' - the launch's own aim, per target;
//   - the passes: 'water: pass <n> head=<h> shore=<none|hit r=N>
//     land=<l>[ d=<n>] y=<y> o2=<o|reset(-1)> probes=<p> at=[<x>,<y>,<z>]'
//     - the sentry's stand, grouped by the ground plane [x,z] (the y is
//     the head's height, the watch is where the feet stand).
//
// THE PIN VERDICT: a bot whose top target holds >= 70% of >= 10 transit
// launches is THE PINNED SEAT (the bot keeps re-aiming the same land -
// the fleet-side cure's own coordinates; the threshold keeps the spread
// faces honest - the 42nd's and 44th's top shares sat 36..59%). A pinned
// bot's cell carries its watch: the top [x,z] pass ground and its count
// (no passes, no watch - the launch-only seat still reads).
//
// A face without either family reads the honest silence (null); a face
// whose every launch spread wide reads the empty pin cell (the honest
// zero - THE CROWD'S WANDER, the goal's own verdict).
//
// (v0.723.0) THE NEAR PIN rides beside the verdict: the bots the volume
// bar left unnamed - the share held (70%+) of 6..9 launches. The 46th's
// F17 8/9 at [-143,405] (88.9%) is the cell's own motive: the transit
// census's row named THE PINNED SEAT while the bar's volume guard kept
// the bill's silence. The near cell prices what the bar leaves on the
// table without lowering it (a volume short is not a concentration
// short); the pin's own bot stays the pin's subject.
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only,
// the v0.379/.../v0.722.0 precedent).
//

// The transit launch's own byte: the bot token, the water lane's prefix,
// the known-land aim and the [x,z] target. The d= tail rides along but
// the seat reads the AIM, not the distance.
const PIN_TRANSIT_RE = /^(F\d+) \[\1\] water: transit toward known land \((\w+)\) at \[(-?\d+),(-?\d+)\](?: d=\d+)?$/

// The pass line's own byte: the sentry census's own grammar's skins - the
// shore rides 'none' or 'hit r=N' (the space is the hit's own byte), the
// o2 rides the reset skin 'reset(-1)' at the mirror's edge, the y and the
// planar spot at=[x,y,z] (y may ride decimals; x/z stay block ints).
const PIN_PASS_RE = /^(F\d+) \[\1\] water: pass \d+ head=(\S+) shore=(?:none|hit r=\d+) land=(\S+)(?: d=\d+)? y=(-?[\d.]+) o2=(?:reset\(-1\)|\d+) probes=\d+ at=\[(-?\d+),(-?[\d.]+),(-?\d+)\]$/

// THE PIN VERDICT's thresholds: a seat is a CONCENTRATION, not a volume -
// 10+ launches at one aim holding 70%+ of the bot's rides.
const PIN_MIN_LAUNCHES = 10
const PIN_SHARE = 0.7

// (v0.723.0) THE NEAR PIN's window - the concentration the volume bar
// left unnamed: 6..9 launches at one aim holding the share. The 46th's
// F17 rode 8/9 at [-143,405] (88.9%) while the transit census's own row
// named THE PINNED SEAT at the same aim - the volume guard keeps small
// samples honest and the shape rode behind it. The share bar never
// drops (a volume short is not a concentration short); the floor holds
// at 6 (a majority of the bar's own window - below it the seat is a
// coincidence's shape, not a bot's stance).
const PIN_NEAR_MIN_LAUNCHES = 6

/**
 * pinBill(lines) - the water lane's own seat read, per bot.
 *
 * @param {string[]|string|null} lines the face log (array or raw blob)
 * @returns {null|{n: number, nPass: number,
 *   bots: Object<string, {total: number, targets: Object<string, number>,
 *     nPass: number, passes: Object<string, number>}>,
 *   pinned: Object<string, {target: string, launches: number, of: number,
 *     share: number, watch?: {pos: string, passes: number}}}>,
 *   nearPin: Object<string, {target: string, launches: number, of: number,
 *     share: number, watch?: {pos: string, passes: number}>}}
 *   null when the face rode neither family (the honest silence).
 */
export function pinBill (lines) {
  const list = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!list) return null
  const bots = {}
  const bot = (name) => {
    const b = bots[name] || (bots[name] = { total: 0, targets: {}, nPass: 0, passes: {} })
    return b
  }
  let n = 0
  let nPass = 0
  for (const line of list) {
    if (typeof line !== 'string') continue
    let m = line.match(PIN_TRANSIT_RE)
    if (m) {
      const b = bot(m[1])
      const tgt = `[${m[3]},${m[4]}]`
      b.total++
      b.targets[tgt] = (b.targets[tgt] || 0) + 1
      n++
      continue
    }
    m = line.match(PIN_PASS_RE)
    if (m) {
      const b = bot(m[1])
      // the watch is the FEET's ground - the planar [x,z], the y dropped
      const pos = `[${m[5]},${m[7]}]`
      b.nPass++
      b.passes[pos] = (b.passes[pos] || 0) + 1
      nPass++
    }
  }
  if (n === 0 && nPass === 0) return null
  // THE PIN VERDICT - the concentration read, post-fold (the fold's own
  // cells stay raw; the verdict prices the join). (v0.723.0) the near
  // cell rides beside it: the bots the volume bar left unnamed - the
  // share held, the window 6..9. The pinned bot's own cell stays the
  // pin's subject (the pin is not near itself); a bot below the near
  // floor or below the share bar reads neither cell (the bars never
  // invent).
  const pinned = {}
  const nearPin = {}
  for (const [name, b] of Object.entries(bots)) {
    const targets = Object.entries(b.targets).sort((a, c) => c[1] - a[1])
    if (!targets.length) continue
    const [tgt, topN] = targets[0]
    const share = topN / b.total
    if (share < PIN_SHARE) continue
    const seat = { target: tgt, launches: topN, of: b.total, share: Math.round(share * 1000) / 10 }
    // the watch: the bot's own top pass ground (no passes, no watch -
    // the launch-only seat reads)
    const passes = Object.entries(b.passes).sort((a, c) => c[1] - a[1])
    if (passes.length) seat.watch = { pos: passes[0][0], passes: passes[0][1] }
    if (b.total >= PIN_MIN_LAUNCHES) pinned[name] = seat
    else if (b.total >= PIN_NEAR_MIN_LAUNCHES) nearPin[name] = seat
  }
  return { n, nPass, bots, pinned, nearPin }
}
