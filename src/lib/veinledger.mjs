//
// veinledger.mjs - THE VEIN LEDGER (v0.501.0)
// The vein sweep's own book. The sweep is the fleet's core mining
// engine - every supply chain downstream (furnaces, torches, tools,
// weapons) eats this lane's yield - and the fire-0230 shape census
// puts 'vein sweep:' at 263 rows across the stored faces 42+43 with
// exactly ONE reader before this book: dropwalk.mjs (v0.413.0), the
// per-fail drop-walk line only (42 rows). The other 221 rows - the
// terminals, the walk yield, the gallery digs, the dig refusals, the
// spares and the tier guard - had zero readers.
//
// THE EMITTER (src/bots/miner.mjs, one lane, one parser):
//   the sweep terminal ('N drop(s) in reach (N dug)' - the sweep's
//   own harvest: drops found, blocks dug), the walk-delivery yield
//   ('+Nu walked from the drops (N dug)'), the gallery digs ('N ores
//   dug beside the gallery (floor lock|ore detour)' - NOTE the bare
//   prefix: these rows ride 'F9 vein sweep:' without the [F9] tag,
//   the only shape in the lane that does), the dig refusals (the lip
//   'lip dig refused - <why> (air N, dy N)', the support 'support dig
//   refused - <why> (air N, dist N[, seal N])', the ledge cut
//   'ledge cut refused - <why> (seal N, dy N, dist N)' - the WIDE
//   greedy why per the smelthold v0.491.0 lesson, the emitter's own
//   vocabulary kept as histograms), the spares and the honest
//   refusals before the walk ('N deep drop(s) skipped (dy < -N ...)'
//   - the guaranteed spiral refused, 'N drop(s) already inside the
//   goal - the zero-displacement walk spared', 'N drop goal(s)
//   refused before the goto (no standable cell ...) - the proven
//   burn'), the wide-goal walk triage ('N above-plane walk(s) timed
//   out on the wide goal (range N) - the ledge family (the vN.N.N
//   class, the triage names it)' / 'N below-plane walk(s) still
//   failed on the wide goal (range N) - the drop rests deeper than
//   the lip'), the walk post-mortem ('the drop walks picked nothing
//   (pocket delta N, N failed walk(s))') and the ore tier guard
//   ('ore tier guard - N <ore> left for a stone pick (have <pick>)'
//   - the tier law's own voice).
//
// OWNERSHIP (pinned both ways): 'the drop walk to [x,y,z] failed -'
// rows are dropwalk.mjs's (v0.413.0) - this book reads ZERO of them;
// the test pins the boundary with the exported VEIN_DROPWALK_RE.
//
// THE FIELD READ (faces 42+43, hand-traced then live-verified byte
// for byte; the shape census closes the lane at UNMATCHED 0): 269
// 'vein sweep:' rows = 42 drop-walk fails (dropwalk's, unread here)
// + 227 read by this book - 29 terminals (170 drops in reach, 308
// blocks dug), 18 walk yields (+233u), 29 gallery digs (308 ores:
// floor lock 23 / ore detour 6), 26 lip + 23 support + 10 ledge-cut
// refusals (the why histograms kept), the honest spares (14 deep
// skips -> 29 drops, 10 zero-displacement -> 25, 10 goal refusals
// -> 14), the wide-goal triage (18 above-plane -> 30 walks, 13
// below-plane -> 25), 11 picked-nothings (0 pocket delta - the
// walks burn, the pocket never pays), 2 dig-downs (support 1 /
// lip 1), the stance lane (2 armed / 2 landed, 1.9u walked) and 10
// tier guards refusing 99 ore units (iron 63 / copper 36) from a
// wooden pick - the tier law's own voice, face 43 only.
//
// Pure parser, unit-pinned (the torchbook v0.500.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new
// log lines - the v0.379.0 precedent. Junk-safe end to end:
// non-string rows skipped, a face with no vein lines reads the
// honest zero.
//

// All REs accept BOTH prefix skins: 'F9 [F9] vein sweep:' and the
// gallery's bare 'F9 vein sweep:'. The bot capture is group 1 - the
// backreference \1 pins the [F9] tag to the same name.
import { deferPromise } from './upgradecensus.mjs' // (v0.768.0) the promise's own verdicts - the bill's cure-side join
const P = '^(\\S+)(?: \\[\\1\\])? vein sweep: '

// 'F9 [F9] vein sweep: 8 drop(s) in reach (19 dug)'
export const VEIN_TERMINAL_RE =
  new RegExp(P + '(\\d+) drop\\(s\\) in reach \\((\\d+) dug\\)$')
// 'F9 [F9] vein sweep: +12u walked from the drops (19 dug)'
export const VEIN_YIELD_RE =
  new RegExp(P + '\\+(\\d+)u walked from the drops \\((\\d+) dug\\)$')
// 'F9 vein sweep: 19 ores dug beside the gallery (floor lock)'
// the bare-prefix skin - the gallery dig's own voice
export const VEIN_GALLERY_RE =
  new RegExp(P + '(\\d+) ores dug beside the gallery \\((floor lock|ore detour)\\)$')
// 'F6 [F6] vein sweep: lip dig refused - sealed floor (air 0, dy -0.9)'
// (the WIDE greedy why - the smelthold lesson)
export const VEIN_LIP_RE =
  new RegExp(P + 'lip dig refused - (.+) \\(air (\\S+), dy (-?[\\d.]+)\\)$')
// 'F12 [F12] vein sweep: support dig refused - sealed under the ledge (air 0, dist 3.1, seal 3)'
// 'F1 [F1] vein sweep: support dig refused - the support reads air (air null, dist 3.7)'
export const VEIN_SUPPORT_RE =
  new RegExp(P + 'support dig refused - (.+) \\(air (\\S+), dist ([\\d.]+)(?:, seal (\\d+))?\\)$')
// 'F12 [F12] vein sweep: ledge cut refused - the dy reads out of class (seal 3, dy 1.07, dist 3.1)'
export const VEIN_LEDGE_RE =
  new RegExp(P + 'ledge cut refused - (.+) \\(seal (\\d+), dy (-?[\\d.]+), dist ([\\d.]+)\\)$')
// 'F3 [F3] vein sweep: 2 deep drop(s) skipped (dy < -2.0 - the lip sphere cannot reach, the walk was a guaranteed spiral)'
export const VEIN_DEEPSKIP_RE =
  new RegExp(P + '(\\d+) deep drop\\(s\\) skipped \\(dy < -([\\d.]+) - the lip sphere cannot reach, the walk was a guaranteed spiral\\)$')
// 'F3 [F3] vein sweep: 1 drop(s) already inside the goal - the zero-displacement walk spared (the instant done the spin book reads as churn)'
export const VEIN_SPARED_RE =
  new RegExp(P + '(\\d+) drop\\(s\\) already inside the goal - the zero-displacement walk spared \\(the instant done the spin book reads as churn\\)$')
// 'F3 [F3] vein sweep: 1 drop goal(s) refused before the goto (no standable cell in the arrival sphere - the walk was a proven burn)'
export const VEIN_GOREFUSED_RE =
  new RegExp(P + '(\\d+) drop goal\\(s\\) refused before the goto \\(no standable cell in the arrival sphere - the walk was a proven burn\\)$')
// 'F3 [F3] vein sweep: 1 above-plane walk(s) timed out on the wide goal (range 2) - the ledge family (the v0.341.0 class, the triage names it)'
export const VEIN_ABOVE_RE =
  new RegExp(P + '(\\d+) above-plane walk\\(s\\) timed out on the wide goal \\(range (\\d+)\\) - the ledge family \\(the v([\\d.]+) class, the triage names it\\)$')
// 'F3 [F3] vein sweep: 1 below-plane walk(s) still failed on the wide goal (range 2) - the drop rests deeper than the lip'
export const VEIN_BELOW_RE =
  new RegExp(P + '(\\d+) below-plane walk\\(s\\) still failed on the wide goal \\(range (\\d+)\\) - the drop rests deeper than the lip$')
// 'F10 [F10] vein sweep: the drop walks picked nothing (pocket delta 0, 1 failed walk(s))'
export const VEIN_PICKEDNOTHING_RE =
  new RegExp(P + 'the drop walks picked nothing \\(pocket delta (-?\\d+), (\\d+) failed walk\\(s\\)\\)$')
// 'F12 [F12] vein sweep: ore tier guard - 11 copper_ore left for a stone pick (have wooden_pickaxe)'
// 'F14 [F14] vein sweep: ore tier guard - 9 iron_ore, 3 copper_ore left for a stone pick (have wooden_pickaxe)'
// The list segment is the WIDE greedy capture (one skin, two arities);
// the lib parses the '<count> <ore>' pairs out of it - one parser for
// the guard's own voice, the units summed per ore name.
export const VEIN_TIERGUARD_RE =
  new RegExp(P + 'ore tier guard - (.+) left for a stone pick \\(have (\\w+)\\)$')
// the pair skin inside the tier guard's list segment: '<count> <ore>'
export const VEIN_TIERPAIR_RE = /(\d+) (\w+)/g

// 'F10 [F10] vein sweep: 1 support dig-down(s) - the failed ledge walk shook the drop loose, the fall carries it to the magnet'
// 'F3  [F3] vein sweep: 1 lip dig-down(s) - the range-2 arrival left the drop outside the magnet, the last mile dug'
// One family, two skins: the kind (support|lip) and the WIDE why kept.
export const VEIN_DIGDOWN_RE =
  new RegExp(P + '(\\d+) (support|lip) dig-down\\(s\\) - (.+)$')

// 'F3 [F3] vein sweep: stance step armed - the ledge reads too high (dy 6, dist 2.4 - closing to the column)'
export const VEIN_STANCEARMED_RE =
  new RegExp(P + 'stance step armed - (.+) \\(dy (-?[\\d.]+), dist ([\\d.]+) - closing to the column\\)$')
// 'F13 [F13] vein sweep: high ledge stance landed - dist 1.5, the dig still refuses - the ledge reads too high, walked 0.9'
export const VEIN_STANCELANDED_RE =
  new RegExp(P + 'high ledge stance landed - dist ([\\d.]+), the dig still refuses - (.+), walked ([\\d.]+)$')

// The ownership boundary: dropwalk.mjs (v0.413.0) owns the per-fail
// drop-walk line. This book reads ZERO of these - the test pins it
// with the live field rows.
// 'F9 [F9] vein sweep: the drop walk to [-129,46,407] failed - sweep drops: ...'
export const VEIN_DROPWALK_RE =
  new RegExp(P + 'the drop walk to \\S+ failed')

function zeroBot () {
  return {
    terminals: 0, terminalDrops: 0, terminalDug: 0,
    yields: 0, yieldU: 0, yieldDug: 0,
    gallery: 0, galleryOres: 0, galleryFloorLock: 0, galleryOreDetour: 0,
    lipRefusals: 0,
    supportRefusals: 0, supportSeal: 0,
    ledgeRefusals: 0,
    deepSkips: 0, deepSkippedDrops: 0,
    spared: 0, sparedDrops: 0,
    goalRefusals: 0, goalRefusedDrops: 0,
    aboveTimeouts: 0, aboveWalks: 0,
    belowFails: 0, belowWalks: 0,
    pickedNothings: 0, pickedDelta: 0, pickedFailedWalks: 0,
    tierGuards: 0, tierGuardOres: 0,
    digDowns: 0, digDownDrops: 0, digDownSupport: 0, digDownLip: 0,
    stanceArmed: 0, stanceLanded: 0, stanceWalked: 0,
    total: 0
  }
}

function zeroTotals () {
  const t = zeroBot()
  t.veinBots = {}
  t.lipWhys = {}
  t.supportWhys = {}
  t.ledgeWhys = {}
  t.tierGuardNames = {}
  t.stanceArmedWhys = {}
  t.stanceLandedWhys = {}
  t.total = 0
  return t
}

const bump = (h, k) => { h[k] = (h[k] ?? 0) + 1 }

/**
 * Read the vein sweep's field book - the terminals, the walk yield,
 * the gallery digs, the dig refusals, the spares and the tier guard.
 * Pure census: no cross-line join, no opener required; every line
 * classifies independently. The drop-walk fail lines belong to
 * dropwalk.mjs and are never read here.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {{bots: Object<string, object>, totals: object}|null}
 *   null for a junk input (non-array); a face with no vein lines
 *   reads the honest zero (empty bots, zeroed totals).
 */
export function veinLedger (lines) {
  if (!Array.isArray(lines)) return null
  const bots = {}
  const totals = zeroTotals()
  const bot = name => bots[name] ?? (bots[name] = zeroBot())
  for (const line of lines) {
    if (typeof line !== 'string') continue
    // the ownership boundary first: dropwalk's rows never classify
    if (VEIN_DROPWALK_RE.test(line)) continue
    let m = VEIN_TERMINAL_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.terminals++; b.terminalDrops += Number(m[2]); b.terminalDug += Number(m[3])
      b.total++
      continue
    }
    m = VEIN_YIELD_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.yields++; b.yieldU += Number(m[2]); b.yieldDug += Number(m[3])
      b.total++
      continue
    }
    m = VEIN_GALLERY_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.gallery++; b.galleryOres += Number(m[2])
      if (m[3] === 'floor lock') b.galleryFloorLock++
      else b.galleryOreDetour++
      b.total++
      continue
    }
    m = VEIN_LIP_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.lipRefusals++
      bump(totals.lipWhys, m[2])
      b.total++
      continue
    }
    m = VEIN_SUPPORT_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.supportRefusals++
      if (m[5] != null) b.supportSeal += Number(m[5])
      bump(totals.supportWhys, m[2])
      b.total++
      continue
    }
    m = VEIN_LEDGE_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.ledgeRefusals++
      bump(totals.ledgeWhys, m[2])
      b.total++
      continue
    }
    m = VEIN_DEEPSKIP_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.deepSkips++; b.deepSkippedDrops += Number(m[2])
      b.total++
      continue
    }
    m = VEIN_SPARED_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.spared++; b.sparedDrops += Number(m[2])
      b.total++
      continue
    }
    m = VEIN_GOREFUSED_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.goalRefusals++; b.goalRefusedDrops += Number(m[2])
      b.total++
      continue
    }
    m = VEIN_ABOVE_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.aboveTimeouts++; b.aboveWalks += Number(m[2])
      b.total++
      continue
    }
    m = VEIN_BELOW_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.belowFails++; b.belowWalks += Number(m[2])
      b.total++
      continue
    }
    m = VEIN_PICKEDNOTHING_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.pickedNothings++
      b.pickedDelta += Number(m[2])
      b.pickedFailedWalks += Number(m[3])
      b.total++
      continue
    }
    m = VEIN_TIERGUARD_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.tierGuards++
      // the list segment: '<count> <ore>' pairs - the single-ore skin
      // is the arity-one case; the units sum per ore name
      for (const pm of m[2].matchAll(VEIN_TIERPAIR_RE)) {
        b.tierGuardOres += Number(pm[1])
        totals.tierGuardNames[pm[2]] = (totals.tierGuardNames[pm[2]] ?? 0) + Number(pm[1])
      }
      b.total++
      continue
    }
    m = VEIN_DIGDOWN_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.digDowns++; b.digDownDrops += Number(m[2])
      if (m[3] === 'support') b.digDownSupport++
      else b.digDownLip++
      b.total++
      continue
    }
    m = VEIN_STANCEARMED_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.stanceArmed++
      bump(totals.stanceArmedWhys, m[2])
      b.total++
      continue
    }
    m = VEIN_STANCELANDED_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.stanceLanded++; b.stanceWalked += Number(m[4])
      bump(totals.stanceLandedWhys, m[3])
      b.total++
    }
  }
  for (const b of Object.values(bots)) {
    for (const k of Object.keys(b)) {
      if (k === 'total') continue
      totals[k] += b[k]
    }
    totals.total += b.total
    totals.veinBots[b.total] = (totals.veinBots[b.total] ?? 0) + 1
  }
  return { bots, totals }
}

// (v0.768.0) THE TIER GUARD'S OWN BILL - the guard's tax names its repeat
// rider. The v0.501.0 ledger priced the guard's raw economy (the rows, the
// units, the ore names) and the v0.467.0 promise priced the upgrade rung's
// own answer - but the guard's PER-BOT seat never spoke: face 69
// (37617643599) rode F7's seven re-asks ('1 copper_ore left for a stone
// pick (have wooden_pickaxe)' x7) beside F18's single 8-unit vein, and no
// row named the walker who kept re-asking a wall the rung could cure.
// THE BILL LAW (the kickkinds v0.761.0 verdict precedent, zero new
// regexes - the cells are the veinLedger's own per-bot tierGuards/
// tierGuardOres and the deferPromise's own verdicts): the owner under the
// strict-majority law on the ROWS (the re-ask is the repeat's own meter -
// the units' magnitudes ride the ~Nu pricing's inflation margin); a tie
// owns nothing (the storm-has-no-seat precedent); the promise's verdict
// names the cure's own state (kept = the option held, the rung never
// came; took-after = the rung came after the re-asks; took-before-only =
// the rung came before and the wall stood anyway; no defer line = the
// roll never named the owner); junk never invents a bill (a null ledger,
// zero guard rows, a tied spread -> the honest silence).
// @param {string[]|string} [lines] one fleet-log (array or blob)
// @returns {null|string} the bill row without the mine's version prefix,
//   null for the honest silences
export function tierGuardBill (lines) {
  const vl = veinLedger(lines)
  if (!vl) return null
  const riders = Object.entries(vl.bots)
    .map(([bot, b]) => ({ bot, rows: b.tierGuards, units: b.tierGuardOres }))
    .filter(r => r.rows > 0)
  if (!riders.length) return null
  riders.sort((a, b) => b.rows - a.rows || a.bot.localeCompare(b.bot))
  const top = riders[0]
  if (riders.length > 1 && riders[1].rows === top.rows) return null
  const pct = Math.round(1000 * top.rows / vl.totals.tierGuards) / 10
  const promise = deferPromise(lines)
  const verdict = promise ? promise.perBot[top.bot] : undefined
  let clause
  if (verdict === 'kept') clause = 'the promise\'s verdict: kept - the option held, the rung never came'
  else if (verdict === 'took-after') clause = 'the promise\'s verdict: took-after - the rung came after the re-asks (the promise\'s live pass)'
  else if (verdict === 'took-before-only') clause = 'the promise\'s verdict: took-before-only - the rung came before and the wall stood anyway'
  else clause = 'the promise\'s roll never named the owner'
  return `the tier guard's own bill: ${top.bot} owns ${top.rows} of ${vl.totals.tierGuards} refusal(s) (${pct}%), ${top.units} of ${vl.totals.tierGuardOres} unit(s) left in the ground - the repeat guard: the same bot re-asked the wall - ${clause}`
}
