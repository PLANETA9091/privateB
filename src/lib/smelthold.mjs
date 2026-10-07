//
// smelthold.mjs - THE SMELT HOLD LEDGER (v0.491.0)
// The reserve decision's own fate. The emitter side is deposit.mjs's
// smeltChainReserve (v0.87.0 the reserve, v0.183.0 the fuel gate,
// v0.192.0 the pickFuel probe) and the yield side is the smelt verdict
// (v0.490.0) - but the FIELD outcome of the hold decision itself was
// never read: the bot reserves a slice of the chain budget for the
// smelt leg ('F17 bank: holding 62s of 248s for the smelt leg') and
// nobody joined the hold to what the leg then did. The hold-lane line
// skins (byte-verbatim, faces 42+43, 17 holds + 6 skips + 9 end-bank
// skips + 2 local fallbacks):
//
//   F17 bank: holding 62s of 248s for the smelt leg
//   F10 bank: smelt hold skipped - no fuel in pocket (coal 0)
//   F6  bank: smelt hold skipped - no fuel in pocket (coal 6)
//   F9  end-bank budget spent - smelt skipped
//   F19 bank: yard walk failed (Took to long to decide path to goal!) - smelting locally if a furnace is near
//
// THE WIRE: each hold opens an episode for the bot; the bot's smelt
// lane then decides the hold's fate with the imported shapes (one
// parser per shape - the START/REFUSAL REs from smeltledger, the
// verdict RE from smeltverdict, never redefined): a batch START marks
// the leg FIRED and the bot's next VERDICT closes the hold with the
// yield it bought (F9's three holds: two died to the end-bank clock,
// the third fired 8 glass); a REFUSAL closes an unfired hold REFUSED
// (the machinery ate the reserved budget's leg at the furnace door);
// an end-bank skip closes the open hold BUDGET-DIED (the walks ate the
// clock - the run79 iron wall's own line); a hold with nothing before
// the bot's next hold or the window end stays UNRESOLVED (the honest
// edge). The local-fallback line is PROSE, never closes (the house
// law) - it notes the venue change (F19's fallback hold then fired 1
// locally) and is tallied. A skip is a leaf record (the leg was never
// reserved): coal 0 = the honest empty pocket, 0 < coal <= the
// JUNK_COAL_FLOOR (imported from smelting.mjs - one truth never
// forked) = the floor doctrine's own field signature (face 43's F6
// skipped at coal 6 - the strict inequality caught byte-verbatim:
// 6 > 6 is false), coal above the floor = the anomaly bucket (never
// seen on the stored faces).
//
import { SMELT_START_RE } from './smeltledger.mjs'
import { SMELT_VERDICT_RE } from './smeltverdict.mjs'
import { JUNK_COAL_FLOOR } from './smelting.mjs'

// The refusal, the WIDE read: 'F1 smelt: 0 (nothing to smelt)' rides
// smeltledger's SMELT_REFUSAL_RE, but the multi-segment machine skin
// nests its parens ('F3 smelt: 0 (raw_copper@blast_furnace: machine
// unreachable (visit budget spent (walk slice)))' - the inner classes
// carry their own parens) and the narrow [^)]+ capture dies at the
// first inner ')' - the same blindness the flee ledger cured with the
// full token vocab. One shape, two skins: this lens owns the greedy
// capture (anchored to the LAST closing paren), smeltledger keeps its
// own - the parse never forks, the WHY text just arrives whole.
export const SMELT_HOLD_REFUSAL_RE = /^(F\d+) smelt: 0 \((.+)\)$/

// The hold: 'F17 bank: holding 62s of 248s for the smelt leg' - the
// reserved slice (62s) of that trip's chain budget (248s).
export const SMELT_HOLD_RE = /^(F\d+) bank: holding (\d+)s of (\d+)s for the smelt leg$/

// The skip: 'F10 bank: smelt hold skipped - no fuel in pocket (coal 0)'
// - the paren is the emitter's own diagnostic (coal + charcoal count).
export const SMELT_HOLD_SKIP_RE = /^(F\d+) bank: smelt hold skipped - no fuel in pocket \(coal (\d+)\)$/

// The end-bank death: 'F9 end-bank budget spent - smelt skipped' - the
// chain clock ran out before the reserved leg could run.
export const SMELT_END_BANK_SKIP_RE = /^(F\d+) end-bank budget spent - smelt skipped$/

// The venue change: 'F19 bank: yard walk failed (<why>) - smelting
// locally if a furnace is near' - prose, never closes (the house law).
export const SMELT_LOCAL_FALLBACK_RE = /^(F\d+) bank: yard walk failed \(([^)]*)\) - smelting locally if a furnace is near$/

function skipClass (coal) {
  if (coal === 0) return 'coal-0'
  if (coal <= JUNK_COAL_FLOOR) return 'below-floor'
  return 'above-floor'
}

function refusalClass (why) {
  return why.trim() === 'nothing to smelt' ? 'nothing' : 'machine'
}

/**
 * Read the smelt hold lane's decisions and their fates.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{holds: number, holdSecs: number, budgetSecs: number, fates: Object<string,number>, refusedWhy: Object<string,number>, firedActualTotal: number, zeroYield: number, fallbacks: number, skips: number, skipClasses: Object<string,number>, endBankStandalone: number, rows: Array}}
 */
export function smeltHold (lines) {
  if (!Array.isArray(lines)) return null
  const lanes = new Map()
  const skips = []
  let endBankStandalone = 0

  const lane = bot => {
    if (!lanes.has(bot)) lanes.set(bot, { open: null, rows: [] })
    return lanes.get(bot)
  }

  const closeHold = (l, fate, extra = {}) => {
    if (!l.open) return false
    l.rows.push({
      bot: l.open.bot, heldSecs: l.open.heldSecs, budgetSecs: l.open.budgetSecs,
      fate, actual: extra.actual != null ? extra.actual : null,
      whyClass: extra.whyClass != null ? extra.whyClass : null,
      fallback: l.open.fallback === true
    })
    l.open = null
    return true
  }

  for (const line of lines) {
    if (typeof line !== 'string') continue
    let m = SMELT_HOLD_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      closeHold(l, 'unresolved')
      l.open = { bot: m[1], heldSecs: Number(m[2]), budgetSecs: Number(m[3]), fired: false, fallback: false }
      continue
    }
    m = SMELT_HOLD_SKIP_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      skips.push({ bot: m[1], coal: Number(m[2]), cls: skipClass(Number(m[2])) })
      continue
    }
    m = SMELT_LOCAL_FALLBACK_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      if (l.open) l.open.fallback = true
      continue
    }
    m = SMELT_END_BANK_SKIP_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      if (!closeHold(l, 'budget-died')) endBankStandalone++
      continue
    }
    m = SMELT_START_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      if (l.open) l.open.fired = true
      continue
    }
    m = SMELT_HOLD_REFUSAL_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      if (l.open && !l.open.fired) closeHold(l, 'refused', { whyClass: refusalClass(m[2]) })
      continue
    }
    m = SMELT_VERDICT_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      if (l.open) closeHold(l, 'fired', { actual: Number(m[2]) })
    }
  }
  for (const l of lanes.values()) closeHold(l, 'unresolved')

  const fates = { fired: 0, firedZero: 0, refused: 0, budgetDied: 0, unresolved: 0 }
  const refusedWhy = { nothing: 0, machine: 0 }
  const skipClasses = { 'coal-0': 0, 'below-floor': 0, 'above-floor': 0 }
  const rows = []
  let holdSecs = 0
  let budgetSecs = 0
  let firedActualTotal = 0
  let zeroYield = 0
  let fallbacks = 0
  for (const l of lanes.values()) rows.push(...l.rows)
  for (const r of rows) {
    holdSecs += r.heldSecs
    budgetSecs += r.budgetSecs
    if (r.fallback) fallbacks++
    if (r.fate === 'fired') {
      if (r.actual > 0) {
        fates.fired++
        firedActualTotal += r.actual
      } else {
        fates.firedZero++
        zeroYield++
      }
    } else {
      const key = r.fate === 'budget-died' ? 'budgetDied' : r.fate
      fates[key] = (fates[key] || 0) + 1
      if (r.fate === 'refused' && r.whyClass) refusedWhy[r.whyClass] = (refusedWhy[r.whyClass] || 0) + 1
    }
  }
  for (const s of skips) skipClasses[s.cls] = (skipClasses[s.cls] || 0) + 1

  return {
    holds: rows.length, holdSecs, budgetSecs, fates, refusedWhy,
    firedActualTotal, zeroYield, fallbacks,
    skips: skips.length, skipClasses, endBankStandalone, rows
  }
}

// (v0.753.0) THE REFUSAL'S OWN ANATOMY - the refusal WHY text learns to
// speak in segments. The v0.491.0 lens read the refusal's fate wide but
// its WHY coarse: refusalClass knows exactly two verdicts (nothing /
// machine) and the multi-segment machine skin rides as one undecoded
// blob. Face 61 (fleet 37583836654, the first fully-protected face)
// made the coarseness unignorable: 14 refusal lines carried at least
// five distinct voices the two-class lens lumps together -
//
//   F2  smelt: 0 (nothing to smelt)                                     -> nothing
//   F9  smelt: 0 (cobblestone@furnace: no fuel)                         -> no-fuel
//   F8  smelt: 0 (raw_iron@blast_furnace: machine unreachable (visit
//       budget spent (walk slice)))                                     -> unreachable
//   F3  smelt: 0 (oak_log@furnace: machine unreachable (fleet goal
//       ceiling: 30 goals fleet-wide in 5s - walk to furnace refused
//       for 3s))                                                        -> unreachable
//   F12 smelt: 0 (cobblestone@furnace: busy; oak_log@furnace: busy cold) -> busy x2
//   F19 smelt: 0 (timeout; cobblestone@furnace: no fuel; x7)            -> timeout + no-fuel x7
//
// THE WIRE: the machine skin nests its segments after '; ' and each
// segment names its own voice - the anatomy splits the greedy capture
// (SMELT_HOLD_REFUSAL_RE already anchors to the LAST closing paren, so
// the nested parens survive), classifies every segment, and prices the
// fleet's refusal mix. The coarse lens is UNTOUCHED (refusedWhy keeps
// its {nothing, machine} shape - decompose's v0.491.0 row reads it
// byte-identical); the anatomy is the additive generation beside it.
// Junk law: a non-string / blank WHY reads null (no anatomy from
// nothing); an unknown segment voice reads 'other' (counted, never
// invented into a named class); a junk line is skipped, never a crash.
export const REFUSAL_SEG_CLASSES = ['nothing', 'no-fuel', 'busy', 'timeout', 'unreachable', 'other']

export function refusalSegClass (seg) {
  if (typeof seg !== 'string') return 'other'
  const s = seg.toLowerCase()
  if (s === 'nothing to smelt') return 'nothing'
  if (s.includes('no fuel')) return 'no-fuel'
  if (s.includes('busy')) return 'busy'
  if (s.includes('timeout')) return 'timeout'
  if (s.includes('unreachable')) return 'unreachable'
  return 'other'
}

export function refusalSegs (why) {
  if (typeof why !== 'string' || why.trim() === '') return null
  return why.split(';')
    .map(s => s.trim())
    .filter(s => s !== '')
    .map(raw => ({ raw, cls: refusalSegClass(raw) }))
}

export function smeltRefusalAnatomy (lines) {
  if (!Array.isArray(lines)) return null
  const segs = {}
  for (const c of REFUSAL_SEG_CLASSES) segs[c] = 0
  const byBot = {}
  const rows = []
  let multi = 0
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const m = SMELT_HOLD_REFUSAL_RE.exec(line)
    if (!m) continue
    const parts = refusalSegs(m[2]) || []
    const classes = parts.map(p => p.cls)
    for (const c of classes) segs[c] = (segs[c] || 0) + 1
    byBot[m[1]] = (byBot[m[1]] || 0) + 1
    if (parts.length > 1) multi++
    rows.push({ bot: m[1], classes, raw: m[2] })
  }
  return { refusals: rows.length, segs, byBot, multi, rows }
}
