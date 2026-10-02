//
// pouncebook.mjs - THE POUNCE BOOK (v0.498.0)
// The well pounce's own field book: the decline probe's signature
// anatomy and the pounce attempt verdicts. The pounce lane lives in
// src/bots/miner.mjs (v0.311.0 the well pounce; v0.313.0 the probe on
// its own evidence budget): before the ladder spends its A* and its
// digs, the 8/10 well signature (support=solid step=air head=air) gets
// the pathfinder's jump-edge trick by hand - back off the face press,
// then forward+jump the long hold. The landed / did-not-rise verdicts
// speak for the attempts; when the well signature does NOT hold, the
// probe names the three cell reads ('the signature declined
// (support=..., step=..., head=...)') once per climb, and when the
// GUARD refuses the attempt outright it names the reason ('the guard
// declined (wet feet|the cap spent)').
//
// THE HAND-AWAY (fire-0038's open window, fire-0100 re-named): the
// climbout book explicitly scopes these lines OUT ('the climb
// bridge/diag/pounce probe lines are miner.mjs's internal
// per-attempt detail - a DIFFERENT emitter, out of this lens's
// scope, one parser per emitter'); ~54 rows across faces 42+43 had
// zero readers. THE POUNCE PROBE'S DECLINE BOOK is that reader.
//
// THE WIRE: a pure census - every climb pounce line classifies
// independently (no opener, no cross-line join - the armory's honest
// scope law). The emitter speaks four skins:
//   the probe's signature decline: 'the signature declined
//   (support=X, step=Y, head=Z) - the well census continues' - the
//   anatomy read: THE FLOATING CLASS (air/air/air - the probe
//   pressed a mid-air triple), support=air leftovers (the step's
//   block is the only thing there), THE LAWN SIGNATURE
//   (dirt/grass_block - the dominant face), the stone class
//   (stone/stone), the head-blocked row (head != air - the canopy
//   exception, the only non-air head at n=2), the honest other;
//   the pairs anatomy (support/step) captured per row - the deeper
//   capture, the smelthold twin precedent;
//   the guard decline: '(wet feet)' (the wet levels keep the
//   longHold lane) or '(the cap spent)' (both pounces used) - the
//   cap-spent class kept at zero field rows, honest;
//   the stall verdict: 'did not rise (back At + jump Bt toward
//   X,Z) - the assist ladder owns it' - the ticks invariant (4t/24t,
//   CLIMB_POUNCE_BACK_TICKS/CLIMB_POUNCE_JUMP_TICKS) pinned, a
//   deviating row lands in the honest other-ticks bucket; the
//   toward bearing captured (the climb direction at the press);
//   the landed verdict: 'landed y=N (...)' - the success voice, zero
//   field rows at n=2 (the cap-2 lane never landed on these faces),
//   class kept.
//
// THE FIELD READ (faces 42+43, hand-traced then live-verified byte
// for byte): 54 events - 46 signature declines (THE LAWN SIGNATURE
// 20/46 = 43% dominant, the floating all-air class 8, support=air
// leftovers 4, stone/stone 5, the canopy head-block 1, other 8),
// 5 guard declines (ALL wet feet - the cap never spent), 3 stalls
// (the 4t/24t plan held, zero landed). The probe's three-cell read
// is honest everywhere: head=air in 45/46 rows - the decline is
// always support/step shaped; the head only ever blocks under a
// leaf-litter canopy.
//
// Pure parser, unit-pinned (the tablegate v0.495.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new
// log lines - the v0.379.0 precedent. Junk-safe end to end:
// non-string rows skipped, a face with no pounce lines reads the
// honest zero.
//

// The plan constants (src/lib/surface.mjs) - the stall/landed ticks
// invariant: a row deviating from these lands in the honest
// other-ticks bucket (the plan was hand-called with overrides once;
// the book prices the field, not the constants).
export const POUNCE_PLAN_BACK_TICKS = 4
export const POUNCE_PLAN_JUMP_TICKS = 24

// ---- the probe's signature decline ----
// 'F14 [F14] climb pounce probe: the signature declined (support=air, step=oak_leaves, head=air) - the well census continues'
// The three cell reads: block name or 'null' (the emitter's pname
// fallback - a null chunk read is a read too).
export const POUNCE_SIGNATURE_RE =
  /^(\S+) \[\1\] climb pounce probe: the signature declined \(support=([a-z0-9_]+|null), step=([a-z0-9_]+|null), head=([a-z0-9_]+|null)\) - the well census continues$/

// ---- the guard decline ----
// 'F16 [F16] climb pounce probe: the guard declined (wet feet) - the ladder owns the level'
export const POUNCE_GUARD_RE =
  /^(\S+) \[\1\] climb pounce probe: the guard declined \((the cap spent|wet feet)\) - the ladder owns the level$/

// ---- the stall verdict ----
// 'F18 [F18] climb pounce: did not rise (back 4t + jump 24t toward -1,0) - the assist ladder owns it'
export const POUNCE_STALL_RE =
  /^(\S+) \[\1\] climb pounce: did not rise \(back (\d+)t \+ jump (\d+)t toward (-?\d+),(-?\d+)\) - the assist ladder owns it$/

// ---- the landed verdict ----
// 'F18 [F18] climb pounce: landed y=71 (back 4t + jump 24t toward 1,0) - the well geometry broken'
// (zero field rows at n=2 - the class kept)
export const POUNCE_LANDED_RE =
  /^(\S+) \[\1\] climb pounce: landed y=(-?\d+) \(back (\d+)t \+ jump (\d+)t toward (-?\d+),(-?\d+)\) - the well geometry broken$/

/**
 * Classify a signature decline's three-cell read into the field
 * classes. Order matters: floating first (all air), then the head
 * block (the canopy exception), then the support=air leftover, then
 * the lawn, the stone, the honest other.
 * @param {string} support the support cell's block name (or 'null')
 * @param {string} step the step cell's block name (or 'null')
 * @param {string} head the head cell's block name (or 'null')
 * @returns {string} floating | head-blocked | support-air | lawn | stone | other
 */
export function classifySignature (support, step, head) {
  const s = String(support ?? '')
  const t = String(step ?? '')
  const h = String(head ?? '')
  if (s === 'air' && t === 'air' && h === 'air') return 'floating'
  if (h !== 'air') return 'head-blocked'
  if (s === 'air') return 'support-air'
  if (s === 'dirt' && t === 'grass_block') return 'lawn'
  if (s === 'stone' && t === 'stone') return 'stone'
  return 'other'
}

function zeroBot () {
  return {
    signature: 0,
    floating: 0, headBlocked: 0, supportAir: 0, lawn: 0, stone: 0, sigOther: 0,
    guardWet: 0, guardCap: 0,
    stalls: 0, stallOtherTicks: 0, landed: 0, landedOtherTicks: 0,
    total: 0
  }
}

function zeroTotals () {
  const t = zeroBot()
  t.pairs = {}
  t.stallBearings = {}
  t.landedBearings = {}
  t.bots = {}
  return t
}

function bump (map, key) {
  if (key == null) return
  map[key] = (map[key] ?? 0) + 1
}

/**
 * Read the well pounce's field book - the probe's signature anatomy,
 * the guard's refusals and the attempt verdicts. Pure census: no
 * cross-line join, no opener required; every line classifies
 * independently.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {{bots: Object<string, object>, totals: object}|null}
 *   null for a junk input (non-array); a face with no pounce lines
 *   reads the honest zero (empty bots, zeroed totals).
 */
export function pounceBook (lines) {
  if (!Array.isArray(lines)) return null
  const bots = {}
  const totals = zeroTotals()
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const sig = POUNCE_SIGNATURE_RE.exec(line)
    if (sig) {
      const bot = sig[1]
      const support = sig[2]
      const step = sig[3]
      const head = sig[4]
      const cls = classifySignature(support, step, head)
      const b = bots[bot] ?? (bots[bot] = zeroBot())
      b.signature++
      if (cls === 'floating') b.floating++
      else if (cls === 'head-blocked') b.headBlocked++
      else if (cls === 'support-air') b.supportAir++
      else if (cls === 'lawn') b.lawn++
      else if (cls === 'stone') b.stone++
      else b.sigOther++
      b.total++
      bump(totals.pairs, `${support}/${step}`)
      continue
    }
    const guard = POUNCE_GUARD_RE.exec(line)
    if (guard) {
      const bot = guard[1]
      const b = bots[bot] ?? (bots[bot] = zeroBot())
      if (guard[2] === 'wet feet') b.guardWet++
      else b.guardCap++
      b.total++
      continue
    }
    const stall = POUNCE_STALL_RE.exec(line)
    if (stall) {
      const bot = stall[1]
      const b = bots[bot] ?? (bots[bot] = zeroBot())
      const back = Number(stall[2])
      const jump = Number(stall[3])
      if (back === POUNCE_PLAN_BACK_TICKS && jump === POUNCE_PLAN_JUMP_TICKS) {
        b.stalls++
        bump(totals.stallBearings, `${stall[4]},${stall[5]}`)
      } else {
        b.stallOtherTicks++
      }
      b.total++
      continue
    }
    const landed = POUNCE_LANDED_RE.exec(line)
    if (landed) {
      const bot = landed[1]
      const b = bots[bot] ?? (bots[bot] = zeroBot())
      const back = Number(landed[3])
      const jump = Number(landed[4])
      if (back === POUNCE_PLAN_BACK_TICKS && jump === POUNCE_PLAN_JUMP_TICKS) {
        b.landed++
        bump(totals.landedBearings, `${landed[5]},${landed[6]}`)
      } else {
        b.landedOtherTicks++
      }
      b.total++
    }
  }
  for (const b of Object.values(bots)) {
    totals.signature += b.signature
    totals.floating += b.floating
    totals.headBlocked += b.headBlocked
    totals.supportAir += b.supportAir
    totals.lawn += b.lawn
    totals.stone += b.stone
    totals.sigOther += b.sigOther
    totals.guardWet += b.guardWet
    totals.guardCap += b.guardCap
    totals.stalls += b.stalls
    totals.stallOtherTicks += b.stallOtherTicks
    totals.landed += b.landed
    totals.landedOtherTicks += b.landedOtherTicks
    totals.total += b.total
    totals.bots[b.total] = (totals.bots[b.total] ?? 0) + 1
  }
  return { bots, totals }
}
