// (v0.382.0) THE BANK-FLOW CENSUS - the end-phase bank lines already print
// every number the walk-deliveries cure needs (face 19 closed 19/19 alive
// with a 495u pocket still unbanked, 38.6% of it crafted-class surplus the
// mined counter never sees, and the flow-priced budgets naming a 2433-2789s
// delivery need against a static 248s window) - but the mining tool never
// read them (the blind-tool lesson, the v0.371.0 shape). This module is the
// pure parser (unit-pinned, the rescue-ledger v0.368.0 shape); decompose is
// its field read. Mining-surface only: zero fleet wiring, zero new log
// lines - the v0.379.0 precedent.

const num = (s) => Number(s)

// Stranded entry: 'F1 0u/102u pocket' - the bot kept the pocket, the walk
// delivered nothing (delivered 0 of the pocket).
const STRANDED_RE = /^(F\d+) (\d+)u\/(\d+)u pocket$/

// Write-off entry: 'F1 102u/15s' - units the deadline collected unbanked.
const WRITEOFF_RE = /^(F\d+) (\d+)u\/(\d+)s$/

// Surplus top item: 'stick 96u'.
const SURPLUS_ITEM_RE = /^([a-z_]+) (\d+)u$/

// 'stick 96u, oak_planks 70u, torch 12u' -> [{item, units}, ...]
export function parseSurplusItems(s) {
  if (typeof s !== 'string') return []
  return s.split(', ').map((p) => {
    const m = p.match(SURPLUS_ITEM_RE)
    return m ? { item: m[1], units: num(m[2]) } : null
  }).filter(Boolean)
}

// 'F1 0u/102u pocket, F13 0u/65u pocket - the walk never delivered'
//   -> [{bot, deliveredU, pocketU}, ...] (entries before the ' - ' tail)
export function parseStranded(s) {
  if (typeof s !== 'string') return []
  const head = s.split(' - ')[0] || ''
  return head.split(', ').map((p) => {
    const m = p.trim().match(STRANDED_RE)
    return m ? { bot: m[1], deliveredU: num(m[2]), pocketU: num(m[3]) } : null
  }).filter(Boolean)
}

// 'F1 102u/15s, F13 65u/14s (the deadline pocket rode unbanked)'
//   -> [{bot, units, seconds}, ...] (the trailing parenthetical dropped)
export function parseWriteOff(s) {
  if (typeof s !== 'string') return []
  const head = s.replace(/ \([^)]*\)$/, '')
  return head.split(', ').map((p) => {
    const m = p.trim().match(WRITEOFF_RE)
    return m ? { bot: m[1], units: num(m[2]), seconds: num(m[3]) } : null
  }).filter(Boolean)
}

// 'local - stalled carries 4 of 5 failed climb cycles (80.0%) - one class
// owns the tax' -> { whyClass, carried, total, pct } or null.
export function parseDoomWhy(s) {
  const m = typeof s === 'string' ? s.match(/([a-z-]+) carries (\d+) of (\d+) failed climb cycles \(([\d.]+)%\)/) : null
  return m ? { whyClass: m[1], carried: num(m[2]), total: num(m[3]), pct: num(m[4]) } : null
}

const LOOT_RE = /^loot ledger: mined=(\d+) banked=(\d+) smelted=(\d+) pocket=(\d+)u\/(\d+)s accounted=(\d+) unaccounted=(\d+) surplus=(\d+)u conversion=([\d.]+)%$/
const POCKET_ANATOMY_RE = /^pocket anatomy: spread across (\d+) holders, top (F\d+) (\d+)u = ([\d.]+)% of (\d+)u - (.+)$/
const SURPLUS_FACE_RE = /^surplus face: crafted-class (\d+)u of (\d+)u pocket \(([\d.]+)%\), top (.+?) - the mined counter never saw these units \(surplus (\d+)u\)$/
const BANK_FLOW_RE = /^bank flow: ([\d.]+)u\/s \(banked \+(\d+)u over (\d+)s\) - the (\d+)u pocket needs (\d+)s past the deadline$/
// (v0.384.0) THE GRANTED-CLOCK FIX - the v0.382.0 regex modeled the budget
// line's suffix from imagination ('is not covered'): the field line ends
// 'is not a rate - priced at the ex-burst N.Nu/s' (the v0.348.0 tail-burst
// guard's own words) and may carry ' - clamped to Ns (the kill margin)' (the
// v0.41.0 margin clamp). A covered pocket speaks nothing (the leanness law)
// - the line only prints when the clock EXTENDED, so a 'covered' flag was
// dead code by construction. The GRANTED clock (the clamped chain budget)
// is the whale's key number: granted 300s vs a 2433-2789s need = the
// structural deficit the kill margin owns by construction. The $ anchor is
// the anatomy law: the print template ends at one of the three forms - an
// imagined suffix must never parse as a budget line again.
const BUDGET_RE = /^(F\d+) final bank budget: flow-priced (\d+)s \(fleet pocket (\d+)u at ([\d.]+)u\/s needs (\d+)s\) - the static (\d+)s covered only the fast flows(?: - the tail burst \((\d+)s, (\d+)u, (\d+)% of the window's delta\) is not a rate - priced at the ex-burst ([\d.]+)u\/s)?(?: - clamped to (\d+)s \(the kill margin\))?$/
const ATTRIBUTION_RE = /^bank attribution: top (.+?); stranded: (.+)$/

// The census: feed the full fleet19.log lines. Every field is null/[] when
// the face never printed it (a FATAL face truncates the end phase - the
// v0.358.0 lesson: the reader must survive the missing block).
export function bankFlowCensus(lines) {
  const rows = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string') : []
  const last = (re) => {
    let m = null
    for (const l of rows) {
      const hit = l.match(re)
      if (hit) m = hit
    }
    return m
  }

  // The loot ledger (the accounting spine): the last line wins - later
  // prints carry the fuller count.
  const lootM = last(LOOT_RE)
  const loot = lootM ? {
    mined: num(lootM[1]), banked: num(lootM[2]), smelted: num(lootM[3]),
    pocketUnits: num(lootM[4]), pocketSeconds: num(lootM[5]),
    accounted: num(lootM[6]), unaccounted: num(lootM[7]),
    surplus: num(lootM[8]), conversionPct: num(lootM[9]),
  } : null

  // The pocket anatomy: who holds the unbanked crater's face.
  const paM = last(POCKET_ANATOMY_RE)
  const pocket = paM ? {
    holders: num(paM[1]), topBot: paM[2], topUnits: num(paM[3]),
    topPct: num(paM[4]), pocketUnits: num(paM[5]), tail: paM[6],
  } : null

  // The surplus face: the crafted-class units the mined counter never saw.
  const sfM = last(SURPLUS_FACE_RE)
  const surplus = sfM ? {
    craftedUnits: num(sfM[1]), pocketUnits: num(sfM[2]), craftedPct: num(sfM[3]),
    top: parseSurplusItems(sfM[4]), surplusUnits: num(sfM[5]),
  } : null

  // The delivery pricing: pocket / observed rate = seconds past the deadline.
  const bfM = last(BANK_FLOW_RE)
  const flow = bfM ? {
    rateUPerS: num(bfM[1]), bankedDelta: num(bfM[2]), windowS: num(bfM[3]),
    pocketUnits: num(bfM[4]), secondsPastDeadline: num(bfM[5]),
  } : null

  // The per-bot flow-priced budgets: the static window vs the flow's need,
  // the tail-burst guard's ex-burst rate, and the GRANTED clock (the kill
  // margin's clamp - the deficit the chain actually received).
  const budgets = []
  for (const l of rows) {
    const m = l.match(BUDGET_RE)
    if (!m) continue
    budgets.push({
      bot: m[1], flowPricedS: num(m[2]), pocketUnits: num(m[3]),
      rateUPerS: num(m[4]), needsS: num(m[5]), staticS: num(m[6]),
      burst: m[7] !== undefined ? { spanS: num(m[7]), deltaU: num(m[8]), pct: num(m[9]), exBurstRate: num(m[10]) } : null,
      grantedS: m[11] !== undefined ? num(m[11]) : null,
      clamped: m[11] !== undefined,
    })
  }
  const maxNeedsS = budgets.reduce((a, b) => Math.max(a, b.needsS), 0)
  const grantedList = budgets.filter((b) => b.grantedS != null).map((b) => b.grantedS)
  const grantedMaxS = grantedList.length ? Math.max(...grantedList) : null
  const budgetAgg = budgets.length ? {
    count: budgets.length,
    clamped: budgets.filter((b) => b.clamped).length,
    grantedMaxS,
    maxNeedsS,
    staticS: budgets[0].staticS,
    // The granted share: how much of the slowest need the margin actually
    // granted (null when no line carried the clamp - the clock moved free).
    grantedSharePct: grantedMaxS != null && maxNeedsS > 0 ? Math.round((grantedMaxS / maxNeedsS) * 100) : null,
  } : null

  // The stranded pockets: the attribution's walk-never-delivered class.
  const atM = last(ATTRIBUTION_RE)
  const stranded = atM ? parseStranded(atM[2]) : []
  const attribution = atM ? {
    topRaw: atM[1],
    stranded,
    strandedZeroDelivered: stranded.filter((s) => s.deliveredU === 0 && s.pocketU > 0).length,
  } : null

  // The write-off: what the deadline collected unbanked.
  const woM = last(/^final write-off: (.+)$/)
  const writeOff = woM ? parseWriteOff(woM[1]) : []

  // The doom attribution: the failed climb cycles' owner class.
  const dcM = last(/^final bank doom census: (.+)$/)
  const dwM = last(/^final bank doom why: (.+)$/)
  const doom = (dcM || dwM) ? {
    censusRaw: dcM ? dcM[1] : null,
    whyRaw: dwM ? dwM[1] : null,
    why: parseDoomWhy(dwM ? dwM[1] : null),
  } : null

  return { loot, pocket, surplus, flow, budgets, budgetAgg, attribution, writeOff, doom }
}
