//
// fightledger.mjs - THE FIGHT COST LEDGER (v0.486.0)
// v0.488.0 - THE VICTOR'S TAIL: the win's own aftermath. The cost
// anatomy prices the fight; the tail prices what the WIN bought - each
// mob-down row joins the bot's next boundary line (the same close
// vocabulary, one boundary law): the critical bar first = DRAINED (the
// winner crossed into the drain zone right after winning - the
// critical bar IS the emitter's own sensor, no threshold re-derived
// here), and the drain's own flight (the bot's next fleeing line)
// prices the victory drain (exit hp -> flight hp); fleeing first =
// FLED, fighting first = RE-ENGAGED, sheltering first = SHELTERED,
// died first = DIED-AFTER (won the fight, died anyway), a terminus
// without a seen start = CHAINED (the truncation edge), nothing before
// the window ends = QUIET (the honest tail). The exit zones split the
// wins against the policy's own FLEE line (imported - one truth never
// forked): the fight lane never ENDS a fight below it on the stored
// faces (0/16) - the drain arrives in the tail prose instead.
//
// The stand-and-fight lane's own episode book. The combat lane's lenses
// each read a different window of the same story: the shelter ledger
// (v0.457.0) reads HOW a death happened, the flee ledger (v0.481.0)
// reads the ESCAPE start's terminus, the verdict-execution lens
// (v0.485.0) reads the flee DECISION's fate, the hound census reads the
// drowned fights only. Nobody ever priced the FIGHT episode itself:
// the 'combat: fighting <mob> (dist D, hp H, N nearby, <reason>)' start
// joined to its own terminus - the emitter prints the win's full cost
// anatomy byte for byte ('combat: fight ended vs <mob> (EXIT, hp A ->
// B, swings N, weapon W, R rounds)') and no reader ever counted it.
// Twenty fight-ended lines across faces 42+43, one skin, fully
// unpriced. This ledger walks the lines once and pairs every fight
// start with the bot's next boundary line - THE FLEELEDGER'S OWN CLOSE
// VOCABULARY (one boundary law across the lane's lenses):
//
//   fight-ended    - the fight's own terminus: the exit token names the
//                    class (mob down / deadline / chase ceiling / verdict
//                    ignore), the hp pair prices the COST (before -
//                    after; a NEGATIVE cost is the regen outpacing the
//                    grind - the slog signature), swings/weapon/rounds
//                    ride along (the pickaxe tax's own ruler).
//   fleeing        - ABANDONED: the fight yielded to the escape (the
//                    verdict flipped mid-fight and the bot flew); the
//                    closing flee line's own hp is the abandon price,
//                    the mob token's mismatch is the threat-change flag.
//   sheltering     - SHELTERED: the wall answers the fight first (the
//                    same takeover the verdict book read named).
//   died           - DIED: the fight ran out (the death's own witness
//                    closes; the kind recorded, the authority law).
//   a second fighting line - the fresh fight wins, the stale one closes
//                    honestly unresolved (the window's own boundary).
//   nothing before the window ends - OPEN (the truncation-blind leg).
//
// The machinery prose between the start and its terminus never closes:
// the verdict flip, the pair preempt, the shelter try/skip/wall
// miss/ring try, the flee ladder/kite/shore/bearing, the open-field
// yield, the critical bar, the drift wait - all the same never-close
// law the flee ledger pinned.
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); zero starts read the honest zero shape. Pure: reads,
// never mutates.
//
import { DIED_KIND_RE } from './maptrip.mjs'
import { parseCombatLine } from './shootercensus.mjs'
import { FLEE_HP } from './combat.mjs'

// the fight start's full data shape (the emitter's own body, byte-
// verified live on faces 42/43: the reason is free text to the paren)
export const FIGHTING_RE = /combat: fighting ([a-z_]+) \(dist (\d+(?:\.\d+)?), hp (\d+(?:\.\d+)?), (\d+) nearby, ([^)]*)\)/

// the fight-ended terminus's full anatomy (the emitter's own body): the
// exit token to the first comma ('mob down' / 'deadline' / 'chase
// ceiling' / 'verdict ignore'), the hp pair, the swings, the weapon,
// the rounds
export const FIGHT_END_RE = /combat: fight ended vs ([a-z_]+) \(([^,)]+), hp (\d+(?:\.\d+)?) -> (\d+(?:\.\d+)?), swings (\d+), weapon ([a-z_]+), (\d+) rounds\)/

// the fleeing close's own data shape (the abandon price rides the
// flee line's own hp - the FLEELEDGER'S OWN RE, one truth never
// forked; the mob captured with the FULL token vocab - the census
// parser's 5-name attacker list reads zombie_villager-class mobs as
// null, and the threat-change flag must not go blind on the name)
const FLEE_HP_RE = /combat: fleeing ([a-z_]+) \(dist \d+(?:\.\d+)?, hp (\d+(?:\.\d+)?)/

// the sheltering close's own mob shape (the same full-vocab law - the
// wall's takeover names the threat it answered)
const SHELTERING_MOB_RE = /combat: sheltering from ([a-z_]+)/

const round1 = n => Math.round(n * 10) / 10

/**
 * fightLedger(lines) - the fight lane's own episode book.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{starts: number, mobDown: number, deadline: number,
 *   chaseCeiling: number, verdictIgnore: number, abandoned: number,
 *   sheltered: number, died: number, open: number, costs: {min, median,
 *   max}|null, freeWins: number, slog: {maxRounds: number|null,
 *   bot: string|null, mob: string|null, weapon: string|null},
 *   weapons: Object<string, number>, perBot: Object<string, number>,
 *   tails: {drained: number, fled: number, 're-engaged': number,
 *   sheltered: number, 'died-after': number, chained: number, quiet: number},
 *   drainFlights: number, exitZones: {belowFlee: number, atOrAbove:
 *   number, fleeLine: number}, rows: object[]}}
 */
export function fightLedger (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const lanes = new Map()
  const rows = []
  const close = (ep, outcome, closerIdx, extra) => {
    const row = {
      bot: ep.bot, mob: ep.mob, dist: ep.dist, hp: ep.hp,
      nearby: ep.nearby, reason: ep.reason, idx: ep.idx,
      outcome, closerIdx: closerIdx ?? null,
      endMob: null, cost: null, swings: null, weapon: null, rounds: null,
      endHp: null,
      closeHp: null, threatChanged: null, deathKind: null,
      tailClass: null, tailGap: null, tailFleeHp: null, tailDrain: null
    }
    if (extra) Object.assign(row, extra)
    rows.push(row)
    ep.closed = true
  }
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (typeof line !== 'string') continue
    // the died line - it closes the bot's open fight (any kind; the
    // kind recorded, the authority law)
    const km = line.match(DIED_KIND_RE)
    if (km) {
      const st = lanes.get(km[1])
      if (st && st.open && !st.open.closed) {
        close(st.open, 'died', i, { deathKind: km[2] })
      }
      continue
    }
    const cm = parseCombatLine(line)
    if (!cm || !cm.bot) continue
    if (cm.verb === 'fighting') {
      const st = lanes.get(cm.bot) || { open: null }
      lanes.set(cm.bot, st)
      // the fresh fight wins - the stale one closes honestly unresolved
      if (st.open && !st.open.closed) close(st.open, 'open', i)
      const fm = line.match(FIGHTING_RE)
      if (fm) {
        st.open = {
          bot: cm.bot, mob: fm[1], dist: Number(fm[2]), hp: Number(fm[3]),
          nearby: Number(fm[4]), reason: fm[5], idx: i, closed: false
        }
      } else {
        // the truncation window - the verb spoke, the body did not
        // survive (the FATAL face truncation's own shape): the fight
        // opens data-blind, the cost reads unpriced
        st.open = {
          bot: cm.bot, mob: null, dist: null, hp: null,
          nearby: null, reason: null, idx: i, closed: false
        }
      }
    } else if (cm.verb === 'fight-ended') {
      const st = lanes.get(cm.bot)
      if (st && st.open && !st.open.closed) {
        const em = line.match(FIGHT_END_RE)
        if (em) {
          const before = Number(em[3])
          const after = Number(em[4])
          const exit = em[2]
          const outcome = exit === 'mob down' ? 'mob-down'
            : exit === 'chase ceiling' ? 'chase-ceiling'
              : exit === 'verdict ignore' ? 'verdict-ignore'
                : exit
          close(st.open, outcome, i, {
            endMob: em[1], cost: round1(before - after), endHp: after,
            swings: Number(em[5]), weapon: em[6], rounds: Number(em[7])
          })
        } else {
          // the truncation window - the terminus spoke, its anatomy
          // did not survive: the fight closes on the class the verb
          // names, the cost reads honestly unpriced
          close(st.open, 'open', i)
        }
      }
    } else if (cm.verb === 'fleeing') {
      const st = lanes.get(cm.bot)
      if (st && st.open && !st.open.closed) {
        const fh = line.match(FLEE_HP_RE)
        const closeMob = fh ? fh[1] : null
        close(st.open, 'abandoned', i, {
          closeHp: fh ? Number(fh[2]) : null,
          closeMob,
          threatChanged: !!(closeMob && st.open.mob && closeMob !== st.open.mob)
        })
      }
    } else if (cm.verb === 'sheltering') {
      const st = lanes.get(cm.bot)
      if (st && st.open && !st.open.closed) {
        const sm = line.match(SHELTERING_MOB_RE)
        const closeMob = sm ? sm[1] : null
        close(st.open, 'sheltered', i, {
          closeMob,
          threatChanged: !!(closeMob && st.open.mob && closeMob !== st.open.mob)
        })
      }
    }
    // every other combat verb: the fights' own machinery prose -
    // never closes, never opens
  }
  for (const st of lanes.values()) {
    if (st.open && !st.open.closed) close(st.open, 'open', null)
  }
  // the book
  const tally = {
    starts: rows.length, 'mob-down': 0, deadline: 0, 'chase-ceiling': 0,
    'verdict-ignore': 0, abandoned: 0, sheltered: 0, died: 0, open: 0
  }
  for (const r of rows) tally[r.outcome]++
  // the wins' cost book (mob-down closes only - the fight's own price)
  const costArr = rows.filter(r => r.outcome === 'mob-down' && r.cost !== null).map(r => r.cost)
  costArr.sort((a, b) => a - b)
  const median = costArr.length
    ? (costArr.length % 2 ? costArr[(costArr.length - 1) / 2] : (costArr[costArr.length / 2 - 1] + costArr[costArr.length / 2]) / 2)
    : null
  const costs = costArr.length
    ? { min: costArr[0], median, max: costArr[costArr.length - 1] }
    : null
  const freeWins = costArr.filter(c => c === 0).length
  // the slog read: the longest fight, the bot and the weapon that ran it
  // (the pickaxe tax's own ruler - the rounds field prices the TIME the
  // hp cost hides)
  let slogRow = null
  for (const r of rows) {
    if (r.rounds !== null && (!slogRow || r.rounds > slogRow.rounds)) slogRow = r
  }
  const slog = slogRow
    ? { maxRounds: slogRow.rounds, bot: slogRow.bot, mob: slogRow.mob, weapon: slogRow.weapon }
    : { maxRounds: null, bot: null, mob: null, weapon: null }
  // the weapon census (the fight-ended closes only)
  const weapons = {}
  const perBot = {}
  for (const r of rows) {
    if (r.weapon) weapons[r.weapon] = (weapons[r.weapon] || 0) + 1
    perBot[r.bot] = (perBot[r.bot] || 0) + 1
  }
  // (v0.488.0) THE VICTOR'S TAIL - each mob-down row joins the bot's
  // next boundary line (the same close vocabulary, one boundary law);
  // the drained tail keeps scanning for the drain's own flight (the
  // bot's next fleeing line prices the victory drain: exit -> flight)
  const tails = { drained: 0, fled: 0, 're-engaged': 0, sheltered: 0, 'died-after': 0, chained: 0, quiet: 0 }
  let drainFlights = 0
  for (const r of rows) {
    if (r.outcome !== 'mob-down') continue
    let tailClass = 'quiet'
    let tailGap = null
    let tailFleeHp = null
    if (r.closerIdx !== null) {
      for (let j = r.closerIdx + 1; j < src.length; j++) {
        const tl = src[j]
        if (typeof tl !== 'string') continue
        const km = tl.match(DIED_KIND_RE)
        if (km && km[1] === r.bot) { tailClass = 'died-after'; tailGap = j - r.closerIdx; break }
        const cm = parseCombatLine(tl)
        if (!cm || cm.bot !== r.bot) continue
        if (cm.verb === 'critical-bar') { tailClass = 'drained'; tailGap = j - r.closerIdx; break }
        if (cm.verb === 'fleeing') {
          const fh = tl.match(FLEE_HP_RE)
          tailClass = 'fled'
          tailGap = j - r.closerIdx
          tailFleeHp = fh ? Number(fh[2]) : null
          break
        }
        if (cm.verb === 'fighting') { tailClass = 're-engaged'; tailGap = j - r.closerIdx; break }
        if (cm.verb === 'sheltering') { tailClass = 'sheltered'; tailGap = j - r.closerIdx; break }
        if (cm.verb === 'fight-ended') { tailClass = 'chained'; tailGap = j - r.closerIdx; break }
        // every other combat verb: the tail's own machinery prose
      }
      // the drained tail keeps scanning for the drain's own flight
      if (tailClass === 'drained') {
        for (let j = r.closerIdx + 1 + (tailGap ?? 0); j < src.length; j++) {
          const tl = src[j]
          if (typeof tl !== 'string') continue
          const cm = parseCombatLine(tl)
          if (!cm || cm.bot !== r.bot) continue
          if (cm.verb === 'fleeing') {
            const fh = tl.match(FLEE_HP_RE)
            tailFleeHp = fh ? Number(fh[2]) : null
            break
          }
          // the next boundary of any kind stops the drain scan - the
          // tail never bleeds across a new episode
          if (cm.verb === 'fighting' || cm.verb === 'fight-ended' || cm.verb === 'sheltering') break
        }
      }
    }
    r.tailClass = tailClass
    r.tailGap = tailGap
    r.tailFleeHp = tailFleeHp
    r.tailDrain = tailFleeHp !== null && r.endHp !== null ? round1(r.endHp - tailFleeHp) : null
    tails[tailClass]++
    if (tailFleeHp !== null) drainFlights++
  }
  // the exit zones - the wins split against the policy's own flee line
  // (imported, one truth; the regen slog's NEGATIVE cost still prices
  // the exit honestly: exit = start - cost)
  const exitZones = { belowFlee: 0, atOrAbove: 0, fleeLine: FLEE_HP }
  for (const r of rows) {
    if (r.outcome !== 'mob-down' || r.endHp === null) continue
    if (r.endHp < FLEE_HP) exitZones.belowFlee++
    else exitZones.atOrAbove++
  }
  return {
    starts: tally.starts,
    mobDown: tally['mob-down'],
    deadline: tally.deadline,
    chaseCeiling: tally['chase-ceiling'],
    verdictIgnore: tally['verdict-ignore'],
    abandoned: tally.abandoned,
    sheltered: tally.sheltered,
    died: tally.died,
    open: tally.open,
    costs, freeWins, slog, weapons, perBot,
    tails,
    drainFlights,
    exitZones,
    rows
  }
}
