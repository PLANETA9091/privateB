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
// (v0.612.0) THE WHY TAIL: the emitter's v0.553.0 row rides the class when
// the end-phase knew it - 'F16 214u/16s timeout', 'F10 131u/19s doom-latched'
// (fleet 37191475285's face: the tail rode 3 of 4 entries) - and the anchored
// bare regex DROPPED every suffixed entry: the mining read saw 141u of the
// 552u crater and lost ALL reasons (the blind-tool lesson's own shape). The
// optional token rides the emitter's own law (/^[a-z0-9-]+$/, one token); a
// dirty or multi-word tail is a junk line, not a read.
const WRITEOFF_RE = /^(F\d+) (\d+)u\/(\d+)s(?: ([a-z0-9-]+))?$/

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
// (v0.612.0) the why tail rides when the emitter knew the class:
//   'F16 214u/16s timeout' -> { bot: 'F16', units: 214, seconds: 16, why: 'timeout' }
//   'F17 141u/25s'         -> { bot: 'F17', units: 141, seconds: 25 } (byte-equal bare form)
export function parseWriteOff(s) {
  if (typeof s !== 'string') return []
  const head = s.replace(/ \([^)]*\)$/, '')
  return head.split(', ').map((p) => {
    const m = p.trim().match(WRITEOFF_RE)
    if (!m) return null
    const e = { bot: m[1], units: num(m[2]), seconds: num(m[3]) }
    if (m[4] !== undefined) e.why = m[4] // the key rides only when present - the bare pins stay byte-equal
    return e
  }).filter(Boolean)
}

// 'local - stalled carries 4 of 5 failed climb cycles (80.0%) - one class
// owns the tax' -> { whyClass, carried, total, pct } or null.
export function parseDoomWhy(s) {
  const m = typeof s === 'string' ? s.match(/([a-z-]+) carries (\d+) of (\d+) failed climb cycles \(([\d.]+)%\)/) : null
  return m ? { whyClass: m[1], carried: num(m[2]), total: num(m[3]), pct: num(m[4]) } : null
}

// (v0.645.0) THE PRE-POSITION'S OWN CENSUS - the walk-home seat's conversion
// row, first priced (the wiring's own v0.645.0 row, fleet19.mjs). Byte-exact
// fed face (37239853197's shape, the census's own numbers):
//   'pre-position census: armed 10, landed 3 (+378u), failed 3 (top why: chest unreachable x2) - the seat's own delivery, first priced'
// The bare failed face (a single fail or a spread with no dominating class -
// the emitter prints the top why only when one exists):
//   'pre-position census: armed 2, landed 1 (+114u), failed 1 - the seat's own delivery, first priced'
// The optional top-why tail rides only when present (the parseWriteOff law -
// the bare pins stay byte-equal). Junk-safe: a non-string reads null, a
// non-numeric capture is a junk line (never invented, the grain's own law).
// (v0.648.0) THE CLIMB-OUT'S OWN SPLIT - the surface-refused class was one
// flat name while the climb-out lines carried the anatomy (face 37243173708:
// surface refused x31 = stalled x17 + wet-sentinel x5 + low-o2 x4 + timeout
// x2 + wet wall x1 + stopped x1 + rescue x1 - the STALLED class is the front,
// the wet the second; the two fronts price different cures). The row gains an
// OPTIONAL tail inside the top-why parens ('; climb-outs: stalled x17, ...')
// and the parser reads BOTH forms forever (the v0.390.0 alternation law): a
// row without the tail parses exactly as before (the capture grid unchanged),
// a malformed tail entry is a junk line (never invented, the grain's own
// law). The top-why capture narrows from (.+) to [^;)]+ - the emitter's own
// vocabulary never rides a semicolon or a paren inside the why text.
const PREPOSITION_RE = /^pre-position census: armed (\d+), landed (\d+) \(\+(\d+)u\), failed (\d+)(?: \(top why: ([^;)]+) x(\d+)(?:; climb-outs: ([^)]+))?\))? - the seat's own delivery, first priced$/

export function parsePrePositionCensus(s) {
  const m = typeof s === 'string' ? s.match(PREPOSITION_RE) : null
  if (!m) return null
  const e = { armed: num(m[1]), landed: num(m[2]), landedUnits: num(m[3]), failed: num(m[4]) }
  if (m[5] !== undefined) { e.topWhy = m[5]; e.topWhyCount = num(m[6]) }
  if (m[7] !== undefined) {
    const climbOuts = []
    for (const part of m[7].split(', ')) {
      const pm = part.match(/^(.+) x(\d+)$/)
      if (!pm) return null // the junk law: a malformed entry is a junk line, never invented
      climbOuts.push({ kind: pm[1], count: num(pm[2]) })
    }
    e.climbOuts = climbOuts
  }
  return e
}

// (v0.810.0) THE PRE-POSITION'S OWN WHY - WHICH why owns the walk-home book.
// The census row (v0.645.0) prints armed/landed/failed raw and the emitter
// names the argmax top why (v0.648.0 rode the climb-out split inside the
// parens), but no row ever said whether that top class OWNS the failed
// walk-homes - the why's own seat rode unnamed while the surface gate's
// tax stayed a per-face number.
//
// The census's own cells only, zero re-parsing (the v0.802.0 orphan seat's
// own law, the v0.807.0 zero-why seat's own shape). The strict-majority
// law: the top why owns only when it holds MORE than the rest of the book
// together - a tie owns nothing (the v0.784.0 kind-seat's own law). The
// line's own grain carries the argmax only (the emitter prints the top
// class, never the full split), so the no-owner face reads the riders as
// the argmax's honest measure - the spread's shape rides unpriced beyond
// the grain (measure-not-owner, the v0.803.0 law). Junk never invents a
// why: a non-object entry, a non-finite or non-positive count, or a
// zero-failed book reads the honest silence (null).
function prePositionWhyCells (e) {
  if (!e || typeof e !== 'object') return null
  const failed = e.failed
  if (!Number.isFinite(failed) || failed <= 0) return null
  const why = e.topWhy
  const owns = e.topWhyCount
  if (typeof why !== 'string' || why === '') return null
  if (!Number.isFinite(owns) || owns <= 0) return null
  if (owns > failed) return null
  return { why, owns, failed }
}

// The why's own seat - the strict-majority owner of the failed walk-home
// book, or null when the argmax rides under the half (v0.810.0).
export function prePositionWhySeat (e) {
  const c = prePositionWhyCells(e)
  if (!c) return null
  if (c.owns > c.failed - c.owns) {
    return { why: c.why, owns: c.owns, ofFailed: c.failed, shareOfFailed: c.owns / c.failed * 100 }
  }
  return null
}

// The why's own riders - the argmax's honest measure when the seat law
// refuses (the line's grain carries no second class to pair with,
// v0.810.0).
export function prePositionWhyRiders (e) {
  const c = prePositionWhyCells(e)
  if (!c) return null
  if (c.owns > c.failed - c.owns) return null // the seat's own face - the riders stay silent (one row never both)
  return { why: c.why, owns: c.owns, ofFailed: c.failed, shareOfFailed: c.owns / c.failed * 100 }
}

// The seat row - the byte-exact read the decompose prints beside the
// pre-position census (the branch law: the owner case leaves the
// companion unprinted). Guarded end to end; junk reads null (v0.810.0).
export function prePositionWhySeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { why, owns, ofFailed, shareOfFailed } = seat
  if (typeof why !== 'string' || why === '') return null
  if (!Number.isFinite(owns) || owns <= 0) return null
  if (!Number.isFinite(ofFailed) || ofFailed <= 0) return null
  if (owns > ofFailed) return null
  if (!Number.isFinite(shareOfFailed)) return null
  const s = ofFailed === 1 ? 'failed walk-home' : 'failed walk-homes'
  return `the pre-position's own why (v0.810.0): ${why} owns ${owns} of ${ofFailed} ${s} (${shareOfFailed.toFixed(1)}%) - THE WALK-HOME'S OWN SEAT: one why's own failures own the pre-position book - the why's own front prices the walk home the raw split rode unnamed`
}

// The riders row - the byte-exact read for the no-owner faces (v0.810.0).
export function prePositionWhyRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { why, owns, ofFailed, shareOfFailed } = r
  if (typeof why !== 'string' || why === '') return null
  if (!Number.isFinite(owns) || owns <= 0) return null
  if (!Number.isFinite(ofFailed) || ofFailed <= 0) return null
  if (owns > ofFailed) return null
  if (!Number.isFinite(shareOfFailed)) return null
  const s = ofFailed === 1 ? 'failed walk-home' : 'failed walk-homes'
  return `the pre-position's own riders (v0.810.0): no solo why owns the majority - the top ${why} x${owns} holds ${owns} of ${ofFailed} ${s} (${shareOfFailed.toFixed(1)}%) - THE WALK-HOME'S OWN SPREAD: the line's grain carries the argmax only - the seat's law refused the under-half claim`
}

// (v0.810.0) THE CLIMB-OUT'S OWN SEAT - the surface anatomy's own owner.
// The climb-out split (v0.648.0) rode the parens raw; the split's own
// majority rode unnamed. The cells' own tally (the sum IS the climb book -
// a junk entry poisons the whole line at the parse, the parser's own law),
// the strict-majority seat, a tie owns nothing, the byte order decides the
// ranked ties - 'low-o2' < 'rescue owns the bot' < 'stalled' < 'stopped' <
// 'timeout' < 'wet wall' < 'wet-sentinel' (the byte trap: the space 0x20
// sorts before the hyphen 0x2d, the hyphen before any letter). The riders
// are measure-not-owner: the top-two pair prices the spread, and only
// >= 2 kinds form a crowd (the v0.807.0 law).
function prePositionClimbCells (e) {
  if (!e || typeof e !== 'object' || !Array.isArray(e.climbOuts)) return null
  const cells = []
  for (const c of e.climbOuts) {
    if (!c || typeof c !== 'object') continue // the honest-skip law: a junk cell never counts
    const kind = c.kind
    const n = c.count
    if (typeof kind !== 'string' || kind === '') continue
    if (!Number.isFinite(n) || n <= 0) continue
    cells.push([kind, n])
  }
  if (cells.length === 0) return null
  const total = cells.reduce((s, [, n]) => s + n, 0)
  if (!(total > 0)) return null
  cells.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return { cells, total }
}

// The climb's own seat - the strict-majority owner of the climb-out book,
// or null when no kind holds more than the rest together (v0.810.0).
export function prePositionClimbSeat (e) {
  const t = prePositionClimbCells(e)
  if (!t) return null
  const [kind, topN] = t.cells[0]
  if (topN > t.total - topN) {
    return { kind, owns: topN, ofClimbs: t.total, shareOfClimbs: topN / t.total * 100 }
  }
  return null
}

// The climb's own riders - the top-two concentration when the solo law
// refuses to seat (measure-not-owner; a single kind is no crowd and reads
// null, v0.810.0).
export function prePositionClimbRiders (e) {
  const t = prePositionClimbCells(e)
  if (!t || t.cells.length < 2) return null
  const [leader, leaderOwns] = t.cells[0]
  const [runner, runnerOwns] = t.cells[1]
  const pairOwns = leaderOwns + runnerOwns
  return {
    leader, leaderOwns, runner, runnerOwns,
    ofClimbs: t.total, pairOwns,
    shareOfClimbs: pairOwns / t.total * 100,
    duet: `${leader} x${leaderOwns} + ${runner} x${runnerOwns}`,
  }
}

// The climb seat row - the byte-exact read (the branch law: one row never
// both). Guarded end to end; junk reads null (v0.810.0).
export function prePositionClimbSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { kind, owns, ofClimbs, shareOfClimbs } = seat
  if (typeof kind !== 'string' || kind === '') return null
  if (!Number.isFinite(owns) || owns <= 0) return null
  if (!Number.isFinite(ofClimbs) || ofClimbs <= 0) return null
  if (owns > ofClimbs) return null
  if (!Number.isFinite(shareOfClimbs)) return null
  const s = ofClimbs === 1 ? 'climb-out' : 'climb-outs'
  return `the pre-position climb's own seat (v0.810.0): ${kind} owns ${owns} of ${ofClimbs} ${s} (${shareOfClimbs.toFixed(1)}%) - THE CLIMB'S OWN SEAT: one kind's own climb-outs own the surface anatomy - the kind's own front prices the walk the raw split rode unnamed`
}

// The climb riders row - the byte-exact read for the no-owner faces
// (v0.810.0).
export function prePositionClimbRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofClimbs, pairOwns, shareOfClimbs, duet } = r
  if (typeof leader !== 'string' || leader === '') return null
  if (typeof runner !== 'string' || runner === '') return null
  if (!Number.isFinite(leaderOwns) || leaderOwns <= 0) return null
  if (!Number.isFinite(runnerOwns) || runnerOwns <= 0) return null
  if (!Number.isFinite(ofClimbs) || ofClimbs <= 0) return null
  if (!Number.isFinite(pairOwns) || pairOwns <= 0) return null
  if (pairOwns > ofClimbs) return null
  if (typeof duet !== 'string' || duet === '') return null
  if (!Number.isFinite(shareOfClimbs)) return null
  const s = ofClimbs === 1 ? 'climb-out' : 'climb-outs'
  return `the pre-position climb's own riders (v0.810.0): no solo kind owns the majority - ${duet} own ${pairOwns} of ${ofClimbs} ${s} (${shareOfClimbs.toFixed(1)}%) - THE CLIMB'S OWN MIX: the seat's tie law held, the spread is the shape - the climb's own crowd prices the anatomy the solo law refused to name`
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
// (v0.390.0) the pocket class named on the line splits: the bankable form
// ('fleet bankable pocket Nu (raw Mu)') rides beside the legacy form ('fleet
// pocket Nu') - ONE optional-prefix alternation, the capture grid unchanged,
// both faces readable forever. The number that priced the need lands in the
// same group either way (the honest-line law: the meaning changed, the name
// changed with it; the census reads the priced pocket).
const BUDGET_RE = /^(F\d+) final bank budget: flow-priced (\d+)s \(fleet (?:bankable )?pocket (\d+)u(?: \(raw \d+u\))? at ([\d.]+)u\/s needs (\d+)s\) - the static (\d+)s covered only the fast flows(?: - the tail burst \((\d+)s, (\d+)u, (\d+)% of the window's delta\) is not a rate - priced at the ex-burst ([\d.]+)u\/s)?(?: - clamped to (\d+)s \(the kill margin\))?$/
const ATTRIBUTION_RE = /^bank attribution: top (.+?); stranded: (.+)$/

// (v0.682.0) THE CRATER VERDICT RIDE - the fleet's own v0.317.0 decode
// already printed the verdict ('banked crater decode: crater: ...'); the
// mining lens never carried it - the bank silence read its numbers (loot
// ledger, doom why) but not its NAME. One parser, the last line wins,
// junk never invents a crater (the body-guard law, same discipline as the
// fleet-side decode: a healthy share prints nothing, so the census's null
// is 'healthy or absent' - both read the same way, honestly).
const CRATER_RE = /^banked crater decode: crater: ([\d.]+)% of the endgame loot reached chests \(banked (\d+) of (\d+)u\) - (.+)$/

// (v0.387.0) THE DELIVERABLE CENSUS - the v0.385.0 arm's cause line carries
// the priced numbers (fleet pocket Nu at Ru/s needs Ns vs Ns granted/left);
// the blind-tool lesson applied to my own arm BEFORE the field needs it
// (face 21 rides the arm - mining it without this read would repeat the
// v0.371.0 mistake on my own line). Two terms: clamp (the structural one -
// the final bank can never grant) and clock (the run cannot drain in the
// time left). The '?' parts are the gate's own '?' prints (a null input);
// the $ anchor is the anatomy law - the template ends at 'the trip fires
// early', an imagined suffix never parses as an event.
// (v0.390.0) the bankable form rides beside the legacy form (the same
// optional-prefix alternation BUDGET_RE rides, the capture grid unchanged:
// 'fleet bankable pocket Nu (raw Mu)' and 'fleet pocket Nu' both land the
// priced pocket in m[3]).
const DELIVERABLE_RE = /^(F\d+) bank trip: deliverable \((clamp|clock)\) - fleet (?:bankable )?pocket (\d+)u(?: \(raw \d+u\))? at ([\d.]+|\?)u\/s needs (\d+|\?)s vs (\d+|\?)s (the final bank can never grant - the surplus must ride now|the run cannot drain in the time left) - the trip fires early$/

// 'F3 bank trip: deliverable (clamp) - fleet pocket 495u at 0.3u/s needs
// 1654s vs 300s the final bank can never grant - the surplus must ride now
// - the trip fires early' -> { bot, term, pocketU, rateUPerS, needS,
// limitS, tail } or null (the '?' parts read null).
export function parseDeliverable(s) {
  const m = typeof s === 'string' ? s.match(DELIVERABLE_RE) : null
  return m ? {
    bot: m[1], term: m[2], pocketU: num(m[3]),
    rateUPerS: m[4] === '?' ? null : num(m[4]),
    needS: m[5] === '?' ? null : num(m[5]),
    limitS: m[6] === '?' ? null : num(m[6]),
    tail: m[7],
  } : null
}

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

  // (v0.612.0) THE WHY TAIL'S MASS - the mining read of the emitter's own
  // v0.583.0 law (writeOffWhyRow aggregates the live inventory; THIS reads
  // the printed line - the blind-tool lesson): units summed per why class,
  // a bare entry rides the honest 'unnamed' bucket (a stranded pocket with
  // no why is still stranded mass - the bands' own blind law). The mined
  // face (fleet 37191475285): timeout 280u, unnamed 141u, doom-latched 131u
  // of the 552u crater - the per-class lever table (WRITE_OFF_WHY_LEVERS)
  // can now be priced from the LOG alone.
  let writeOffWhys = null
  if (writeOff.length) {
    const byClass = {}
    let units = 0
    for (const w of writeOff) {
      units += w.units
      const k = w.why || 'unnamed'
      byClass[k] = (byClass[k] || 0) + w.units
    }
    writeOffWhys = { units, byClass }
  }

  // (v0.387.0) The deliverability arm's firings: each cause line is an
  // event (the refractory cadence keeps them sparse - the count IS the
  // arm's field activity, no dedupe). The aggregate names the whale's
  // mid-run face: clamp vs clock, and the worst priced deficit (a firing
  // means need > limit, so the difference is non-negative at the print).
  const deliverableEvents = []
  for (const l of rows) {
    const d = parseDeliverable(l)
    if (d) deliverableEvents.push(d)
  }
  const deliverable = deliverableEvents.length ? {
    fires: deliverableEvents.length,
    clampFires: deliverableEvents.filter((e) => e.term === 'clamp').length,
    clockFires: deliverableEvents.filter((e) => e.term === 'clock').length,
    bots: [...new Set(deliverableEvents.map((e) => e.bot))],
    maxNeedS: deliverableEvents.reduce((a, e) => (e.needS != null ? Math.max(a, e.needS) : a), 0),
    minLimitS: deliverableEvents.reduce((a, e) => (e.limitS != null && (a == null || e.limitS < a) ? e.limitS : a), null),
    worstDeficitS: deliverableEvents.reduce((a, e) => (e.needS != null && e.limitS != null ? Math.max(a, e.needS - e.limitS) : a), 0),
    events: deliverableEvents,
  } : null

  // The doom attribution: the failed climb cycles' owner class.
  const dcM = last(/^final bank doom census: (.+)$/)
  const dwM = last(/^final bank doom why: (.+)$/)
  const doom = (dcM || dwM) ? {
    censusRaw: dcM ? dcM[1] : null,
    whyRaw: dwM ? dwM[1] : null,
    why: parseDoomWhy(dwM ? dwM[1] : null),
  } : null

  // (v0.682.0) The crater verdict: the fleet's own banked-share judgment,
  // ridden verbatim (the share, the pair it priced, the decode's tail).
  const crM = last(CRATER_RE)
  const crater = crM ? {
    sharePct: num(crM[1]), banked: num(crM[2]), mass: num(crM[3]), tail: crM[4],
  } : null

  return { loot, pocket, surplus, flow, budgets, budgetAgg, attribution, writeOff, writeOffWhys, doom, deliverable, crater, seatSplit: craterSeatSplit({ crater, loot, writeOff, flow }) } // (v0.758.0) seatSplit rides additively - the crater's own seats
}

// (v0.686.0) THE BANK YIELD DIAL - the flip's own number. The bank front
// re-priced across faces 23/24/25: banked 0 of 120 visit-lines (the 23rd's
// silent bank, the crater's 0%) -> 316 of 112 (the 24th's partial heal,
// 2.8u/visit) -> 1768 banked (the 25th's alive bank). The loot ledger
// always priced the banked MASS and the visit row always priced the LANE's
// line count - but their RATIO (the mass each visit-line carried) was
// never read: it is the dial that moved between the faces. Pure arithmetic
// over the two existing counters (zero new parsing); the silence law:
// visit-lines 0 (no bank lane at all) or a non-finite input reads null -
// the rate never invents itself. banked 0 over a live lane is NOT silence
// (it is the finding - the 23rd's own shape, `silent` names it).
export function bankYield (bankedUnits, visitLines) {
  if (!Number.isFinite(bankedUnits) || !Number.isFinite(visitLines)) return null
  if (visitLines <= 0) return null
  const rateUPerVisit = Math.round((bankedUnits / visitLines) * 10) / 10
  return { banked: bankedUnits, visits: visitLines, rateUPerVisit, silent: bankedUnits === 0 }
}

// (v0.758.0) THE CRATER'S OWN SEATS - the crater's class leg, priced from
// the census's own cells (the v0.757.0 additive-return precedent: zero
// re-parsing, zero new regexes). Three faces deepened the crater (75.5% ->
// 36.6% -> 28.9%) and the share never said WHICH seat owns the unbanked
// mass - face 63's own decode named the chains while its write-off rows
// carried 905u of the 1216u unbanked mass (the walks' own tax, night 612u
// of the 905u, the fleet's own why tail agreed at 67.6%). THE SEAT LAW
// (units only, the seconds never mix into the split): the write-off mass
// rides against the unbanked mass at the 2/3 bar (the thirds' own law) -
// 'failed-walks' (the bank lane carried and failed the mass: aim the whys,
// not the chains) / 'open-pocket' (the mass mostly never attempted: the
// chains are the lever). The top why-class rides beside the seat under the
// strict-majority law (a tie owns nothing - the storm-has-no-seat
// precedent). Junk never invents a seat: a missing crater/loot cell, a
// non-finite or negative pair, an unbanked that reads zero -> null (the
// body-guard law: the healthy share reads its own silence); a real crater
// with zero write-off mass is 'open-pocket' by shape (nothing failed
// because nothing left).
export function craterSeatSplit (census) {
  if (!census || typeof census !== 'object') return null
  const c = census.crater
  const loot = census.loot
  if (!c || !loot) return null
  const mass = c.mass
  const banked = c.banked
  if (!Number.isFinite(mass) || !Number.isFinite(banked) || mass < 0 || banked < 0) return null
  const unbanked = mass - banked
  if (unbanked <= 0) return null
  const rows = Array.isArray(census.writeOff) ? census.writeOff : []
  let sum = 0
  const whys = {}
  let counted = 0
  let badRows = 0
  for (const r of rows) {
    if (!r || typeof r !== 'object' || !Number.isFinite(r.units) || r.units < 0) { badRows++; continue }
    sum += r.units
    counted++
    const cls = typeof r.why === 'string' && r.why !== '' ? r.why : 'unclassed'
    whys[cls] = (whys[cls] || 0) + r.units
  }
  let topUnits = 0
  let topCls = null
  for (const [cls, u] of Object.entries(whys)) {
    if (u > topUnits) { topUnits = u; topCls = cls }
  }
  const topWhy = topCls !== null && topUnits > sum - topUnits
    ? { cls: topCls, units: topUnits, shareOfWriteOff: +(topUnits / sum).toFixed(3) }
    : null
  return {
    unbanked,
    heldPocket: Number.isFinite(loot.pocketUnits) ? loot.pocketUnits : null,
    writeOff: { sum, rows: counted, badRows, whys },
    writeOffShare: +(sum / unbanked).toFixed(3),
    cls: sum / unbanked >= 2 / 3 ? 'failed-walks' : 'open-pocket',
    topWhy,
    deadlineSeconds: census.flow && Number.isFinite(census.flow.secondsPastDeadline) ? census.flow.secondsPastDeadline : null,
  }
}

// (v0.777.0) THE WRITE-OFF'S OWN CAST - the write-off book's bot-level seat.
// The v0.583.0 why row priced the CLASS leg (night/timeout/unnamed), the
// v0.758.0 crater seat priced the SHARE leg (the write-off mass against the
// unbanked mass) - the BOT axis rode raw (face 73's own read: 'final
// write-off: F2 261u/19s, F5 154u/19s, F11 120u/13s, F19 106u/14s, F7
// 106u/14s' - five holders carrying 747u with no row naming whose pocket
// paid the deadline's collection). THE BILL LAW (the census's own writeOff
// cells only, zero re-parsing - the cast's v0.774.0 precedent): the top
// holder owns the book under the strict-majority law (a tie owns nothing -
// the storm-has-no-seat precedent). Junk never invents a cast: a missing or
// empty book, a non-finite or non-positive unit cell, or a minority top
// reads the honest silence (null).
export function writeOffBill (rows) {
  const book = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === 'object' &&
    typeof r.bot === 'string' && r.bot && Number.isFinite(r.units) && r.units > 0)
  if (!book.length) return null
  const total = book.reduce((a, r) => a + r.units, 0)
  const ranked = book.slice().sort((a, b) => b.units - a.units || (a.bot < b.bot ? -1 : 1))
  const top = ranked[0]
  if (top.units <= total - top.units) return null
  return { bot: top.bot, units: top.units, total, share: +(top.units / total).toFixed(3) }
}

// (v0.777.0) the bill's own row - THE POCKET'S OWN SOLO SPENDER: one bot's
// own pocket carried the deadline's collection; the v0.758.0 crater seat
// prices the mass, the cast names its owner. Junk never prints a seat (the
// honest silence's own row law).
export function writeOffBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { bot, units, total, share } = bill
  if (typeof bot !== 'string' || !bot || !Number.isFinite(units) || units <= 0 ||
      !Number.isFinite(total) || total <= 0 || units > total || !Number.isFinite(share)) return null
  return `the write-off's own cast (v0.777.0): ${bot} owns ${units} of ${total}u (${(share * 100).toFixed(1)}%) - THE POCKET'S OWN SOLO SPENDER: one bot's own pocket carried the deadline's collection - the crater's own seat (v0.758.0) prices the mass, the cast names its owner`
}

// (v0.777.0) THE WRITE-OFF'S OWN RIDERS - the bill's silence's own companion
// (the v0.774.0 riders precedent, zero re-parsing): a MEASURE, never a
// verdict-owner - the top two holders' concentration prices the shape the
// solo law refused to name (the bill's owner case leaves the companion
// unprinted - the decompose's own branch law). The order is deterministic
// (units desc, then the name's own - 'F17' < 'F7' byte-wise). Junk never
// invents a shape: a missing or empty book or fewer than two holders reads
// the honest silence (null).
export function writeOffRiders (rows) {
  const book = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === 'object' &&
    typeof r.bot === 'string' && r.bot && Number.isFinite(r.units) && r.units > 0)
  if (book.length < 2) return null
  const ranked = book.slice().sort((a, b) => b.units - a.units || (a.bot < b.bot ? -1 : 1))
  const leader = ranked[0]
  const runner = ranked[1]
  const pairUnits = leader.units + runner.units
  const total = book.reduce((a, r) => a + r.units, 0)
  return { leader: leader.bot, leaderUnits: leader.units, runner: runner.bot, runnerUnits: runner.units, total, pairUnits, share: +(pairUnits / total).toFixed(3) }
}

// (v0.777.0) the riders' own row - THE DUO'S OWN SEAT (the family's own
// tail): a measure of the shape, never a named owner. Junk never prints a
// shape (the honest silence's own row law).
export function writeOffRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderUnits, runner, runnerUnits, total, pairUnits, share } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderUnits) || leaderUnits <= 0 || !Number.isFinite(runnerUnits) || runnerUnits <= 0 ||
      !Number.isFinite(total) || total <= 0 || !Number.isFinite(pairUnits) || pairUnits > total ||
      !Number.isFinite(share)) return null
  return `the write-off's own riders (v0.777.0): no solo holder owns the majority - ${leader} x${leaderUnits}u + ${runner} x${runnerUnits}u own ${pairUnits} of ${total}u (${(share * 100).toFixed(1)}%) - THE DUO'S OWN SEAT: the bill's tie law held, the concentration is still real - the pair prices the pockets the solo law refused to name`
}

// (v0.803.0) THE ASK BOOK'S OWN SEAT - WHICH bot's own need owns the bank
// ask book. The flow-priced budgets row prices the extremes (granted max
// vs max need) and the per-bot tail lists every ask raw - but no row ever
// said WHICH bot's own need owns the book - the whale's share rode
// unnamed. THE SEAT LAW (the census's own budgets cells only, zero
// re-parsing - the v0.777.0 write-off cast's own shape, the v0.802.0
// orphan seat's own law): the strict-majority law, a solo bot owns the
// book only above half (a tie owns nothing); the book is the budgets' own
// needsS sum (the asks' own currency, seconds); junk never invents a bot
// (a missing or non-object cell, a non-string or empty bot, a non-finite
// or non-positive need reads the honest skip - the real cells still
// tally). The vocabulary is the census's own bot bytes - the ranked ties
// ride the name's own lexicographic law.
function budgetAskTally (budgets) {
  if (!Array.isArray(budgets)) return null
  const tallies = {}
  let book = 0
  for (const b of budgets) {
    const cell = b && typeof b === 'object' ? b : null
    if (!cell) continue
    const bot = cell.bot
    const need = cell.needsS
    if (typeof bot !== 'string' || bot.length === 0) continue
    if (!Number.isFinite(need) || need <= 0) continue
    book += need
    tallies[bot] = (tallies[bot] || 0) + need
  }
  return book > 0 ? { tallies, book } : null
}

// (v0.803.0) the ask book's own seat - the strict-majority law's verdict:
// the top bot owns the book only above half; a tie owns nothing (the
// honest null - the spread needs the riders, not a named owner). The byte
// order decides the scan (the bot's own bytes).
export function budgetAskSeat (budgets) {
  const tally = budgetAskTally(budgets)
  if (!tally) return null
  let topOwns = 0
  let topBot = null
  for (const [bot, n] of Object.entries(tally.tallies).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) {
    if (n > topOwns) { topOwns = n; topBot = bot }
  }
  if (topBot === null || topOwns <= tally.book - topOwns) return null
  return { bot: topBot, owns: topOwns, ofAsks: tally.book, shareOfAsks: +(topOwns / tally.book).toFixed(3) }
}

// (v0.803.0) the ask book's own row - THE ASK BOOK'S OWN SEAT: one bot's
// own need owns the bank ask book (the whale's own meter). Junk never
// prints a row (the honest silence's own row law): every field is guarded
// before the template speaks.
export function budgetAskSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { bot, owns, ofAsks, shareOfAsks } = seat
  if (typeof bot !== 'string' || !bot ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofAsks) || ofAsks <= 0 || owns > ofAsks ||
      !Number.isFinite(shareOfAsks)) return null
  return `the ask book's own seat (v0.803.0): ${bot} owns ${owns}s of ${ofAsks}s bank ask (${(shareOfAsks * 100).toFixed(1)}%) - THE ASK BOOK'S OWN SEAT: one bot's own need owns the bank ask book - the budgets row's extremes priced the clamp, the seat names the whale's own share`
}

// (v0.803.0) THE ASK BOOK'S OWN RIDERS - the seat's own silence's companion
// (the v0.802.0 riders precedent, zero re-parsing): a MEASURE, never a
// verdict-owner - the top two needs' concentration prices the shape the
// solo law refused to name (the seat's owner case leaves the companion
// unprinted - the decompose's own branch law). The order is deterministic
// (need desc, then the name's own - 'F11' < 'F8' byte-wise). Junk never
// invents a shape: a missing or empty book or fewer than two counted bots
// reads the honest silence (null).
export function budgetAskRiders (budgets) {
  const tally = budgetAskTally(budgets)
  if (!tally) return null
  const ranked = Object.entries(tally.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofAsks: tally.book, pairOwns, shareOfAsks: +(pairOwns / tally.book).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.803.0) the ask riders' own row - THE ASK BOOK'S OWN MIX: a measure
// of the shape, never a named owner (the seat's tie law holds); the pair
// prices the concentration the solo law refused to seat. Junk never
// prints a shape (the honest silence's own row law).
export function budgetAskRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofAsks, pairOwns, shareOfAsks } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofAsks) || ofAsks <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofAsks ||
      !Number.isFinite(shareOfAsks)) return null
  return `the ask book's own riders (v0.803.0): no solo bot owns the majority - ${leader} x${leaderOwns}s + ${runner} x${runnerOwns}s own ${pairOwns}s of ${ofAsks}s bank ask (${(shareOfAsks * 100).toFixed(1)}%) - THE ASK BOOK'S OWN MIX: the seat's tie law held, the spread is the shape - the bots' own needs price the ask book the solo law refused to seat`
}
