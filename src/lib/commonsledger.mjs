//
// commonsledger.mjs - THE COMMONS LEDGER (v0.502.0)
// The fuel commons sweep's own book - the torch-coal resupply ask's
// ANSWER. The v0.500.0 TORCH LEDGER priced the ask lane ('pocket coal
// dry ... asks the commons (N coal)' - 53 asks, 106 coal) and stopped
// at the ask line: what the commons then DID was unread - and the
// ledger's closing credit ('the rungs and the resupply convert a
// 239-skip coal drought into 172 torches') lent the resupply leg a
// delivery nobody had counted. THE WIRE: join every ask forward to
// the commons sweep that answers it and price the answer (zero fleet
// changes, pure census - the ringafter v0.493.0 / assistledger
// v0.499.0 precedent):
//
//   the asks: via torchbook.mjs's OWN TORCH_RESUPPLY_RE (one parser
//   per shape - this lib creates NO new RE for the torch skins); the
//   smelt leg's fuelResupply is SILENT (no ask line - smelting.mjs
//   calls the commons before the 'no fuel' verdict), so a sweep with
//   no visible ask in front of it reads lane 'smelt' honestly;
//
//   the sweeps: every commons visit opens at the anchor read ('the
//   anchor chest is read first' - the v0.124.0 anchor-first law;
//   verified: every field sweep opened there - 60/60, the no-anchor
//   scan failure never fired) and closes at
//     delivered     - 'took N units (M x coal) from a yard chest';
//     budgetSpent   - 'budget spent (N/M units)' (the 12s slice died);
//     ghost         - 'the clicks lied twice - nothing landed ...';
//     noChest       - 'no yard chest in range' (the c===0 break);
//     silentExhaust - a fresh anchor read or the log's tail closes an
//                     un-verdicted sweep: the loop exhausted through
//                     doom/walk-fail excludes, which emit anatomy but
//                     no verdict line.
//   THE INTERLEAVING-SAFE LAW (the F19 law, face 42): the sweep's
//   window SURVIVES the bot's own interleaved prose - the await's
//   event-driven lanes (the death context, the water mirror, the
//   death drop) fire INSIDE the window without ending it (F19's own
//   death lines rode inside its sweep; the nudge + the five 'chest
//   holds no fuel' lines came AFTER them and belong to the sweep).
//   Only a commons verdict ends a sweep; nothing else does.
//   the sweep's inside is ANATOMY (each chest failure is not a
//   terminal - the sweep continues to the next chest): the empty
//   chest ('chest holds no fuel'), the open failure ('open failed
//   [after the cover dig] (...)'), the vertical doom ('chest at
//   [x,y,z] the yard stands N levels up over M b lateral - the walk
//   ladder cannot climb, the ask rides (the tithe owns the deep
//   resupply)' - the N/M shape captured), the vanished block, the
//   walk failure ('chest walk failed after the nudge (...)'), the
//   two nudge lanes ('path nudge' - the v0.355.0 envelope law,
//   'envelope re-segment' - the v0.356.0 raw-walker law), the spent
//   walk slice ('the nudge|re-segment spent the walk slice (Nms
//   left)'), the cover-dig stand-down and the single ghost retry;
//
//   the ask aftermath: the ask's next torch-lane verdict in the
//   bot's own stream closes the join - rePlan (the terminal: the
//   coal grew), stillDry (the coal skip: the answer was zero), cap,
//   reserve, error, askOpen (the honest tail). One pending ask at a
//   time (the cooldown serializes the asks);
//
//   the body count: the death-context lines that name the walk as
//   the killing leg ('death: ... leg fuel commons walk @...') - the
//   commons walk can KILL (the drown context carries the leg).
//
// THE BOOK LAW: sweeps = delivered + budgetSpent + ghost + noChest +
// silentExhaust; asks = rePlan + stillDry + cap + reserve + error +
// askOpen.
//
// THE FIELD READ (faces 42+43, hand-traced per bot then
// live-verified byte for byte): 60 sweeps (53 torch lane + 7 smelt
// lane) - delivered 0 / budgetSpent 54 / silentExhaust 6 / ghost 0 /
// noChest 0, units 0; anatomy: nudges 106, resegments 11, spent
// slices 49, walk fails 6 (timeout 5, no path 1), vertical dooms 6
// (the yard stands 20-37 levels up over 1-17b lateral), empty chests
// 7, open fails 6, cover stand-downs 6, vanished 0; asks 53 / 106
// coal - stillDry 53 / rePlan 0 (EVERY ask's next torch line is the
// coal skip); deaths 1 (F13's drown: 'leg fuel commons walk
// @-145,391, wet 3s@last'). THE DEAD LETTER BOX LAW: the commons
// never answers a deep digger's ask - 314 commons lines, zero
// deliveries, every ask re-reads a dry pocket. THE ALTITUDE LAW: the
// tithe banks the fleet's coal at a yard that stands 20-37 levels
// ABOVE the asking digger - the commons serves the yard's altitude,
// not the digger's depth. THE WALK'S PRICE: 49 spent 12s slices, 117
// nudge-lane lines, and one body. THE CREDIT CORRECTION: the v0.500.0
// ledger's 'the rungs and the resupply' - the resupply leg delivered
// ZERO; the 172 torches were the rungs' and the pockets' work alone.
//
// (v0.742.0) THE LAST MILE'S OWN CLOCK - the reach's radius (v0.740.0)
// priced WHERE the refused walk died (the d= bands); the CLOCK the walk
// paid dying rode the same tail unread ('raw walk timeout after 2402ms',
// 'raw walk: no net progress for 8161ms', 'raw walk stalled after Nms')
// - the capture rides the SAME COMMONS_LASTMILE_RE match (one parser
// per shape): LASTMILE_MS_RE (internal) reads the elapsed ms into the
// lastMileMs column (numbers, one per refused walk); the bare tails
// (the old faces' shape) add nothing. The reach's anatomy is whole:
// the radius (where), the clock (what it paid) - reachmap.mjs's
// reachClock is the lens (the verdict row).
//
// (v0.740.0) THE REACH'S OWN RADIUS - the refused side of the sweep's
// reach, priced additively in the SAME COMMONS_LASTMILE_RE match (one
// parser per shape): the raw walker's rejections carry the distance
// the walk died at ('raw walk timeout after 2402ms (d=9.1)', 'raw
// walk: no net progress for 8161ms (best d=4.3)', 'raw walk stalled
// after Nms (d=D.D)' - deposit.mjs's own throw shapes); the capture
// rides the already-matched tail into the lastMileD column (numbers,
// one per refused walk). The reach's map now has both sides: the
// reached-and-dry positions (v0.737.0's dryChests) and the refused
// distances (this heal) - reachmap.mjs is the lens (the verdict row).
//
// (v0.737.0) THE DRY YARD'S OWN GRAMMAR - the field's four evolutions
// the ledger went blind to (face 52 = run 37549177806: the chest
// anatomy row read 'empty 0' while the log carried 154 dry reads -
// the supply-side drought proof was invisible for faces). The heals,
// each additive (the old shapes keep reading byte-stable):
//   the located dry chest - 'chest holds no fuel at [x,y,z]' (154 on
//     the 52nd, 48 distinct chests, top [-121,71,403] x8): the bare
//     form's locationless RE matched nothing new. The located read
//     bumps the sweep's emptyChest AND the dry yard's own column
//     (dryReads + the per-chest dryChests map - the yard's dry side
//     named per chest);
//   the last mile refused - 'the last mile refused (...)' (10 on the
//     52nd): the walk reached the last mile and refused - a walk
//     anatomy of its own (lastMile + the digit-normalized whys map:
//     'raw walk timeout after Nms' / 'raw walk: no net progress for
//     Nms' / 'raw walk stalled after Nms');
//   the anchor scan that found no anchor - 'the anchor scan saw N
//     chest(s), M usable after the empty memory - no anchor' (5 on
//     the 52nd, usable 0): the scan's own census, read OUTSIDE the
//     sweep gate (no anchor = no sweep ever opened - the death-row
//     precedent);
//   the ask defers - 'the ask defers (this stance came up dry Ns
//     ago ...)' (4 on the 52nd): the ask that never sent (the clock
//     re-arms) - read outside the sweep gate, the maxDeferSpan kept
//     as a max (a span sums to nothing).
// THE DRY YARD'S OWN VERDICT on the 52nd (the maiden read the heals
// make speakable): demand 88 coal / inflow 0 (no fuel tithe line in
// the whole face) / the yard read dry 154 times across 48 chests -
// the drought is the YARD'S, not the walk's.//
// Pure parser, unit-pinned; decompose is its field read.
// Mining-surface only: zero fleet wiring, zero new log lines.
// Junk-safe end to end: non-string rows skipped, a face with no
// commons traffic reads the honest zero.
//

import {
  TORCH_RESUPPLY_RE,
  TORCH_COAL_SKIP_RE,
  TORCH_TERMINAL_RE,
  TORCH_CAP_RE,
  TORCH_RESERVE_RE,
  TORCH_ERROR_RE
} from './torchbook.mjs'

// ---- the sweep: the opener (the v0.124.0 anchor-first law) ----
// 'F9 fuel commons: the anchor chest is read first'
export const COMMONS_ANCHOR_RE = /^(\S+) fuel commons: the anchor chest is read first$/

// ---- the sweep: the verdicts (each closes the sweep) ----
// 'F9 fuel commons: took 2 units (2 x coal) from a yard chest'
export const COMMONS_TOOK_RE = /^(\S+) fuel commons: took (\d+) units \((.+)\) from a yard chest$/
// 'F9 fuel commons: budget spent (0/1 units)'
export const COMMONS_BUDGET_RE = /^(\S+) fuel commons: budget spent \((\d+)\/(\d+) units\)$/
// 'F9 fuel commons: the clicks lied twice - nothing landed in the pocket (ghost clicks)'
export const COMMONS_GHOST_TWICE_RE = /^(\S+) fuel commons: the clicks lied twice - nothing landed in the pocket \(ghost clicks\)$/
// 'F9 fuel commons: no yard chest in range'
export const COMMONS_NOYARD_RE = /^(\S+) fuel commons: no yard chest in range$/

// ---- the sweep: the anatomy (never a terminal - the sweep continues) ----
// 'F3 fuel commons: chest at [-117,79,409] the yard stands 36 levels up over 4b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)'
export const COMMONS_DOOM_RE =
  /^(\S+) fuel commons: chest at \[([-0-9?,]+)\] the yard stands (\d+) levels up over (\d+)b lateral - the walk ladder cannot climb, the ask rides \(the tithe owns the deep resupply\)$/
// 'F9 fuel commons: chest holds no fuel'
// (v0.737.0) the located form - 'F2 fuel commons: chest holds no
// fuel at [-136,71,401]' (154 on the 52nd): the location rides the
// dry yard's own column
export const COMMONS_EMPTY_RE = /^(\S+) fuel commons: chest holds no fuel(?: at \[([^\]]+)\])?$/
// (v0.737.0) the last mile refused - 'F2 fuel commons: the last mile
// refused (raw walk timeout after 2000ms (d=6.7))' - the walk's
// last-mile class, its own anatomy; (v0.740.0) the captured tail's
// 'd=D.D' (or 'best d=D.D' - the no-net-progress class) rides the
// lastMileD column via LASTMILE_D_RE below (the same match - no new
// RE for the line shape)
export const COMMONS_LASTMILE_RE = /^(\S+) fuel commons: the last mile refused \((.+)\)$/
// (v0.740.0) the distance inside the already-captured last-mile tail:
// 'raw walk timeout after 2402ms (d=9.1)' -> 9.1; 'raw walk: no net
// progress for 8161ms (best d=4.3)' -> 4.3 (the BEST distance - how
// close the walk got before it starved). Internal - the line's own
// RE stays COMMONS_LASTMILE_RE (one parser per shape).
const LASTMILE_D_RE = /\bd=([\d.]+)/
// (v0.742.0) the clock inside the same already-captured tail: 'raw
// walk timeout after 2402ms' -> 2402; 'raw walk: no net progress for
// 8161ms' -> 8161; 'raw walk stalled after 1224ms' -> 1224 (the
// elapsed walk time the refusal threw away). Internal - one parser
// per shape (the line's own RE stays COMMONS_LASTMILE_RE).
const LASTMILE_MS_RE = /\b(?:after|for) (\d+)ms\b/
// (v0.737.0) the anchor scan that found no anchor - read OUTSIDE the
// sweep gate (no anchor = no sweep ever opened)
// 'F2 fuel commons: the anchor scan saw 2 chest(s), 0 usable after the empty memory - no anchor'
export const COMMONS_SCANS_SAW_RE = /^(\S+) fuel commons: the anchor scan saw (\d+) chest\(s\), (\d+) usable after the empty memory - no anchor$/
// (v0.737.0) the ask defers - the ask that never sent (the clock
// re-arms) - read OUTSIDE the sweep gate
// 'F2 fuel commons: the ask defers (this stance came up dry 4s ago - ...)'
export const COMMONS_ASK_DEFER_RE = /^(\S+) fuel commons: the ask defers \(this stance came up dry (\d+)s ago/
// 'F9 fuel commons: open failed (open fuel chest: timeout after 10000ms)'
// 'F9 fuel commons: open failed after the cover dig (timeout after 10000ms)'
export const COMMONS_OPENFAIL_RE = /^(\S+) fuel commons: open failed (?:after the cover dig )?\((.+)\)$/
// 'F9 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'
export const COMMONS_WALKFAIL_RE = /^(\S+) fuel commons: chest walk failed after the nudge \(([^)]+)\)$/
// 'F9 fuel commons: the nudge spent the walk slice (-462ms left) - no re-goto clock'
// 'F9 fuel commons: the re-segment spent the walk slice (340ms left) - the exclude owns the chest'
export const COMMONS_SPENT_SLICE_RE = /^(\S+) fuel commons: the (nudge|re-segment) spent the walk slice \((-?\d+)ms left\)/
// 'F9 fuel commons: the chest block vanished after the cover dig'
export const COMMONS_VANISHED_RE = /^(\S+) fuel commons: the chest block vanished after the cover dig$/
// 'F9 fuel commons: the cover dig stands down (not at the chest)'
export const COMMONS_COVER_DOWN_RE = /^(\S+) fuel commons: the cover dig stands down \(([^)]+)\)$/
// 'F9 fuel commons: the clicks lied (ghost clicks) - the window is still open, re-firing the same plan once'
export const COMMONS_GHOST_RETRY_RE = /^(\S+) fuel commons: the clicks lied \(ghost clicks\)/
// the two nudge lanes (the v0.355.0 envelope law / the v0.356.0 raw walker)
// 'F9 fuel commons: path nudge inside the direct envelope'
// 'F9 fuel commons: envelope re-segment nudge inside the direct envelope'
export const COMMONS_NUDGE_RE = /^(\S+) fuel commons: path nudge/
export const COMMONS_RESEGMENT_RE = /^(\S+) fuel commons: envelope re-segment/

// ---- the body count ----
// 'F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue 42s ago, leg fuel commons walk @-145,391, wet 3s@last)'
export const COMMONS_DEATH_RE = /^(\S+) \[\1\] death: .*leg fuel commons walk/

/**
 * The failed walk's why class head: 'Took to long to decide path to
 * goal!' stays whole; parenthesised detail is stripped the same way
 * the assistledger's whyClass reads (one habit, two lanes).
 * @param {string} why the raw why tail
 * @returns {string} the class head
 */
export function walkWhyClass (why) {
  const w = String(why ?? '').trim()
  return w.split(' (')[0].split(' [')[0].trim()
}

/**
 * (v0.737.0) The last-mile why's normalizer: the raw tails carry
 * live numbers ('raw walk timeout after 2000ms') - the class map
 * needs the digit-free shape ('raw walk timeout after Nms') or every
 * read owns its own private key. Digits (and their decimals) -> N.
 * @param {string} why the walked why class
 * @returns {string} the digit-free class
 */
export function normalizeWhy (why) {
  return String(why ?? '').replace(/\d+(?:\.\d+)?/g, 'N').trim()
}

function zeroBot () {
  return {
    asks: 0, askCoal: 0,
    rePlan: 0, stillDry: 0, cap: 0, reserve: 0, error: 0, askOpen: 0,
    sweeps: 0, laneTorch: 0, laneSmelt: 0,
    delivered: 0, units: 0, budgetSpent: 0, silentExhaust: 0, ghost: 0, noChest: 0,
    emptyChest: 0, openFail: 0, verticalDoom: 0, blockVanished: 0, walkFail: 0,
    nudges: 0, resegments: 0, spentSlice: 0, coverStandDown: 0, ghostRetry: 0,
    lastMile: 0, dryReads: 0,
    scanSaw: 0, scanSawSeen: 0, scanSawUsable: 0,
    askDefers: 0, maxDeferSpan: 0,
    deaths: 0,
    doomShapes: [], walkFailWhys: {}, dryChests: {}, lastMileWhys: {}, lastMileD: [], lastMileMs: []
  }
}

function zeroTotals () {
  const t = zeroBot()
  return t
}

/**
 * Read the fuel commons sweep's book - what the ask's machinery then
 * answered. Pure census: per-bot streams (the merged log interleaves
 * the fleet's lines; the commons grammar is the bot's own stream).
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{bots: Object<string,object>, totals: object, rows: object[]}}
 */
export function commonsLedger (lines) {
  if (!Array.isArray(lines)) return null
  const bots = {}
  const rows = []
  // per-bot state: the ask marker and the open sweep
  const state = new Map()
  const st = bot => {
    let s = state.get(bot)
    if (!s) {
      s = { askIdx: -1, askCoal: 0, sweep: null }
      state.set(bot, s)
    }
    return s
  }
  const bump = (bot, fn) => {
    const b = bots[bot] || (bots[bot] = zeroBot())
    fn(b)
    return b
  }
  const closeSweep = (bot, idx, forceCls) => {
    const s = st(bot)
    const sw = s.sweep
    if (!sw) return
    s.sweep = null
    const cls = forceCls || 'silentExhaust'
    bump(bot, b => {
      b.sweeps++
      b[cls]++
      b.units += sw.units
      b.laneTorch += sw.lane === 'torch' ? 1 : 0
      b.laneSmelt += sw.lane === 'smelt' ? 1 : 0
      for (const k of ['emptyChest', 'openFail', 'verticalDoom', 'blockVanished', 'walkFail', 'lastMile', 'dryReads', 'nudges', 'resegments', 'spentSlice', 'coverStandDown', 'ghostRetry']) {
        b[k] += sw.anatomy[k]
      }
      for (const sh of sw.doomShapes) b.doomShapes.push(sh)
      for (const [w, n] of Object.entries(sw.walkFailWhys)) b.walkFailWhys[w] = (b.walkFailWhys[w] ?? 0) + n
      for (const [loc, n] of Object.entries(sw.dryChests)) b.dryChests[loc] = (b.dryChests[loc] ?? 0) + n
      for (const [w, n] of Object.entries(sw.lastMileWhys)) b.lastMileWhys[w] = (b.lastMileWhys[w] ?? 0) + n
      for (const d of sw.lastMileD) b.lastMileD.push(d) // (v0.740.0) the reach's own distances ride per bot
      for (const ms of sw.lastMileMs) b.lastMileMs.push(ms) // (v0.742.0) the last mile's own clocks ride per bot
    })
    rows.push({ type: 'sweep', bot, idx, lane: sw.lane, cls, units: sw.units, ...sw.anatomy })
  }
  const closeAsk = (bot, idx, cls) => {
    const s = st(bot)
    if (s.askIdx < 0) return
    s.askIdx = -1
    bump(bot, b => { b[cls]++ })
    rows.push({ type: 'ask', bot, idx, cls })
  }
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    if (typeof line !== 'string') continue
    // ---- the ask (torchbook's own skin - one parser) ----
    let m = TORCH_RESUPPLY_RE.exec(line)
    if (m) {
      const bot = m[1]
      const s = st(bot)
      closeAsk(bot, idx, 'askOpen') // a serialized lane: never two pending
      s.askIdx = idx
      s.askCoal = Number(m[3])
      bump(bot, b => { b.asks++; b.askCoal += Number(m[3]) })
      continue
    }
    // ---- the body count ----
    m = COMMONS_DEATH_RE.exec(line)
    if (m) {
      bump(m[1], b => { b.deaths++ })
      rows.push({ type: 'death', bot: m[1], idx, cls: 'drownedOnTheWalk' })
      continue
    }
    // ---- (v0.737.0) the dry yard's own census - read OUTSIDE the
    // sweep gate (the death-row precedent): the scan that found no
    // anchor (no sweep ever opened) and the ask that never sent
    // (the clock re-arms) are their own classes, never sweep anatomy
    m = COMMONS_SCANS_SAW_RE.exec(line)
    if (m) {
      bump(m[1], b => { b.scanSaw++; b.scanSawSeen += Number(m[2]); b.scanSawUsable += Number(m[3]) })
      rows.push({ type: 'scan', bot: m[1], idx, seen: Number(m[2]), usable: Number(m[3]) })
      continue
    }
    m = COMMONS_ASK_DEFER_RE.exec(line)
    if (m) {
      bump(m[1], b => { b.askDefers++; b.maxDeferSpan = Math.max(b.maxDeferSpan, Number(m[2])) })
      rows.push({ type: 'defer', bot: m[1], idx, span: Number(m[2]) })
      continue
    }
    // ---- the sweep opener ----
    m = COMMONS_ANCHOR_RE.exec(line)
    if (m) {
      const bot = m[1]
      const s = st(bot)
      closeSweep(bot, idx, 'silentExhaust') // an unclosed sweep reads the honest exhaust
      const b = bump(bot, () => {})
      s.sweep = {
        lane: s.askIdx >= 0 ? 'torch' : 'smelt',
        units: 0,
        anatomy: {
          emptyChest: 0, openFail: 0, verticalDoom: 0, blockVanished: 0, walkFail: 0,
          nudges: 0, resegments: 0, spentSlice: 0, coverStandDown: 0, ghostRetry: 0,
          lastMile: 0, dryReads: 0
        },
        doomShapes: [],
        walkFailWhys: {},
        dryChests: {},
        lastMileWhys: {},
        lastMileD: [], // (v0.740.0) the refused walk's own distances (the raw walker's d=)
        lastMileMs: [] // (v0.742.0) the refused walk's own clocks (the elapsed ms the refusal threw away)
      }
      void b
      continue
    }
    // ---- the sweep's inside + verdicts: the bot must have an open sweep ----
    const isCommons = / fuel commons: /.test(line)
    if (!isCommons) {
      // THE INTERLEAVING-SAFE LAW: a non-commons line never ends a
      // sweep - the await's event-driven prose rides INSIDE the window
      // (the F19 law: the death context, the water mirror, the death
      // drop - then the nudge and the dry chests AFTER them).
      const t = /^(\S+) /.exec(line)
      // ---- the ask aftermath rides the torch lane's own verdicts ----
      if (t && state.get(t[1])) {
        const bot = t[1]
        const s = state.get(bot)
        if (s.askIdx >= 0) {
          if (TORCH_TERMINAL_RE.test(line)) closeAsk(bot, idx, 'rePlan')
          else if (TORCH_COAL_SKIP_RE.test(line)) closeAsk(bot, idx, 'stillDry')
          else if (TORCH_CAP_RE.test(line)) closeAsk(bot, idx, 'cap')
          else if (TORCH_RESERVE_RE.test(line)) closeAsk(bot, idx, 'reserve')
          else if (TORCH_ERROR_RE.test(line)) closeAsk(bot, idx, 'error')
        }
      }
      continue
    }
    m = /^(\S+) /.exec(line)
    if (!m) continue
    const bot = m[1]
    const s = st(bot)
    if (!s.sweep) continue // commons grammar outside a sweep: not ours to read
    // verdicts first (they close)
    let vm = COMMONS_TOOK_RE.exec(line)
    if (vm) {
      s.sweep.units += Number(vm[2])
      closeSweep(bot, idx, 'delivered')
      continue
    }
    vm = COMMONS_BUDGET_RE.exec(line)
    if (vm) { closeSweep(bot, idx, 'budgetSpent'); continue }
    vm = COMMONS_GHOST_TWICE_RE.exec(line)
    if (vm) { closeSweep(bot, idx, 'ghost'); continue }
    vm = COMMONS_NOYARD_RE.exec(line)
    if (vm) { closeSweep(bot, idx, 'noChest'); continue }
    // anatomy
    bump(bot, () => {})
    const a = s.sweep.anatomy
    vm = COMMONS_DOOM_RE.exec(line)
    if (vm) {
      a.verticalDoom++
      s.sweep.doomShapes.push(`${vm[3]}up/${vm[4]}lat`)
      continue
    }
    vm = COMMONS_EMPTY_RE.exec(line)
    if (vm) {
      a.emptyChest++
      // (v0.737.0) the located form rides the dry yard's own column
      if (vm[2]) {
        a.dryReads++
        s.sweep.dryChests[vm[2]] = (s.sweep.dryChests[vm[2]] ?? 0) + 1
      }
      continue
    }
    vm = COMMONS_LASTMILE_RE.exec(line)
    if (vm) {
      a.lastMile++
      const w = normalizeWhy(walkWhyClass(vm[2]))
      s.sweep.lastMileWhys[w] = (s.sweep.lastMileWhys[w] ?? 0) + 1
      // (v0.740.0) the reach's own radius - the distance the walk died
      // at rides the same match (the raw walker's d= / best d=); a bare
      // tail (the old faces' shape) adds nothing - the honest gap
      const dm = LASTMILE_D_RE.exec(vm[2])
      if (dm) s.sweep.lastMileD.push(Number(dm[1]))
      // (v0.742.0) the last mile's own clock - the elapsed ms the
      // refusal threw away rides the same match (after Nms / for Nms)
      const msm = LASTMILE_MS_RE.exec(vm[2])
      if (msm) s.sweep.lastMileMs.push(Number(msm[1]))
      continue
    }
    vm = COMMONS_OPENFAIL_RE.exec(line)
    if (vm) { a.openFail++; continue }
    vm = COMMONS_WALKFAIL_RE.exec(line)
    if (vm) {
      a.walkFail++
      const w = walkWhyClass(vm[2])
      s.sweep.walkFailWhys[w] = (s.sweep.walkFailWhys[w] ?? 0) + 1
      continue
    }
    vm = COMMONS_SPENT_SLICE_RE.exec(line)
    if (vm) { a.spentSlice++; continue }
    vm = COMMONS_VANISHED_RE.exec(line)
    if (vm) { a.blockVanished++; continue }
    vm = COMMONS_COVER_DOWN_RE.exec(line)
    if (vm) { a.coverStandDown++; continue }
    vm = COMMONS_GHOST_RETRY_RE.exec(line)
    if (vm) { a.ghostRetry++; continue }
    if (COMMONS_NUDGE_RE.test(line)) { a.nudges++; continue }
    if (COMMONS_RESEGMENT_RE.test(line)) { a.resegments++; continue }
  }
  // the tails: the honest open
  for (const [bot] of state) {
    closeSweep(bot, lines.length, 'silentExhaust')
    closeAsk(bot, lines.length, 'askOpen')
  }
  rows.sort((x, y) => x.idx - y.idx)
  // the totals
  const totals = zeroTotals()
  for (const b of Object.values(bots)) {
    for (const k of Object.keys(totals)) {
      if (Array.isArray(b[k])) continue
      if (k === 'maxDeferSpan') continue // a span sums to nothing - the max owns it
      if (typeof b[k] === 'number') totals[k] += b[k]
    }
    totals.maxDeferSpan = Math.max(totals.maxDeferSpan, b.maxDeferSpan)
    for (const sh of b.doomShapes) totals.doomShapes.push(sh)
    for (const [w, n] of Object.entries(b.walkFailWhys)) totals.walkFailWhys[w] = (totals.walkFailWhys[w] ?? 0) + n
    for (const [loc, n] of Object.entries(b.dryChests)) totals.dryChests[loc] = (totals.dryChests[loc] ?? 0) + n
    for (const [w, n] of Object.entries(b.lastMileWhys)) totals.lastMileWhys[w] = (totals.lastMileWhys[w] ?? 0) + n
    for (const d of b.lastMileD) totals.lastMileD.push(d) // (v0.740.0) the reach's own distances ride the totals
    for (const ms of b.lastMileMs) totals.lastMileMs.push(ms) // (v0.742.0) the last mile's own clocks ride the totals
  }
  return { bots, totals, rows }
}

// (v0.800.0) THE SWEEP BOOK'S OWN SEAT - WHICH close class owns the
// commons sweep book. The sweeps row prints the outcome split
// ('delivered 0 / budget-spent 23 / silent-exhaust 17 / ghost 2 ...' -
// face 85, 37698485347, the dry yard's face: 42 sweeps and no row ever
// said WHO owns the book, while the delivered counter named only the
// zero the drought drank). THE SEAT LAW (the census's own close counters
// only, zero re-parsing - the v0.784.0 kind-seat precedent, the
// v0.798.0 flee seat's own shape): the strict-majority law, a solo class
// owns the book only above half (a tie owns nothing); the book is the
// close counters' own sum (delivered + budgetSpent + silentExhaust +
// ghost + noChest); junk never invents a class (a missing or non-object
// ledger, a non-finite or non-positive counter, or a zero book reads
// the honest silence). The vocabulary is the census's own counter bytes:
// 'budgetSpent' < 'delivered' < 'ghost' < 'noChest' < 'silentExhaust'.
const SWEEP_BOOK_CELLS = [
  ['budgetSpent', 'budgetSpent'],
  ['delivered', 'delivered'],
  ['ghost', 'ghost'],
  ['noChest', 'noChest'],
  ['silentExhaust', 'silentExhaust']
]

function sweepBookTally (t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null
  const tallies = {}
  let total = 0
  for (const [cls, field] of SWEEP_BOOK_CELLS) {
    const n = t[field]
    if (!Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[cls] = (tallies[cls] || 0) + n
  }
  return total > 0 ? { tallies, total } : null
}

// (v0.800.0) the sweep seat's own bill - the strict-majority law's
// verdict: the top close class owns the book only above half; a tie
// owns nothing (the honest null - the mix needs the riders, not a
// named owner).
export function sweepBookSeat (t) {
  const tally = sweepBookTally(t)
  if (!tally) return null
  let topOwns = 0
  let topCls = null
  for (const [cls, n] of Object.entries(tally.tallies)) {
    if (n > topOwns) { topOwns = n; topCls = cls }
  }
  if (topCls === null || topOwns <= tally.total - topOwns) return null
  return { cls: topCls, owns: topOwns, ofSweeps: tally.total, shareOfSweeps: +(topOwns / tally.total).toFixed(3) }
}

// (v0.800.0) the sweep seat's own row - THE SWEEP'S OWN SEAT: one close
// class's own sweeps own the commons book (the drought's own meter).
// Junk never prints a row (the honest silence's own row law): every
// field is guarded before the template speaks.
export function sweepBookSeatRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { cls, owns, ofSweeps, shareOfSweeps } = bill
  if (typeof cls !== 'string' || !cls ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofSweeps) || ofSweeps <= 0 || owns > ofSweeps ||
      !Number.isFinite(shareOfSweeps)) return null
  return `the sweep book's own seat (v0.800.0): ${cls} owns ${owns} of ${ofSweeps} sweep(s) (${(shareOfSweeps * 100).toFixed(1)}%) - THE SWEEP'S OWN SEAT: one close class's own sweeps own the commons book - the class's own front prices the drought the raw split rode unnamed`
}

// (v0.800.0) THE SWEEP BOOK'S OWN RIDERS - the sweep seat's own
// silence's companion. The seat names the solo close class under the
// strict-majority law; a no-majority class mix rode raw with no row
// naming the shape. THE RIDER LAW (the census's own close counters
// only, zero re-parsing - the seat's own precedent): a MEASURE, never a
// verdict-owner - the top two classes' concentration prices the shape
// the solo law refused to name (the seat's owner case leaves the
// companion unprinted - the decompose's own branch law). Junk never
// invents a shape: a missing or non-object ledger, a non-finite
// counter, or fewer than two counted classes reads the honest silence
// (null). The order is deterministic (count desc, then the class's own
// byte: the name's own lexicographic law - 'budgetSpent' < 'delivered').
export function sweepBookRiders (t) {
  const tally = sweepBookTally(t)
  if (!tally) return null
  const ranked = Object.entries(tally.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofSweeps: tally.total, pairOwns, shareOfSweeps: +(pairOwns / tally.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.800.0) the sweep riders' own row - THE SWEEP'S OWN MIX: a measure
// of the shape, never a named owner (the seat's tie law holds); the
// pair prices the concentration the solo law refused to seat. Junk
// never prints a shape (the honest silence's own row law).
export function sweepBookRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofSweeps, pairOwns, shareOfSweeps } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofSweeps) || ofSweeps <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofSweeps ||
      !Number.isFinite(shareOfSweeps)) return null
  return `the sweep book's own riders (v0.800.0): no solo class owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofSweeps} sweep(s) (${(shareOfSweeps * 100).toFixed(1)}%) - THE SWEEP'S OWN MIX: the seat's tie law held, the mix is the shape - the classes' own spread prices the drought the solo law refused to seat`
}
