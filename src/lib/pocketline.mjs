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

/**
 * Fleet-wide pocket snapshot.
 * @param {Array<{bot?: {inventory?: {items?: Function}}}>} miners
 * @returns {{units: number, slots: number}}
 */
export function pocketTotals (miners) {
  let units = 0
  let slots = 0
  for (const m of (Array.isArray(miners) ? miners : [])) {
    try {
      const items = m?.bot?.inventory?.items?.()
      if (!Array.isArray(items)) continue
      for (const it of items) {
        // a torn view must not corrupt the sum: NaN/Infinity AND negative
        // counts are impossible data (a pocket cannot hold -5 units) - zeroed
        const c = it?.count
        units += (Number.isFinite(c) && c > 0) ? c : 0
      }
      slots += items.length
    } catch { /* a torn window view on a dying bot counts as zero this tick */ }
  }
  return { units, slots }
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
 * @param {{minUnits?: number}} [opts] the stake floor (default one stack, 64)
 * @returns {string} 'final write-off: F9 412u/6s, F6 308u/4s (the deadline pocket rode unbanked)'
 *   or the none-verdict when every pocket sits under the floor
 */
export function writeOffRow (miners, { minUnits = WRITE_OFF_MIN_UNITS } = {}) {
  const min = (Number.isFinite(minUnits) && minUnits > 0) ? Math.floor(minUnits) : WRITE_OFF_MIN_UNITS
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
  return `final write-off: ${holders.map(h => `${h.name} ${h.units}u/${h.slots}s`).join(', ')} (the deadline pocket rode unbanked)`
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

// (v0.321.0) THE SURPLUS-FACE ROW - the ledger's surplus column never had a
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
