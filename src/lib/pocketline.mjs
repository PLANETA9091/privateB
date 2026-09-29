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
