// (v0.54.0) THE POCKET LINE - the loot-conversion instrument.
//
// WHY: fleet 35566494961 named a 7% loot conversion (mined=1118, the fleet-wide
// pocket at t-0 held ~80 units) with NO instrument to say where the other 93%
// went. Candidates were named but unmeasurable: drops landing out of pickup
// range in the shaft, tool-upgrade consumption, consolidation losses. The 15s
// reporter carried only target-item counts (sand/gravel/dirt), not the whole
// pocket, and the final report had no pocket number at all - so the loss was
// invisible per tick and unreconstructable after the run.
//
// This module is that instrument, in two pure pieces:
//   - pocketTotals(miners): the fleet sum of inventory units and occupied
//     slots, one pair per reporter tick and in the final report. The TREND of
//     pocket against banked/mined splits the loss into "loot rides in pockets
//     but never banks" (the walk/chain side) vs "loot never reached the
//     pocket" (the dig->drop->pickup side).
//   - lootLedger({...}): mined units split into banked + smelted + pocket-now
//     + unaccounted. UNITS NOT BLOCKS: most stone-class blocks drop 1:1, but
//     gravel can drop flint and ores smelt to ingots - the ledger is a
//     measurement instrument with ~5-10% grain, not an exact balance.
//
// Pure arithmetic over plain shapes so CI tests every branch without a server.

// (v0.390.0) THE BANKABLE POCKET - the crafted-class surplus cure's pricing
// half. Face 19 (36802577873) priced the whale: the end pocket 495u held
// crafted-class 191u (38.6%) - stick 96u, oak_planks 70u, torch 12u - and the
// deposit's own KEEP list (deposit.mjs) can NEVER bank those units, while the
// bank-flow rate counts only BANKED units (a bankable-only pace). The flow
// pricing joined the two dishonestly: units-that-never-bank divided by a
// rate-that-only-banks (the v0.349.0 KEEP nuance, the scope law's named
// price). pocketTotals now splits the sum with the deposit's own predicate -
// the KEEP list passed in (the runner hands DEPOSIT_KEEP; ONE list, both
// sides), the substring classes byte for byte (name.includes(k)). Default
// keep=[] reads bankable===units (byte-identical legacy for every existing
// caller); junk keep lists read legacy too; a nameless item can match no
// KEEP class, so it counts bankable (un-KEEP-able by construction). The
// slot/kit truth stays raw: the reporter tick and the loot ledger keep
// units - the pricing joins (the flow clock, the deliverability arm, the
// gap row) read bankable.
/**
 * Fleet-wide pocket snapshot.
 * @param {Array<{bot?: {inventory?: {items?: Function}}}>} miners
 * @param {{keep?: string[]}} [opts] KEEP substring classes (deposit.mjs's own list; default [] = everything bankable)
 * @returns {{units: number, slots: number, bankable: number, kept: number}}
 */
export function pocketTotals (miners, { keep = [] } = {}) {
  const keepList = Array.isArray(keep) ? keep : []
  let units = 0
  let slots = 0
  let bankable = 0
  for (const m of (Array.isArray(miners) ? miners : [])) {
    try {
      const items = m?.bot?.inventory?.items?.()
      if (!Array.isArray(items)) continue
      for (const it of items) {
        // a torn view must not corrupt the sum: NaN/Infinity AND negative
        // counts are impossible data (a pocket cannot hold -5 units) - zeroed
        const c = it?.count
        const n = (Number.isFinite(c) && c > 0) ? c : 0
        units += n
        // the deposit's own predicate: a KEEP class rides IN the name
        // ('pickaxe' keeps wooden_pickaxe, 'cooked_' keeps cooked_beef)
        const name = typeof it?.name === 'string' ? it.name : ''
        const kept = keepList.some(k => typeof k === 'string' && k !== '' && name.includes(k))
        if (!kept) bankable += n
      }
      slots += items.length
    } catch { /* a torn window view on a dying bot counts as zero this tick */ }
  }
  return { units, slots, bankable, kept: units - bankable }
}

// (v0.302.0) THE WRITE-OFF'S FIRST LINE. Fleet 36517770723 (the v0.299.0
// field face) read pocket=1894u/265s at the deadline - banked=446 proved the
// famine era over, but the aggregate ledger never named WHO held the stake:
// F9's end-phase refused five bank windows ('pockets full, Ns left < 150s'),
// its one armed trip died 'bank fallback: none (budget exhausted)', and the
// cargo rode out with no end-of-run echo. pocketTotals sums the fleet; this
// row names the holders, desc by units, so the write-off class is attributable
// the way the sentry row (v0.195.0) made airGlitches attributable. ALWAYS
// printed - the none-form is a verdict too (the 05:00 ledger-skip lesson: an
// absent line class is indistinguishable from a filter blind spot).
export const WRITE_OFF_MIN_UNITS = 64

/**
 * The end-of-run per-bot write-off row.
 * @param {Array<{username?: string, bot?: {inventory?: {items?: Function}}}>} miners
 * @param {{minUnits?: number, whys?: Map<string, string>|Object<string, string>|null}} [opts]
 *   the stake floor (default one stack, 64); `whys` (v0.553.0) carries the class
 *   the end-phase already knew when it refused the chain (fleet19's finalBankWhys:
 *   'night' - the v0.140.1 hold, 'doom-latched') - the face reads the why instead
 *   of diving the log (fleet 37121182189's strand sat 3400 lines upstream of the
 *   truth). Only clean tokens ride (`/^[a-z0-9-]+$/` - the row never carries junk);
 *   absent/junk whys print the legacy byte form.
 * @returns {string} 'final write-off: F9 412u/6s, F6 308u/4s (the deadline pocket rode unbanked)'
 *   with the why riding the holder when known: 'F15 205u/12s night'
 *   or the none-verdict when every pocket sits under the floor
 */
export function writeOffRow (miners, { minUnits = WRITE_OFF_MIN_UNITS, whys = null } = {}) {
  const min = (Number.isFinite(minUnits) && minUnits > 0) ? Math.floor(minUnits) : WRITE_OFF_MIN_UNITS
  const whyBook = (whys instanceof Map) ? whys : (whys && typeof whys === 'object' ? new Map(Object.entries(whys)) : null)
  const whyFor = name => {
    if (!whyBook) return null
    let w = null
    try { w = whyBook.get(name) } catch { return null }
    return (typeof w === 'string' && /^[a-z0-9-]+$/.test(w)) ? w : null
  }
  const holders = []
  for (const m of (Array.isArray(miners) ? miners : [])) {
    try {
      const items = m?.bot?.inventory?.items?.()
      if (!Array.isArray(items)) continue
      let units = 0
      for (const it of items) {
        // the same junk law as pocketTotals: NaN/Infinity AND negative counts
        // are impossible data - zeroed, never a phantom stake
        const c = it?.count
        units += (Number.isFinite(c) && c > 0) ? c : 0
      }
      if (units >= min) holders.push({ name: m?.username || 'F?', units, slots: items.length })
    } catch { /* a torn window view on a dying bot holds nothing this read */ }
  }
  if (holders.length === 0) return `final write-off: none (every pocket under ${min} units)`
  // desc by units; the tie-break is the name so the row is byte-stable
  holders.sort((a, b) => (b.units - a.units) || (a.name < b.name ? -1 : 1))
  return `final write-off: ${holders.map(h => {
    const why = whyFor(h.name)
    return why ? `${h.name} ${h.units}u/${h.slots}s ${why}` : `${h.name} ${h.units}u/${h.slots}s`
  }).join(', ')} (the deadline pocket rode unbanked)`
}

/**
 * Where the mined yield ended up. Everything not visibly banked, smelted or
 * still pocketed is UNACCOUNTED - the 93% class, now a number per run.
 * Negative and fractional inputs are clamped to a sane integer floor (the
 * counters are sums of unit counts; a torn view must not push the ledger
 * negative).
 *
 * (v0.201.0) THE SURPLUS SIDE: over-accounting used to vanish behind the
 * Math.max(0, ...) clamp - run63 (fleet 36212235363) read as "unaccounted=0,
 * the ledger balances" to one decoder while ~396u of slack sat inside the
 * formula (accounted 3045 > mined 2649: pockets count crafted/collected units
 * the mined counter never tracks - sticks, planks, smelted ingots, the
 * grass_block->dirt grain). Two careful readers reached OPPOSITE verdicts on
 * the same run because the gap had no name on this side. The surplus is the
 * SAME gap, measured, so the ambiguity dies: unaccounted + surplus is always
 * the full |mined - accounted| distance.
 * @param {{mined?: number, banked?: number, smelted?: number, pocket?: number}} parts
 * @returns {{mined: number, accounted: number, unaccounted: number, surplus: number, conversion: number|null}}
 */
export function lootLedger ({ mined = 0, banked = 0, smelted = 0, pocket = 0 } = {}) {
  const m = Math.max(0, Math.floor(mined))
  const parts = [banked, smelted, pocket].map(p => Math.max(0, Math.floor(p)))
  const accounted = parts.reduce((a, b) => a + b, 0)
  const unaccounted = Math.max(0, m - accounted)
  const surplus = Math.max(0, accounted - m)
  const conversion = m > 0 ? accounted / m : null
  return { mined: m, accounted, unaccounted, surplus, conversion }
}

// (v0.317.0) THE BANKED-CRATER DECODE - the ledger line reads banked and
// pocket side by side but never JUDGES the pair. Fleet 36592026195 measured
// banked=83 with pocket=671u at deadline - 11.0% of the endgame loot reached
// chests (the crater both lanes flagged; the write-off row names the holders
// but not the scale of the failure, and the write-off units live INSIDE
// pocket - they explain the crater's face, not the bank chains' refusal).
// The verdict: share = banked / (banked + pocket), the fraction of
// loot-that-exists the bank chains landed. At or above the floor the banking
// works (silent - a healthy run needs no line); below it reads 'crater' with
// the exact numbers. Nothing exists -> nothing to name (a dead run reads its
// own way). Junk never invents a crater (the body-guard law - the
// Number(null) lesson seventh strike: Number(null)=0 would read a null
// ledger as a total crater).
export const BANK_CRATER_FLOOR_SHARE = 0.5

/**
 * The banked-crater verdict: did the endgame loot reach the chests?
 * Pure, junk-tolerant - null means 'healthy' or 'cannot tell'.
 * @param {{banked?: number|null, pocket?: number|null}} p
 * @returns {string|null} 'crater: ...' when the bank share is below the floor
 */
export function bankedCraterDecode (opts = {}) {
  const { banked = null, pocket = null } = opts || {}
  if (!Number.isFinite(banked) || !Number.isFinite(pocket)) return null
  if (banked < 0 || pocket < 0) return null
  const b = Math.floor(banked)
  const p = Math.floor(pocket)
  const mass = b + p
  if (mass === 0) return null
  const share = b / mass
  if (share >= BANK_CRATER_FLOOR_SHARE) return null
  return `crater: ${(share * 100).toFixed(1)}% of the endgame loot reached chests (banked ${b} of ${mass}u) - the bank chains are the bottleneck, the mines are not`
}

// (v0.318.0) THE UNACCOUNTED-MASS DECODE - the ledger line's last column
// never judged ITSELF. Fleet 36592026195 (the four-instrument face) read
// unaccounted=1948u of 2713 mined - 71.8% of the mined mass left the books
// unwatched while the crater decode (v0.317.0) judged only the
// banked/pocket pair (the loot-that-exists side, 754u - the gap is nearly
// three craters wide and no line sized it). The classic leaks were named in
// v0.54.0 but never measured against a floor: drops landing out of pickup
// range in the shaft, tool-upgrade consumption, consolidation losses. The
// verdict: share = unaccounted / mined. At or above the floor the leak
// speaks (the ledger grain is ~5-10%, so half the mass is no grain); below
// it the class stays quiet. The surplus side (accounted > mined) is the
// ledger line's own story (v0.201.0) - clamped to zero here, never a
// negative share. Junk never invents a mass (the body-guard law, same
// discipline as the crater decode).
export const UNACCOUNTED_FLOOR_SHARE = 0.5

/**
 * The unaccounted-mass verdict: how much of the mined mass left the books?
 * Pure, junk-tolerant - null means 'quiet' or 'cannot tell'.
 * @param {{mined?: number|null, banked?: number|null, smelted?: number|null, pocket?: number|null}} p
 * @returns {string|null} 'unaccounted: ...' when the gap crosses the floor
 */
export function unaccountedMassDecode (opts = {}) {
  const { mined = null, banked = null, smelted = null, pocket = null } = opts || {}
  const parts = [mined, banked, smelted, pocket]
  // a null ledger is not a zero ledger - Number(null)=0 would read an
  // unreadable run as a perfectly balanced one (the seventh-strike law)
  if (parts.some(x => !Number.isFinite(x) || x < 0)) return null
  const m = Math.floor(mined)
  if (m === 0) return null // nothing exists -> nothing to name
  const accounted = [banked, smelted, pocket].reduce((a, x) => a + Math.floor(x), 0)
  const unaccounted = Math.max(0, m - accounted)
  const share = unaccounted / m
  if (share < UNACCOUNTED_FLOOR_SHARE) return null
  return `unaccounted: ${(share * 100).toFixed(1)}% of the mined mass never reached the books (${unaccounted}u of ${m}) - the shaft drops, the tool spend and the consolidation own the leak`
}

// (v0.320.0) THE POCKET-ANATOMY ROW - the write-off row named the holders
// but never judged their SHAPE. Fleet 36606754498 (the latch's first face)
// read pocket=1349u spread across 8 stakes (top F14 182u = 13.5%) with the
// crater verdict saying 'the bank chains are the bottleneck' - but the shape
// was never measured, and the cure differs: a WHALE pocket (one holder owns
// a quarter or more of the unbanked mass) is one walk away from banking, a
// SPREAD pocket is the chains' failure no single walk cures. The row rides
// the same inventory walk as writeOffRow (the junk law: NaN/Infinity AND
// negative counts are impossible data - zeroed; a torn window view holds
// nothing this read). The total argument is the ledger's own pocket read
// (endPk.units) - when it is junk the holders' sum stands in, never a
// divided-by-zero. ALWAYS printed - the none-form is a verdict too (the
// 05:00 ledger-skip lesson).
export const POCKET_WHALE_SHARE = 0.25

/**
 * The deadline-pocket anatomy: whale or spread?
 * @param {Array<{username?: string, bot?: {inventory?: {items?: Function}}}>} miners
 * @param {{total?: number|null}} [opts] the ledger's pocket read (endPk.units)
 * @returns {string} the anatomy verdict, always speaks
 */
export function pocketAnatomyRow (miners, { total = null } = {}) {
  const holders = []
  for (const m of (Array.isArray(miners) ? miners : [])) {
    try {
      const items = m?.bot?.inventory?.items?.()
      if (!Array.isArray(items)) continue
      let units = 0
      for (const it of items) {
        const c = it?.count
        units += (Number.isFinite(c) && c > 0) ? c : 0
      }
      if (units > 0) holders.push({ name: m?.username || 'F?', units })
    } catch { /* a torn window view on a dying bot holds nothing this read */ }
  }
  if (holders.length === 0) return 'pocket anatomy: none (no pocket exists at the deadline)'
  holders.sort((a, b) => (b.units - a.units) || (a.name < b.name ? -1 : 1))
  const t = (Number.isFinite(total) && total > 0) ? total : holders.reduce((a, h) => a + h.units, 0)
  const top = holders[0]
  const share = top.units / t
  const pct = (share * 100).toFixed(1)
  if (share >= POCKET_WHALE_SHARE) {
    return `pocket anatomy: whale ${top.name} ${top.units}u = ${pct}% of the unbanked ${t}u (${holders.length} holder${holders.length > 1 ? 's' : ''}) - one walk owns the crater's face`
  }
  return `pocket anatomy: spread across ${holders.length} holders, top ${top.name} ${top.units}u = ${pct}% of ${t}u - the chains own the crater's face, no single walk cures it`
}

// (v0.322.0) THE SURPLUS-FACE ROW - the ledger's surplus column never had a
// FACE. Fleet 36617588210 (THE LANDMARK) read the ledger's first balance:
// mined=2238, banked=2295, smelted=49, pocket=425u, unaccounted=0, surplus=531u
// (conversion 123.7%) - and v0.201.0 named the hypothesis a decade of fires
// ago: pockets count crafted/collected units the mined counter never tracks
// (sticks, planks, smelted ingots, the grass_block->dirt grain) - but the
// inflow was never measured by name, so the surplus stayed a faceless number
// and the "crafted inflow" theory untestable. The row splits the DEADLINE
// POCKET by source class (crafted: sticks/planks/ingots/torches/... vs the
// mined-class rest) and names the top flows - the pocket is the only place
// item NAMES are readable at the deadline (the chests are not re-read), so
// this is the surplus's visible face, not a full attribution (the banks and
// the smelt flow hold their share; the row says so, it does not guess it).
// Same inventory walk as the anatomy row (the junk law: NaN/Infinity AND
// negative counts zeroed, a torn window view holds nothing this read); a
// nameless stack reads as 'unclassified' mined-class - the total stays
// consistent with the ledger's pocket read. ALWAYS printed - the none-form
// is a verdict too (the 05:00 ledger-skip lesson).
export const SURPLUS_FACE_TOP = 3

// the crafted class: exact names the fleet only crafts (never mines) plus the
// suffix families. Conservative on purpose - the row is a measurement
// instrument with grain, and a mined item wrongly called crafted poisons the
// split (coal_block is mined AND craftable - it stays out; blaze_rod is a mob
// drop - mined-class on this fleet's books).
const CRAFTED_CLASS_EXACT = new Set(['stick', 'torch', 'ladder', 'chest', 'crafting_table', 'furnace', 'charcoal'])

/**
 * Is this item name the crafted/collected class the mined counter never tracks?
 * @param {string} name
 * @returns {boolean}
 */
export function isCraftedClassName (name) {
  if (typeof name !== 'string' || name === '') return false
  if (CRAFTED_CLASS_EXACT.has(name)) return true
  return name.endsWith('_planks') || name.endsWith('_ingot')
}

/**
 * The surplus's face: what part of the deadline pocket is crafted-class mass?
 * @param {Array<{bot?: {inventory?: {items?: Function}}}>} miners
 * @param {{surplus?: number|null}} [opts] the ledger's own surplus read
 * @returns {string} the face verdict, always speaks
 */
export function surplusFaceRow (miners, { surplus = null } = {}) {
  const byName = new Map()
  for (const m of (Array.isArray(miners) ? miners : [])) {
    try {
      const items = m?.bot?.inventory?.items?.()
      if (!Array.isArray(items)) continue
      for (const it of items) {
        // the junk law: impossible counts are zeroed, never a phantom flow
        const c = it?.count
        const units = (Number.isFinite(c) && c > 0) ? c : 0
        if (units === 0) continue
        // a nameless stack cannot be classified - it reads as unclassified
        // mined-class mass so the row's total stays consistent with the ledger
        const n = (typeof it?.name === 'string' && it.name !== '') ? it.name : 'unclassified'
        byName.set(n, (byName.get(n) || 0) + units)
      }
    } catch { /* a torn window view on a dying bot holds nothing this read */ }
  }
  const total = [...byName.values()].reduce((a, b) => a + b, 0)
  if (total === 0) return 'surplus face: none (no pocket exists at the deadline)'
  const flows = []
  let cu = 0
  for (const [name, units] of byName) {
    if (isCraftedClassName(name)) { flows.push({ name, units }); cu += units }
  }
  const pct = ((cu / total) * 100).toFixed(1)
  const sNote = (Number.isFinite(surplus) && Math.floor(surplus) > 0) ? ` (surplus ${Math.floor(surplus)}u)` : ''
  if (flows.length === 0) {
    return `surplus face: crafted-class 0u of ${total}u pocket - the pocket is pure mined-class mass, the surplus's face is not in the pockets${sNote}`
  }
  // desc by units; the tie-break is the name so the row is byte-stable
  flows.sort((a, b) => (b.units - a.units) || (a.name < b.name ? -1 : 1))
  const top = flows.slice(0, SURPLUS_FACE_TOP).map(f => `${f.name} ${f.units}u`).join(', ')
  return `surplus face: crafted-class ${cu}u of ${total}u pocket (${pct}%), top ${top} - the mined counter never saw these units${sNote}`
}

// (v0.323.0) THE BANK-FLOW ROW - the crater's FEASIBILITY was never priced.
// Fleet 36626921875 (the first pocket-anatomy face) read crater 41.3% with
// the partials showing the wound's motion: the pocket sat ~1639u/240s through
// the endgame while banked crept 1117->1154 across the final ~75s - the bank
// chains were ALIVE but their mass-flow rate was never measured, so no line
// could say whether the deadline's write-off was a cadence short or a
// cadence hopeless. The row prices the flow: rate = (last banked - first
// banked) / (last t - first t) over the caller's sample window, and the
// pocket's own read (endPk.units) becomes the seconds the flow still owes -
// 'the 1639u pocket needs Ns past the deadline' at the measured rate (the
// number the endgame bank-cadence front needs to separate a slow chain from
// a dead one). Samples ride the partial reporter's tick; the caller owns the
// window (the wiring passes the endgame tail, not the whole run). Junk law:
// non-finite/negative t or banked are impossible data - skipped; a
// non-monotone t cannot make a window - skipped; fewer than two valid
// samples read 'none' (an absent cadence is a verdict too - the 05:00
// ledger-skip lesson). ALWAYS printed.
export const BANK_FLOW_MIN_SAMPLES = 2

// (v0.559.0) THE DISPLAY FLOOR - the rate under which the face reads '0.0'.
// A rate below this never prices a pocket tail: the seconds would claim a
// precision the face itself denies (fleet 37128927104: '+4u over 285s'
// displayed '0.0u/s' while the tail priced 'needs 62914s past the deadline'
// and the gap row echoed '42379s short at 0.0u/s' - both numbers computed at
// a hidden 0.014u/s the face never showed, a phantom pricing). The trickle
// joins the stood-still class - the sibling rows share this one constant so
// the two faces can never disagree about the arithmetic they price (the
// sibling-shape law, kept by construction).
export const BANK_FLOW_DISPLAY_FLOOR = 0.05

/**
 * The endgame bank-flow verdict: at what rate did the chains move mass?
 * @param {Array<{t?: number, banked?: number}>} samples the cadence series
 * @param {{pocketUnits?: number|null}} [opts] the ledger's pocket read (endPk.units)
 * @returns {string} the flow verdict, always speaks
 */
export function bankFlowRow (samples, { pocketUnits = null } = {}) {
  const good = []
  for (const s of (Array.isArray(samples) ? samples : [])) {
    const t = s?.t
    const b = s?.banked
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(b) || b < 0) continue
    if (good.length > 0 && t <= good[good.length - 1].t) continue // a non-monotone t cannot make a window
    good.push({ t: Math.floor(t), b: Math.floor(b) })
  }
  if (good.length < BANK_FLOW_MIN_SAMPLES) return 'bank flow: none (no cadence series this read)'
  const first = good[0]
  const last = good[good.length - 1]
  const span = last.t - first.t
  const delta = last.b - first.b
  if (span <= 0) return 'bank flow: none (no cadence series this read)'
  const rate = delta / span
  // (v0.559.0) THE DISPLAY FLOOR LAW - a trickle is a still chain at face
  // value: the delta is printed right here ('+4u'), the verdict names the
  // flow's practical truth, and the phantom tail ('needs 62914s' priced at a
  // rate the face displays as 0.0) never prints again.
  if (delta <= 0 || (rate > 0 && rate < BANK_FLOW_DISPLAY_FLOOR)) {
    return `bank flow: 0.0u/s (banked +${delta}u over ${span}s) - the chains stood still`
  }
  // the pocket tail needs a living flow - a still chain owes Infinity seconds,
  // which is the verdict's own shape (no tail on the stood-still form)
  const pNote = (Number.isFinite(pocketUnits) && Math.floor(pocketUnits) > 0)
    ? ` - the ${Math.floor(pocketUnits)}u pocket needs ${Math.ceil(Math.floor(pocketUnits) / rate)}s past the deadline`
    : ''
  return `bank flow: ${rate.toFixed(1)}u/s (banked +${delta}u over ${span}s)${pNote}`
}

// (v0.328.0) THE BANK-BUDGET GAP ROW - the flow row (v0.323.0) prices the
// pocket's NEED ('needs 322s past the deadline', face 36640056641) but the
// budget side never prints: END_BANK_BUDGET lives in the fleet's head (the
// v0.27.0 150s chain clock) and no line judges one against the other, so a
// miner cannot tell whether 322s is a scandal or slack. THE ROW prices the
// same window at the same rate (the sibling-shape law: same sample filter,
// same unrounded rate, the same ceil on the need - the two rows must never
// disagree about the arithmetic they share); the verdict speaks only when the
// need EXCEEDS the budget (the leanness law - a covered pocket is a healthy
// run, silence is its shape); junk never prices a clock (the body-guard law:
// a junk pocket has no need, a negative budget is impossible config, a stood
// -still or empty series is the flow row's story, told there). Pure: reads,
// never mutates.
export const BANK_GAP_MIN_BUDGET_MS = 0

/**
 * Price the end-bank budget against the pocket's measured need.
 * @param {Array<{t?: number, banked?: number}>|null} samples
 * @param {{pocketUnits?: number|null, budgetMs?: number|null}} opts
 * @returns {string|null} 'bank budget gap: ...' when the need outruns the budget
 */
export function bankBudgetGapRow (samples, { pocketUnits = null, budgetMs = null } = {}) {
  if (!Number.isFinite(budgetMs) || budgetMs < BANK_GAP_MIN_BUDGET_MS) return null
  if (!Number.isFinite(pocketUnits) || Math.floor(pocketUnits) <= 0) return null
  const good = []
  for (const s of (Array.isArray(samples) ? samples : [])) {
    const t = s?.t
    const b = s?.banked
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(b) || b < 0) continue
    if (good.length > 0 && t <= good[good.length - 1].t) continue // a non-monotone t cannot make a window
    good.push({ t: Math.floor(t), b: Math.floor(b) })
  }
  if (good.length < BANK_FLOW_MIN_SAMPLES) return null
  const span = good[good.length - 1].t - good[0].t
  const delta = good[good.length - 1].b - good[0].b
  if (span <= 0 || delta <= 0) return null // none / stood-still is the flow row's story
  const rate = delta / span
  // (v0.559.0) THE DISPLAY FLOOR LAW - the trickle joins the stood-still
  // class (the same BANK_FLOW_DISPLAY_FLOOR the flow row routes by): a
  // shortage priced at a hidden 0.014u/s while the face reads '0.0u/s' is
  // the phantom pricing the sibling rows must never split on (fleet
  // 37128927104: '42379s short at 0.0u/s' - the number is gone, the still
  // verdict is the flow row's story again).
  if (rate < BANK_FLOW_DISPLAY_FLOOR) return null
  const need = Math.ceil(Math.floor(pocketUnits) / rate)
  const budget = Math.floor(budgetMs / 1000)
  if (need <= budget) return null // the <= law: at the budget the chains fit
  return `bank budget gap: ${need}s needed, ${budget}s budgeted - ${need - budget}s short at ${rate.toFixed(1)}u/s - the end bank chains outran the clock`
}

// (v0.324.0) THE BANK-ATTRIBUTION ROW - banked was a fleet number with no
// NAMES. Fleet 36631612575 (the first surplus-face face) healed the crater
// (66.1% bank share, the decode silent) but the anatomy row flipped to WHALE:
// F12 220u = 31.1% of the unbanked 707u - 'one walk owns the crater's face' -
// and F12 is the same bot the no-chest front names. The per-bot counters
// already saw every deposit (stats.banked, the v0.9.0 deposit ledger), but no
// line attributed them: who actually carried the fleet's banking, and who
// sits STRANDED - banked zero while holding a live pocket at the deadline.
// The row names both: the top depositors (the chains that work) and the
// stranded holders (the walk that never delivered - the whale-walk cure's
// exact target). Same inventory walk as the write-off row (the junk law:
// impossible counts zeroed, a torn window view holds nothing this read); a
// junk banked counter reads zero (never a phantom depositor); a pocket under
// the write-off floor is not stranded (the healthy lean pocket stays quiet -
// the v0.181.0 cadence shape). The sum stays the counters' own sum - the row
// attributes, it does not reconcile the ledger (the tithe and sweep flows
// deposit outside stats.banked; that share rides unattributed on purpose).
// ALWAYS printed - the none-form is a verdict too (the 05:00 ledger-skip
// lesson).
export const BANK_ATTRIBUTION_TOP = 3

/**
 * Who banked, and who is stranded with a live pocket?
 * @param {Array<{username?: string, stats?: {banked?: number}, bot?: {inventory?: {items?: Function}}}>} miners
 * @param {{minUnits?: number, whys?: Map<string, string>|Object<string, string>|null}} [opts]
 *   the stranded-pocket floor (default one stack, 64); `whys` (v0.554.0) is the
 *   same book writeOffRow reads (fleet19's finalBankWhys) - a strand the end-phase
 *   REFUSED (night hold, doom latch) never walked, so the legacy tail 'the walk
 *   never delivered' lied for it (fleet 37121182189: F15/F10/F12 rode the night
 *   hold, zero walks armed). When the why book explains EVERY stranded holder the
 *   tail names the classes ('- the strand rode night'); otherwise the legacy tail
 *   stands and the per-holder why tokens carry the held ones. Same token law as
 *   writeOffRow: only /^[a-z0-9-]+$/ rides, junk never lands on the face.
 * @returns {string} the attribution verdict, always speaks
 */
export function bankAttributionRow (miners, { minUnits = WRITE_OFF_MIN_UNITS, whys = null } = {}) {
  const min = (Number.isFinite(minUnits) && minUnits > 0) ? Math.floor(minUnits) : WRITE_OFF_MIN_UNITS
  const whyBook = (whys instanceof Map) ? whys : (whys && typeof whys === 'object' ? new Map(Object.entries(whys)) : null)
  const whyFor = name => {
    if (!whyBook) return null
    let w = null
    try { w = whyBook.get(name) } catch { return null }
    return (typeof w === 'string' && /^[a-z0-9-]+$/.test(w)) ? w : null
  }
  const depositors = []
  const stranded = []
  for (const m of (Array.isArray(miners) ? miners : [])) {
    // the banked counter rides stats, not the inventory window - a torn view
    // must not erase a bot's deposits from the attribution
    const raw = m?.stats?.banked
    const banked = (Number.isFinite(raw) && raw > 0) ? Math.floor(raw) : 0
    let pocket = 0
    try {
      const items = m?.bot?.inventory?.items?.()
      if (Array.isArray(items)) {
        for (const it of items) {
          const c = it?.count
          pocket += (Number.isFinite(c) && c > 0) ? c : 0
        }
      }
    } catch { /* a torn window view on a dying bot holds nothing this read */ }
    const name = m?.username || 'F?'
    if (banked > 0) depositors.push({ name, banked })
    if (banked === 0 && pocket >= min) stranded.push({ name, pocket })
  }
  // desc, the tie-break is the name so the row is byte-stable
  depositors.sort((a, b) => (b.banked - a.banked) || (a.name < b.name ? -1 : 1))
  stranded.sort((a, b) => (b.pocket - a.pocket) || (a.name < b.name ? -1 : 1))
  if (depositors.length === 0 && stranded.length === 0) {
    return 'bank attribution: none (no banked units this run)'
  }
  const strandForm = s => {
    const why = whyFor(s.name)
    return why ? `${s.name} 0u/${s.pocket}u pocket ${why}` : `${s.name} 0u/${s.pocket}u pocket`
  }
  const strandTail = () => {
    // the honest tail: a strand the end-phase refused never walked - the legacy
    // verdict may only claim 'the walk never delivered' when NO why explains
    // the stranding; a fully-explained strand names its classes (byte-stable:
    // distinct tokens, alphabetical, '+'-joined)
    const explained = stranded.filter(s => whyFor(s.name)).length
    if (explained === 0) return '- the walk never delivered'
    if (explained === stranded.length) {
      return `- the strand rode ${[...new Set(stranded.map(s => whyFor(s.name)))].sort().join('+')}`
    }
    return '- the walk never delivered (the held strands name their why)'
  }
  const top = depositors.slice(0, BANK_ATTRIBUTION_TOP).map(d => `${d.name} ${d.banked}u`).join(', ')
  if (depositors.length === 0) {
    // the stranded-only form keeps its legacy byte shape; the why rides as a
    // suffix when the book knows the strand (v0.554.0)
    return `bank attribution: none deposited - stranded with pockets: ${stranded.map(s => {
      const why = whyFor(s.name)
      return why ? `${s.name} ${s.pocket}u ${why}` : `${s.name} ${s.pocket}u`
    }).join(', ')}`
  }
  let v = `bank attribution: top ${top}`
  if (stranded.length > 0) {
    v += `; stranded: ${stranded.map(strandForm).join(', ')} ${strandTail()}`
  }
  return v
}

// (v0.330.0) THE FINAL-BANK DOOM CENSUS - the attribution row names the
// stranded walkers ('the walk never delivered') but their WHY lives in
// scattered 'final bank: 0 (still underground...)' verdicts and the v0.316.0
// doom latch's closure counter, invisible to the report. The census sums the
// failed shaft-bottom climb cycles per walker (the latch's own input - each
// cycle re-pays fenced climbs on the same bottom): a latched bot's worth of
// mass (DOOM_CENSUS_MIN_CYCLES 3, the latch's own trip point - the grain law)
// gets its anatomy. Same shape as the rescue-hole row: LOCAL when one shaft
// bottom owns the strand (top >= DOOM_CENSUS_LOCAL_SHARE 0.5), SPREAD when the
// climb tax is fleet-wide. A strand without climb failures stays silent here -
// the census reads the doom class, not every strand's cause. Junk counts never
// enter the census (the body-guard law); a healthy run prints nothing (the
// leanness law).
export const DOOM_CENSUS_MIN_CYCLES = 3
export const DOOM_CENSUS_LOCAL_SHARE = 0.5

export function doomCensusRow (entries) {
  const holders = []
  let total = 0
  for (const e of (Array.isArray(entries) ? entries : [])) {
    const raw = e?.cycles
    const cycles = (Number.isFinite(raw) && raw > 0) ? Math.floor(raw) : 0
    if (cycles <= 0) continue
    holders.push({ name: e?.name || '?', cycles })
    total += cycles
  }
  if (total < DOOM_CENSUS_MIN_CYCLES) return null
  holders.sort((a, b) => (b.cycles - a.cycles) || (a.name < b.name ? -1 : 1))
  const top = holders[0]
  const pct = ((top.cycles / total) * 100).toFixed(1)
  if (top.cycles / total >= DOOM_CENSUS_LOCAL_SHARE) {
    return `final bank doom census: local - ${top.name} carries ${top.cycles} of ${total} failed climb cycles (${pct}%) - the shaft bottom owns the strand`
  }
  return `final bank doom census: spread - top ${top.name} carries ${top.cycles} of ${total} failed climb cycles (${pct}%) - the strand is a fleet-wide climb tax`
}

// (v0.336.0) THE DOOM-WHY CLASSIFIER - the census names WHO carries the
// failed climb cycles, this names WHY each cycle failed. climbOut's reason
// strings are decorated at the call sites ('timeout (fenced at 90s - the
// chain keeps its reserve)'), so the class rides a keyword include, not an
// equality. Junk (undefined, numbers, an empty string) falls to 'other' - a
// reason that never names a class is still a cycle (the body-guard law: the
// count is the truth, the class is the read). The classes are the face's own
// taxonomy: stalled 3, wet wall 3, low-o2 1 (36660134341 - the oxygen class
// the ladder never named before that run).
export function climbWhyClass (reason) {
  const s = String(reason ?? '').toLowerCase()
  if (s.includes('stalled')) return 'stalled'
  if (s.includes('wet wall')) return 'wet wall'
  // (v0.558.0) THE SENTINEL CLASS - the wet family's second member joins the
  // row's taxonomy. Fleet 37121182189's face read 'other carries 2 of 4 failed
  // climb cycles (50.0%) - one class owns the tax' while both cycles were F15's
  // 'wet-sentinel' refusals - the o2-watch guard the mover's own classifier has
  // named since v0.379.0 (climbout.mjs), a family the row sat blind to. A known
  // family must never ride 'other': the tax names its owner or the census lies
  // by omission (the v0.554.0 lesson, the silent strand's shape, one row up).
  if (s.includes('wet-sentinel')) return 'wet-sentinel'
  if (s.includes('low-o2')) return 'low-o2'
  if (s.includes('timeout')) return 'timeout'
  // (v0.556.0) THE UNREACHABLE CLASS - the chain-refuse reasons joined the
  // taxonomy (fleet 37125612065: F14 rode 'chest unreachable (budget
  // exhausted (walk floor))'). ROOT CAUSE FIRST: a reason carrying BOTH
  // 'unreachable' and 'exhausted' is an unreachable chest that burned its
  // budget trying - the exhaustion is the messenger, not the cause.
  if (s.includes('unreachable') || s.includes('no path')) return 'unreachable'
  if (s.includes('exhausted')) return 'exhausted'
  if (s.includes('stopped')) return 'stopped'
  return 'other'
}

// (v0.556.0) THE WHY-BOOK TOKEN - the taxonomy class reshaped to the why
// book's token law (/^[a-z0-9-]+$/, the same law the write-off and
// attribution rows enforce at read time). 'other' never rides: a named-
// nothing is the legacy silence by another name. Spaced classes hyphenate
// ('wet wall' -> 'wet-wall') so a KNOWN class never drops off the strand
// by token accident - the v0.554.0 lesson (a silent strand is the lie of
// omission). Uppercase/junk fails the law and stays null (defense in
// depth: climbWhyClass lowercases first, but the helper never trusts it).
export function whyBookToken (cls) {
  if (typeof cls !== 'string') return null // a bare number rides 'low-o2''s law - junk, never a class
  const s = cls.trim()
  if (!s || s === 'other') return null
  const tok = s.replace(/\s+/g, '-')
  return /^[a-z0-9-]+$/.test(tok) ? tok : null
}

// (v0.336.0) THE DOOM-WHY ROW - the census's WHY side: the same failed climb
// cycles the census summed per WALKER, summed per FAILURE CLASS. The same
// grain floor as the census (DOOM_CENSUS_MIN_CYCLES - the latch's own trip
// point, the grain law), the same half boundary (DOOM_CENSUS_LOCAL_SHARE),
// the same leanness law (a healthy run prints nothing), byte-stable ties
// (cycles desc, class asc). Face 36660134341's datum: 'spread - stalled 3,
// wet wall 3, low-o2 1 of 7 failed climb cycles - the tax splits 3 ways' -
// neither head is a whale, so the cure is a fleet-wide one (the grind and
// the water, not one broken bot).
export function doomWhyRow (entries) {
  const classes = []
  let total = 0
  for (const e of (Array.isArray(entries) ? entries : [])) {
    const raw = e?.cycles
    const cycles = (Number.isFinite(raw) && raw > 0) ? Math.floor(raw) : 0
    if (cycles <= 0) continue
    classes.push({ cls: String(e?.cls || '').trim() || '?', cycles })
    total += cycles
  }
  if (total < DOOM_CENSUS_MIN_CYCLES) return null
  classes.sort((a, b) => (b.cycles - a.cycles) || (a.cls < b.cls ? -1 : 1))
  const top = classes[0]
  const pct = ((top.cycles / total) * 100).toFixed(1)
  if (top.cycles / total >= DOOM_CENSUS_LOCAL_SHARE) {
    return `final bank doom why: local - ${top.cls} carries ${top.cycles} of ${total} failed climb cycles (${pct}%) - one class owns the tax`
  }
  const list = classes.map(c => `${c.cls} ${c.cycles}`).join(', ')
  return `final bank doom why: spread - ${list} of ${total} failed climb cycles - the tax splits ${classes.length} ways`
}

// (v0.563.0) THE DOOM-OWNER ROW - the crater census map. The census names the
// top WALKER overall, the why row names the dominant CLASS overall, and the
// face never read who owns THAT class (fleet 37130962121: 'stalled carries 14
// of 27 failed climb cycles (51.9%) - one class owns the tax' while the split
// inside the stalled 14 rode silent). The cure differs by shape - a top owner
// at half the class points at one walker's own path, a spread points at the
// fleet-wide grind - the pocket-anatomy lesson, one grain deeper. Fed from the
// CLASS|WALKER composite ledger (one seat, one increment - the same failed
// cycles the two sibling rows read, so the dominant class agrees with the why
// row by construction). The siblings' own laws hold: the grain floor
// (DOOM_CENSUS_MIN_CYCLES), the half boundary (DOOM_CENSUS_LOCAL_SHARE), the
// byte-stable ties (cycles desc, name asc inside the class), the leanness law
// (a healthy run prints nothing).
export function doomOwnerRow (entries) {
  const pairs = []
  let total = 0
  for (const e of (Array.isArray(entries) ? entries : [])) {
    const raw = e?.cycles
    const cycles = (Number.isFinite(raw) && raw > 0) ? Math.floor(raw) : 0
    if (cycles <= 0) continue
    pairs.push({ cls: String(e?.cls || '').trim() || '?', name: String(e?.name || '').trim() || '?', cycles })
    total += cycles
  }
  if (total < DOOM_CENSUS_MIN_CYCLES) return null
  const byClass = new Map()
  for (const p of pairs) byClass.set(p.cls, (byClass.get(p.cls) || 0) + p.cycles)
  // the why row's own reduction and tie law - the dominant class never
  // splits between the siblings
  const classes = [...byClass].map(([cls, cycles]) => ({ cls, cycles }))
    .sort((a, b) => (b.cycles - a.cycles) || (a.cls < b.cls ? -1 : 1))
  const topClass = classes[0]
  const walkers = pairs.filter(p => p.cls === topClass.cls)
    .sort((a, b) => (b.cycles - a.cycles) || (a.name < b.name ? -1 : 1))
  const top = walkers[0]
  const pct = ((top.cycles / topClass.cycles) * 100).toFixed(1)
  const shape = top.cycles / topClass.cycles >= DOOM_CENSUS_LOCAL_SHARE
    ? "one walker owns the class - the cure is that walker's own path"
    : 'the class spreads across the walkers - the cure stays fleet-wide'
  return `final bank doom owner: ${topClass.cls}'s top walker ${top.name} ${top.cycles} of ${topClass.cycles} (${pct}% of the class) - ${shape}`
}

// (v0.565.0) THE RECONNECT CENSUS - the stats line's reconnects= is a fleet
// number with no owners (fleet 37134090209: reconnects=43 across 19 bots and
// no line read WHO re-linked). Each reconnect is a mining stall plus a full
// bot re-bootstrap; a bot that owns the churn (a lying sensor, a bad net
// path, a poison spawn) is a targeted cure, a fleet-wide churn is the
// server's own storm (fleet #129's tick storms - the stats line alone cannot
// tell the two apart). The doom census's own laws hold: the grain floor
// (RECONNECT_CENSUS_MIN - below this the churn is noise, not a stake), the
// half boundary (RECONNECT_CENSUS_LOCAL_SHARE - the census law's 0.5), the
// byte-stable ties (count desc, name asc), the leanness law (a healthy run
// prints nothing).
export const RECONNECT_CENSUS_MIN = 3
export const RECONNECT_CENSUS_LOCAL_SHARE = 0.5

export function reconnectCensusRow (entries) {
  const holders = []
  let total = 0
  for (const e of (Array.isArray(entries) ? entries : [])) {
    const raw = e?.count
    const count = (Number.isFinite(raw) && raw > 0) ? Math.floor(raw) : 0
    if (count <= 0) continue
    holders.push({ name: String(e?.name || '').trim() || '?', count })
    total += count
  }
  if (total < RECONNECT_CENSUS_MIN) return null
  holders.sort((a, b) => (b.count - a.count) || (a.name < b.name ? -1 : 1))
  const top = holders[0]
  const pct = ((top.count / total) * 100).toFixed(1)
  if (top.count / total >= RECONNECT_CENSUS_LOCAL_SHARE) {
    return `reconnect census: local - ${top.name} carries ${top.count} of ${total} reconnects (${pct}%) - one link owns the churn`
  }
  return `reconnect census: spread - top ${top.name} carries ${top.count} of ${total} reconnects (${pct}%) - the churn is fleet-wide`
}
