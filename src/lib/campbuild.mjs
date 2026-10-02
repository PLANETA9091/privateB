import { timeoutMs } from './tablegate.mjs'

//
// campbuild.mjs - THE CAMP BUILD BOOK (v0.497.0)
// Where furnaces come from. The camp furnace ladder (src/bots/tools.mjs
// since v0.89.0 - the iron wall's cure: 8 cobble + a table = a furnace
// anywhere) is machinery-pinned (tests/unit/camp-furnace.test.mjs pins
// the pure ladder and the early exits), but the FIELD FATE of its own
// emitter skins ('F4 camp furnace: BUILT ... in 6s' 1 verbatim, 'no
// build (...)' 43, the plank-craft deaths, the craft storm) had zero
// readers: the smelt chain's yield side is priced (the smelt verdict's
// stick tax, the hold ledger's furnace-door refusals) - the BUILD side,
// the furnace supply itself, was the unread half.
//
// THE WIRE: a pure census - every camp furnace line classifies
// independently (no opener, no cross-line join - the armory's honest
// scope law). The emitter (fleet19.mjs build-skipped/BUILT/no-build +
// tools.mjs ensureCampFurnace's own step logs) speaks:
//   the terminal: 'BUILT (furnace at x,y,z) in Ns' (the build landed);
//   the refusals: 'no build (<why>)' - machine near (the REUSE class:
//   the fleet's furnaces persist and are found), 'cobble N/8' (the
//   resource floor), 'plank craft failed' (the machinery death), the
//   ladder's 'nothing to smelt' (zero field rows at n=2, class kept),
//   the honest other;
//   the table-first order leg: 'craft-table (N cobble + N planks -
//   table first)';
//   the plank-craft decision: 'craft-planks (N log(s) in pocket -
//   craft planks (largest same-type stack A/B))' - A/B is the
//   SAME-TYPE FLOOR read, the table gate's 4-of-one-type commodity
//   law echoed in the furnace lane;
//   the plank-craft attempt anatomy (the 7s machinery, the table
//   gate's twin): 'craft <item>: variant#V attemptA failed: <why>'
//   (the WIDE greedy why, 'timeout after Nms' priced via the
//   tablegate's tail-anchored read - one helper, one truth), the
//   all-variants verdict;
//   the craft-storm firing: 'craft storm: N consecutive craft
//   timeouts - cooldown Nms (server stall?)' - the cooldown FIRING
//   skin (the stormrefusal/memhb pair owns the 'storm cooldown ...
//   - refusing' skin only; this one never cross-matches);
//   the stale windows: the [tools] grid recovery - scoped SAFE here
//   by the 'camp furnace:' prefix itself (the table gate had to drop
//   this skin; the prefix does the scoping).
//
// THE FIELD READ (faces 42+43, hand-traced then live-verified byte for
// byte): 57 events - ONE build in two faces (F4, 6s, the table-first
// order with 118 cobble in pocket) against 41 machine-near reusals -
// THE FOUNDRY IS ALREADY BUILT: the camp ladder's field fate is reuse,
// not building. The plank death: F15's two episodes - the mixed-wood
// pocket (largest same-type stack 1/4 twice, 3 logs then 2 logs), the
// 7s machinery ate 21s + a 4s craft-storm cooldown, zero builds. The
// cobble floor: F10's 4/8. A new camp on a mixed-wood pocket dies at
// the plank craft - the furnace supply's own fragile leg, priced.
//
// Pure parser, unit-pinned (the tablegate v0.495.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new
// log lines. Junk-safe end to end: non-string rows skipped, a face
// with no camp furnace lines reads the honest zero.
//

// ---- the terminal ----
// 'F4 camp furnace: BUILT (furnace at -140,46,452) in 6s'
export const CAMP_BUILT_RE =
  /^(F\d+) camp furnace: BUILT \(furnace at (-?\d+),(-?\d+),(-?\d+)\) in (\d+)s$/

// ---- the refusals ----
// The WIDE greedy why capture (the smelthold v0.491.0 lesson); the
// caller classifies.
export const CAMP_NOBUILD_RE = /^(F\d+) camp furnace: no build \((.+)\)$/

// ---- the legs ----
// 'F4 camp furnace: craft-table (118 cobble + 4 planks - table first)'
export const CAMP_TABLE_FIRST_RE =
  /^(F\d+) camp furnace: craft-table \((\d+) cobble \+ (\d+) planks - table first\)$/
// 'F15 camp furnace: craft-planks (3 log(s) in pocket - craft planks (largest same-type stack 1/4))'
export const CAMP_PLANKS_RE =
  /^(F\d+) camp furnace: craft-planks \((\d+) log\(s\) in pocket - craft planks \(largest same-type stack (\d+)\/(\d+)\)\)$/
// 'F9 camp furnace: build skipped - the leg clock (30s) cannot afford a 24s smelt build + the 4s put (furnace)'
// (the fleet19.mjs leg-clock template; zero field rows at n=2)
export const CAMP_SKIPPED_RE =
  /^(F\d+) camp furnace: build skipped - the leg clock \((\d+)s\) cannot afford a (\d+)s ([a-z_]+) build \+ the (\d+)s put \((.+)\)$/
// The [upgrade] machinery's attempt anatomy.
export const CAMP_ATTEMPT_RE =
  /^(F\d+) camp furnace: craft ([a-z_]+): variant#(\d+) attempt(\d+) failed: (.+)$/
export const CAMP_ALLFAIL_RE =
  /^(F\d+) camp furnace: craft ([a-z_]+): all (\d+) variant\(s\) failed, last: (.+)$/
// The craft-storm FIRING skin (the refusing skin belongs to
// memhb/stormrefusal - never cross-matched here).
export const CAMP_STORM_RE =
  /^(F\d+) camp furnace: craft storm: (\d+) consecutive craft timeouts - cooldown (\d+)ms \(server stall\?\)$/
// The stale-window grid recovery (the prefix scopes it to this lane).
export const CAMP_GRID_RE =
  /^(F\d+) camp furnace: \[tools\] closing stale craft window \(minecraft:inventory\) - grid recovery$/

/**
 * Classify a 'no build' why into the field classes.
 * @param {string} why the captured why tail
 * @returns {{cls: string, cobbleHave?: number, cobbleNeed?: number}}
 */
export function noBuildClass (why) {
  const w = String(why ?? '').trim()
  if (w === 'machine near') return { cls: 'reuse' }
  const c = /^cobble (\d+)\/(\d+)$/.exec(w)
  if (c) return { cls: 'cobble-floor', cobbleHave: Number(c[1]), cobbleNeed: Number(c[2]) }
  if (w === 'plank craft failed') return { cls: 'plank-death' }
  if (w === 'nothing to smelt') return { cls: 'nothing-to-smelt' }
  return { cls: 'other' }
}

function zeroBot () {
  return {
    built: 0, buildSecs: 0,
    reuse: 0, cobbleFloor: 0, plankDeath: 0, nothingToSmelt: 0, otherRefusals: 0,
    tableFirst: 0, planksDecisions: 0, planksLogs: 0, sameTypeShort: 0,
    attempts: 0, timeoutMs: 0, otherAttempts: 0, allFails: 0,
    storms: 0, stormCooldownMs: 0, grid: 0, skipped: 0
  }
}

function zeroTotals () {
  const t = zeroBot()
  t.buildBots = {}
  t.total = 0
  return t
}

/**
 * Read the camp furnace build lane's field fate - the builds, the
 * reuse, the resource floors and the plank-craft deaths. Pure census:
 * no cross-line join, no opener required.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{bots: Object<string,object>, totals: object}}
 */
export function campBuild (lines) {
  if (!Array.isArray(lines)) return null
  const bots = {}
  const totals = zeroTotals()
  const bump = (bot, fn) => {
    const b = bots[bot] || (bots[bot] = zeroBot())
    fn(b)
  }
  for (const line of lines) {
    if (typeof line !== 'string') continue
    let m = CAMP_BUILT_RE.exec(line)
    if (m) {
      const secs = Number(m[5])
      bump(m[1], b => { b.built++; b.buildSecs += secs })
      totals.built++
      totals.buildSecs += secs
      totals.buildBots[m[1]] = (totals.buildBots[m[1]] || 0) + 1
      continue
    }
    m = CAMP_NOBUILD_RE.exec(line)
    if (m) {
      const { cls, cobbleHave } = noBuildClass(m[2])
      bump(m[1], b => {
        if (cls === 'reuse') b.reuse++
        else if (cls === 'cobble-floor') b.cobbleFloor++
        else if (cls === 'plank-death') b.plankDeath++
        else if (cls === 'nothing-to-smelt') b.nothingToSmelt++
        else b.otherRefusals++
      })
      if (cls === 'reuse') totals.reuse++
      else if (cls === 'cobble-floor') totals.cobbleFloor++
      else if (cls === 'plank-death') totals.plankDeath++
      else if (cls === 'nothing-to-smelt') totals.nothingToSmelt++
      else totals.otherRefusals++
      continue
    }
    m = CAMP_TABLE_FIRST_RE.exec(line)
    if (m) {
      bump(m[1], b => { b.tableFirst++ })
      totals.tableFirst++
      continue
    }
    m = CAMP_PLANKS_RE.exec(line)
    if (m) {
      const logs = Number(m[2])
      const largest = Number(m[3])
      const need = Number(m[4])
      bump(m[1], b => { b.planksDecisions++; b.planksLogs += logs; if (largest < need) b.sameTypeShort++ })
      totals.planksDecisions++
      totals.planksLogs += logs
      if (largest < need) totals.sameTypeShort++
      continue
    }
    m = CAMP_SKIPPED_RE.exec(line)
    if (m) {
      bump(m[1], b => { b.skipped++ })
      totals.skipped++
      continue
    }
    m = CAMP_ATTEMPT_RE.exec(line)
    if (m) {
      const ms = timeoutMs(m[5])
      bump(m[1], b => {
        b.attempts++
        if (ms > 0) b.timeoutMs += ms
        else b.otherAttempts++
      })
      totals.attempts++
      if (ms > 0) totals.timeoutMs += ms
      else totals.otherAttempts++
      continue
    }
    m = CAMP_ALLFAIL_RE.exec(line)
    if (m) {
      bump(m[1], b => { b.allFails++ })
      totals.allFails++
      continue
    }
    m = CAMP_STORM_RE.exec(line)
    if (m) {
      const ms = Number(m[3])
      bump(m[1], b => { b.storms++; b.stormCooldownMs += ms })
      totals.storms++
      totals.stormCooldownMs += ms
      continue
    }
    m = CAMP_GRID_RE.exec(line)
    if (m) {
      bump(m[1], b => { b.grid++ })
      totals.grid++
    }
  }
  totals.total = totals.built + totals.reuse + totals.cobbleFloor +
    totals.plankDeath + totals.nothingToSmelt + totals.otherRefusals +
    totals.tableFirst + totals.planksDecisions + totals.skipped +
    totals.attempts + totals.allFails + totals.storms + totals.grid
  return { bots, totals }
}
