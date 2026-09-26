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
