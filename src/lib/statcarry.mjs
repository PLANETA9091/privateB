import { WATER_NAMES, o2SensorLabel } from './drowning.mjs'
// Per-bot stat survival across reconnects (v0.18.9).
//
// WHY: fleet19's runBot loop recreates the miner on every reconnect (a kick or
// an ECONNRESET ends the old bot object), and the fresh miner starts with ZERO
// counters. The reporter reads miner.stats directly, so every server-tick storm
// REWROTE HISTORY: fleet #129 (f75042c) showed mined 854 -> 620 -> 120 across
// two storms and reported 0.26 blocks/s for a run whose real pace before the
// first storm was 3.6 b/s. Diagnosing sessions kept reading the final number
// and burning time on a production crash that never happened.
//
// The fix is a per-bot CARRY: when an attempt ends, snapshot the counters that
// accumulated so far; when the next miner is created, seed those counters back
// in. Only MONOTONE counters travel (see CARRY_FIELDS - shaftEntryY is a
// coordinate and startedAt is a timestamp; neither may be summed) plus the
// byName mined-block histogram, merged additively.
//
// (v0.293.0) THE SWEEP CENSUS CARRY - the carry had a second mortality gap and
// face 36476752446 read it live. F7's stance step CONVERTED this face (armed
// dist 2.4 -> landed dist 0.9, `the cut took the column (dug 0 seal cell(s) +
// the support)` - a legal dy-1 shake-only conversion) - and the fleet row read
// `step=0 stepcut=0`. THE ANATOMY: line 822 - F7 was blown up by a Creeper
// minutes later; the respawn rebuilt the miner and the v0.18.9 carry moved
// only CARRY_FIELDS + byName - stats.sweepDrops (the v0.203.0 census view the
// whole stance/drop program is judged by: step=/stepcut=/cut=/seal=/ngap=)
// is NOT a CARRY_FIELD, so every bot death ORPHANS its sweep census. The
// cures of five versions were being judged by a census that loses a bot's
// whole contribution on every death (reconnects=8 this face). THE CURE: the
// sweepDrops view rides the carry - snapshotStats picks its numeric >0
// fields, seedStats sums them onto the fresh miner's view, creating the FULL
// zeroed view when absent (the miner's ride reads `stats.sweepDrops ??
// (stats.sweepDrops = {...})` - a PARTIAL view would skip the default init
// and turn the first `sd.sweeps++` into NaN; the seed must always build the
// whole shape). All 20 fields are monotone counters - nothing coordinate or
// timestamp-shaped lives in the view. The seed-then-snapshot law is
// unchanged (absolute totals, never merged twice).
export const CARRY_FIELDS = [
  'mined', 'failed', 'skipped', 'flyFails', 'hookCalls', 'hookFails',
  'mapTrips', 'mapRecords', 'banked', 'planted', 'torched', 'fights',
  'climbs', 'shelters', 'rescues', 'airGlitches', 'claims', 'deaths',
  // (v0.357.0) THE WET-RESCUE CARRY - born inside the list (the v0.346.0
  // lesson byte for byte): a relog mid-wet-rescue must not orphan the wet
  // share the storm verdict excludes with.
  'wetRescueGlitches',
  // (v0.346.0) THE ABANDON CARRY - the storm row's hands counter rode the
  // report-time stats, but a relog after the hand rebuilt the miner and the
  // v0.18.9 carry moved only this list: face 36700431959 printed F18's hand
  // ('liar ladder abandons the glitch class - 2 confirmed no-op pages', log
  // line 1423) and the storm row still read no hands tail (counter 0 at
  // report time, reconnects=7 that face). Six faces the counter matched the
  // logs; the seventh split - the v0.293.0 sweepDrops mortality's exact
  // shape (a new counter born outside the list, orphaned by every respawn).
  // Monotone, integer, >0-gated by both ends - the round-trip is free.
  'glitchAbandons',
  // (v0.347.0) THE AIR-BAR LEDGER's counter rides the carry from BIRTH (the
  // v0.346.0 lesson applied the day it ships, not a face late): an override
  // hand BELIEVED the bar and paid a rescue - a relog after the hand must
  // not erase the burn.
  'airBarOverrides',
  // (v0.356.0) THE HONEST HOLE's counter rides the carry from BIRTH (the same
  // v0.346.0 lesson, third strike law): every critical-on-dry read the net
  // DISPROVED (verdict not a rescue page - the gate-held, the ladder-held,
  // the abandoned). Without the carry a relog after the disprovals would
  // re-inflate the hole row's raw mass and re-aim the cure at the ghost.
  'airGlitchIgnored'
]

// (v0.293.0) THE SWEEP CENSUS CARRY's field list - every monotone counter of
// the miner's stats.sweepDrops view (the fleet row's sweeps=/picked=/failed=/
// below=/above=/deepSkip=/lipDig=/supportDig=/seal=/near=/far=/cut=/nthick=/
// nthin=/ngap=/step=/stepcut=/above1=/aboveHigh= tokens). The coherence pin in
// tests/unit/statcarry.test.mjs cross-checks this list against the miner's
// ride-site default init - a field added there must join here (the identity-
// extend discipline). Nothing coordinate or timestamp-shaped lives in the
// view, so the whole list travels.
export const SWEEP_DROP_FIELDS = [
  'sweeps', 'picked', 'failed', 'below', 'above', 'deepSkip', 'lipDig',
  'supportDig', 'seal1', 'seal2', 'seal3', 'sealNear', 'sealFar',
  'ledgeCut', 'sealCutTargets', 'sealNearThin', 'sealCutGap',
  'stanceStep', 'stanceCut', 'above1', 'aboveHigh'
]

/**
 * Absolute snapshot of the carry-able counters of `stats` (the miner's live
 * object, already seeded from the previous carry): returns a plain
 * { field: number, byName: { block: number } } or {} when there is nothing.
 * Pure: reads, never mutates.
 */
export function snapshotStats (stats) {
  if (!stats || typeof stats !== 'object') return {}
  const out = {}
  for (const f of CARRY_FIELDS) {
    const v = stats[f]
    if (Number.isFinite(v) && v > 0) out[f] = v
  }
  const byName = stats.byName
  if (byName && typeof byName === 'object') {
    const merged = {}
    for (const [k, v] of Object.entries(byName)) {
      if (Number.isFinite(v) && v > 0) merged[k] = v
    }
    if (Object.keys(merged).length) out.byName = merged
  }
  // (v0.293.0) the sweep census view rides the carry too - a dead bot's
  // step=/stepcut=/seal=/cut= contributions used to orphan with the instance
  const sd = stats.sweepDrops
  if (sd && typeof sd === 'object') {
    const carried = {}
    for (const f of SWEEP_DROP_FIELDS) {
      const v = sd[f]
      if (Number.isFinite(v) && v > 0) carried[f] = v
    }
    if (Object.keys(carried).length) out.sweepDrops = carried
  }
  return out
}

/**
 * Seed `stats` (a fresh miner's counters) with the previous carry. MUTATES
 * stats in place and returns it. Idempotent-safe by construction: the caller
 * seeds a NEW miner exactly once, then snapshots that miner's totals at
 * attempt end (seed-then-snapshot, never merge-into-merged twice).
 */
export function seedStats (stats, carry) {
  if (!stats || typeof stats !== 'object') return stats
  if (!carry || typeof carry !== 'object') return stats
  for (const f of CARRY_FIELDS) {
    const v = carry[f]
    if (Number.isFinite(v) && v > 0) stats[f] = (stats[f] ?? 0) + v
  }
  const byName = carry.byName
  if (byName && typeof byName === 'object') {
    stats.byName = stats.byName ?? {}
    for (const [k, v] of Object.entries(byName)) {
      if (Number.isFinite(v) && v > 0) stats.byName[k] = (stats.byName[k] ?? 0) + v
    }
  }
  // (v0.293.0) the sweep census seeds onto the FULL zeroed view - a partial
  // view would skip the miner's ride-site default init (`?? {...}`) and turn
  // the first `sd.sweeps++` into NaN
  const sd = carry.sweepDrops
  if (sd && typeof sd === 'object') {
    const view = stats.sweepDrops ?? (stats.sweepDrops = {})
    for (const f of SWEEP_DROP_FIELDS) {
      const v = Number.isFinite(view[f]) ? view[f] : 0
      const c = sd[f]
      view[f] = Number.isFinite(c) && c > 0 ? v + c : v
    }
  }
  return stats
}

/**
 * The FLEET RESULT's sentry attribution row (v0.195.0).
 *
 * WHY: run190 (fleet 36195869446) counted airGlitches=383 fleet-wide while the
 * fleet log carried 16 'air-bar glitch' lines - ALL F7's; 9 of 19 bots never
 * printed a single 'water:' line, and ~40 of the 383 were attributable to NO
 * bot at all (the counter is summed across carries and reconnections, the
 * rate-limited log line is per-instance). Three decode lanes burned on the
 * same question - WHICH bot holds the counter - before this row existed. The
 * report JSON's perBot carried the fields all along, but the mined surface is
 * the LOG artifact, not the JSON: the row lands the per-bot truth in the log
 * itself, next to the fleet-wide counter it attributes.
 *
 * SHAPE: one line, ALWAYS printed (the 05:00 ledger-skip lesson: an absent
 * line class is indistinguishable from a filter blind spot, so an all-zero
 * fleet prints 'all N g0/r0' instead of silence):
 *   sentry per-bot: F7 g343/r8 F16 g12/r0 | 17 g0/r0
 * g = airGlitches (the sensor-anomaly counter), r = rescues (the rescue
 * counter) - both ride the water sentry and both have burned decodes
 * (run190's blind spot #2; the rescues-56 causes class), one row covers both.
 * Bots with either counter non-zero are named in fleet order; the rest
 * collapse into the trailing silent count.
 *
 * JUNK-SAFE: a missing/junk bot entry, a missing stats object, or a
 * NaN/negative counter reads g0/r0 (the silent class) - garbage never renders
 * as NaN, never widens the row, never throws. A missing name renders '?'
 * (the bot's slot is still counted). Pure: reads, never mutates.
 */
export function sentryAttributionRow (bots = []) {
  const named = []
  let silent = 0
  for (const b of (Array.isArray(bots) ? bots : [])) {
    const s = b && typeof b === 'object' ? b.stats : null
    const g = s && Number.isFinite(s.airGlitches) && s.airGlitches > 0 ? Math.floor(s.airGlitches) : 0
    const r = s && Number.isFinite(s.rescues) && s.rescues > 0 ? Math.floor(s.rescues) : 0
    if (g > 0 || r > 0) named.push(`${b.name ?? '?'} g${g}/r${r}`)
    else silent++
  }
  if (!named.length) return `sentry per-bot: all ${silent} g0/r0`
  return `sentry per-bot: ${named.join(' ')} | ${silent} g0/r0`
}

// (v0.325.0) THE RESCUE-ECONOMY DECODE - the sentry counters were attributed
// per bot (the row above) but never JUDGED as an economy. The watch front's
// two faces: fleet 36626921875 read 257 air glitches with 54 rescues (21.0%),
// fleet 36631612575 read 699 with 75 (10.7%) - the share HALVED while the
// raw count nearly tripled, and no line said so: the bots= line prints both
// sums side by side but never divides them, and the per-bot row attributes
// without judging. The verdict: share = rescues / airGlitches over the whole
// run; at or above the floor the net holds (silent - a healthy run needs no
// line); below it the net is losing ground and the line names the exact
// numbers. The glitch sample needs mass before it speaks (minGlitches: a
// 30-glitch face is grain, not a trend - the ledger-grain law); junk never
// invents an economy (Number(null)=0 would read a blind sentry as a perfect
// one - the body-guard law, seventh strike).
export const RESCUE_ECONOMY_FLOOR_SHARE = 0.15
export const RESCUE_ECONOMY_MIN_GLITCHES = 100

/**
 * The rescue-net verdict: is the net keeping up with the glitches?
 * Pure, junk-tolerant - null means 'healthy', 'small sample' or 'cannot tell'.
 * @param {{airGlitches?: number|null, rescues?: number|null}} p
 * @returns {string|null} 'rescue economy: ...' when the net is losing ground
 */
export function rescueEconomyDecode (opts = {}) {
  const { airGlitches = null, rescues = null } = opts || {}
  if (!Number.isFinite(airGlitches) || !Number.isFinite(rescues)) return null
  if (airGlitches < 0 || rescues < 0) return null
  const g = Math.floor(airGlitches)
  const r = Math.floor(rescues)
  if (g < RESCUE_ECONOMY_MIN_GLITCHES) return null
  const share = r / g
  if (share >= RESCUE_ECONOMY_FLOOR_SHARE) return null
  return `rescue economy: ${r} rescues for ${g} air glitches = ${(share * 100).toFixed(1)}% - the net is losing ground`
}

// (v0.326.0) THE RESCUE-HOLE ROW - the economy decode judges the NET; the next
// question a miner asks is WHERE the leak lives. The per-bot row (v0.195.0)
// names every g/r pair but never ranks the unrescued mass (g - r), so a bot
// sitting on a third of the leak reads as one more pair in the list. THE FORK:
// LOCAL (one walk holds at least half the fleet's unrescued mass - the cure is
// a single bot's rescue reach) vs SPREAD (no holder clears half - the net
// itself is saturated, the cure is fleet-wide). The mass floor keeps a small
// face from rendering a verdict (the ledger-grain law: 49 unrescued units is
// weather, 50 is a leak); bots whose rescues outcount their glitches (the
// carried counters can overhang across reconnects) clamp to zero mass - the
// row measures holes, not accounting disputes; junk counters read g0/r0 (the
// silent class, the body-guard law). Pure: reads, never mutates.
// (v0.356.0) THE HONEST HOLE - the raw mass (g - r) counted the reads the net
// DISPROVED as unrescued mass, and the mis-aim is measured: face 36733939481
// printed 'rescue hole: local - F12 holds 595u of 595u unrescued (100%) - aim
// the cure there' while the net actually HELD the whole class (4 override
// hands, 6 starts, the ladder ratcheted 3x, the abandonment stood down) - the
// 595u was disproven sensor reads, not lost bots. The honest mass subtracts
// the disproved reads (stats.airGlitchIgnored, the v0.356.0 counter) beside
// the rescues: u = max(0, g - ignored - r). A bot whose counter predates the
// cure (no ignored field) reads exactly the legacy shape - the row never
// invents disprovals (the body-guard law: a MISSING counter is zero, not a
// claim). The byte shapes stand untouched - the honest numbers just replace
// the polluted ones (the account-of-record law).
export const RESCUE_HOLE_MIN_UNRESCUED = 50
export const RESCUE_HOLE_HOLD_SHARE = 0.5

/**
 * Where does the unrescued glitch mass live? LOCAL vs SPREAD, by holder.
 * @param {Array<{name?: string, stats?: {airGlitches?: number, rescues?: number, airGlitchIgnored?: number}}|null>} bots
 * @returns {string|null} 'rescue hole: ...' when the mass clears the floor
 */
export function rescueHoleRow (bots = []) {
  if (!Array.isArray(bots)) return null
  const holders = []
  let total = 0
  for (const b of bots) {
    const s = b && typeof b === 'object' ? b.stats : null
    const g = s && Number.isFinite(s.airGlitches) && s.airGlitches > 0 ? Math.floor(s.airGlitches) : 0
    const r = s && Number.isFinite(s.rescues) && s.rescues > 0 ? Math.floor(s.rescues) : 0
    // (v0.356.0) the honest mass: the disproved reads leave the leak - a
    // missing counter reads 0 (the legacy shape, never an invented disproval)
    const ig = s && Number.isFinite(s.airGlitchIgnored) && s.airGlitchIgnored > 0 ? Math.floor(s.airGlitchIgnored) : 0
    const u = Math.max(0, g - ig - r)
    if (u > 0) holders.push({ name: b.name ?? '?', u })
    total += u
  }
  if (total < RESCUE_HOLE_MIN_UNRESCUED) return null
  // byte-stable pick: largest mass wins, ties break on name ascending
  let top = holders[0]
  for (const h of holders) {
    if (h.u > top.u || (h.u === top.u && h.name < top.name)) top = h
  }
  const pct = ((top.u / total) * 100).toFixed(1)
  if (top.u / total >= RESCUE_HOLE_HOLD_SHARE) {
    return `rescue hole: local - ${top.name} holds ${top.u}u of ${total}u unrescued (${pct}%) - aim the cure there`
  }
  return `rescue hole: spread - top ${top.name} holds ${top.u}u of ${total}u (${pct}%) - no single walk owns the leak`
}

// (v0.329.0) THE STORM-DIET ROW - the hole row names WHERE the unrescued mass
// lives; the next miner's question is WHY those walks drown in glitches. Face
// 36640056641's sentry read F11 g421/r29 + F15 g555/r18 with all 17 other
// bots at g0 - a storm that concentrated is a storm with an ADDRESS, and the
// fleet already carries the diet of every walk: stats.byName, the mined-block
// histogram that survives reconnects. THE THEORY THE ROW TESTS: the glitch
// whales are the BEACH walkers - sand, gravel, dirt and clay generate at and
// under the waterline, so a diet dominated by the beach class says the bot's
// territory is wet and the air sentry rides it all day. THE ROW: for every
// whale (airGlitches at or above STORM_DIET_MIN_GLITCHES - a smaller counter
// is grain, the ledger-grain law) print the beach-class share of its mined
// mass with its top beach blocks named (byte-stable: count desc, name asc);
// a whale with no mined mass reads dark ('no mined mass this read') - the
// honest silence is a form, not an omission (the 05:00 lesson); junk counts
// never enter the diet (the body-guard law). The row READS a theory, it does
// not convict one: 100% beach-class is evidence, 0% is evidence too. Pure:
// reads, never mutates.
// (v0.359.0) THE DRY DIET - the wet-rescue exclusion reaches the floor: a
// whale qualifies on its DRY sum (airGlitches minus the clamped wet-window
// share) - face 36733939481's F12 (600 glitches from ONE wet rescue, the
// mined mass all beach) would have been the storm's biggest whale and the
// row would have convicted its beach territory on rescue noise. The
// mined-mass read never changes (the histogram is the territory's evidence
// either way); a whale that survives on dry mass names the excluded share
// (', wet-rescued N' - the v0.357.0 mixed form); junk wet keeps the total
// (junk never invents an exclusion - the body-guard law); an all-wet whale
// drops below the floor and the row stays silent (the honest silence is a
// form); a zero-wet face renders byte-identical to v0.358.0 (the sync law).
export const STORM_DIET_MIN_GLITCHES = 100
export const STORM_DIET_BEACH_BLOCKS = ['sand', 'gravel', 'dirt', 'clay']

/**
 * What do the glitch whales mine? The beach-territory theory, read per whale.
 * @param {Array<{name?: string, stats?: {airGlitches?: number, byName?: Object<string, number>}}|null>} bots
 * @returns {string|null} 'storm diet: ...' when any whale clears the glitch floor
 */
export function stormDietRow (bots = []) {
  if (!Array.isArray(bots)) return null
  const beach = new Set(STORM_DIET_BEACH_BLOCKS)
  const whales = []
  for (const b of bots) {
    const s = b && typeof b === 'object' ? b.stats : null
    const gRaw = s && Number.isFinite(s.airGlitches) && s.airGlitches > 0 ? Math.floor(s.airGlitches) : 0
    // (v0.359.0) the dry sum: the wet-window share never qualifies a whale
    const wRaw = s && Number.isFinite(s.wetRescueGlitches) && s.wetRescueGlitches > 0 ? Math.floor(s.wetRescueGlitches) : 0
    const wet = Math.min(wRaw, gRaw)
    const g = gRaw - wet
    if (g < STORM_DIET_MIN_GLITCHES) continue
    const hist = s.byName && typeof s.byName === 'object' ? s.byName : {}
    let total = 0
    const beachNamed = []
    for (const [k, v] of Object.entries(hist)) {
      const n = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
      if (n <= 0) continue
      total += n
      if (beach.has(k)) beachNamed.push({ name: k, n })
    }
    whales.push({ name: b.name ?? '?', total, beachNamed, wet })
  }
  if (!whales.length) return null
  // byte-stable beach blocks: count desc, name asc; keep the top two
  const named = whales.map(w => {
    if (w.total <= 0) return `${w.name} no mined mass this read`
    const bTotal = w.beachNamed.reduce((a, x) => a + x.n, 0)
    w.beachNamed.sort((a, b) => (b.n - a.n) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    const top = w.beachNamed.slice(0, 2).map(x => `${x.name} ${x.n}`).join(', ')
    const pct = ((bTotal / w.total) * 100).toFixed(1)
    // (v0.359.0) a whale that survives on dry mass names the excluded share
    return `${w.name} ${pct}% beach-class${top ? ` (${top})` : ''}${w.wet > 0 ? `, wet-rescued ${w.wet}` : ''}`
  })
  return `storm diet: ${named.join(' | ')} - the wet territory mines the storm`
}

/**
 * (v0.199.0) THE DEATH-DROP LINE - run84 (fleet 36207216784) named the class:
 * mined=3027 but conversion=51.1% with unaccounted=1479, and the fleet pocket
 * curve FELL 2453u -> 1509u exactly across the 6-death window (t-208s -> t-0s).
 * A death scatters the bot's whole pocket on the ground, the death-spot memory
 * (v0.84.0) then steers every bot AWAY from the corpse, and the dropped stack
 * despawns - a silent, unattributed loot loss the ledger can only render as
 * 'unaccounted'. The line names the loss AT the death event, one snapshot
 * while the inventory still reads, riding its own 'death drop' filter key
 * (the v0.176.0 law: the instrument's prefix is the key).
 *
 * SHAPES (the four-canonical-forms house law):
 *   loss      'F3 death drop: ~312u lost at [-66,59,399] (dirt 120, stone 88, ...)'
 *   empty     'F3 death drop: pocket read empty at death (0u)'
 *   junk-pos  the same line without the 'at' segment (the legacy-safe form)
 *   unreadable null - the caller prints nothing (the death line alone speaks;
 *             the handler's try/catch owns this branch, a death must never throw)
 *
 * JUNK-SAFE: a non-array items read renders null; junk entries (missing name,
 * NaN/negative count) are filtered before the sum; the top list caps at 5
 * names with a '+N more' tail; fractions floor. Pure: reads, never mutates
 * the caller's arrays or the inventory.
 */
export function deathDropLine ({ tag = '', pos = null, items = null } = {}) {
  if (!Array.isArray(items)) return null
  const named = items
    .filter(it => it && typeof it.name === 'string' && Number.isFinite(it.count) && it.count > 0)
    .map(it => ({ name: it.name, count: Math.floor(it.count) }))
  const total = deathDropTotal(items)
  const p = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z) ? pos : null
  const at = p ? ` at [${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}]` : ''
  if (!total) return `${tag} death drop: pocket read empty at death (0u)`
  const top = named
    .sort((a, b) => (b.count - a.count) || (a.name < b.name ? -1 : 1))
    .slice(0, 5)
    .map(it => `${it.name} ${it.count}`)
    .join(', ')
  const more = named.length > 5 ? `, +${named.length - 5} more` : ''
  return `${tag} death drop: ~${total}u lost${at} (${top}${more})`
}

/**
 * (v0.280.0) THE POCKET STAKE - the deathDropLine's own total, exposed as a
 * number. The reloot ladder's terminal write-off needs the stake at reloot
 * time, but the death-drop line is a STRING - parsing it back would be
 * junk-hostile (the string is the row's format, not a measurement). The
 * arithmetic moves here (deathDropLine calls it - the output stays byte
 * identical, the deathdrop pins hold) and the death handler stores the
 * number on the reloot record (lastDeath.pocketU), so the write-off line
 * can name WHAT was at stake when the ladder ends. Junk-safe: a non-array
 * read is null (the caller renders 'unknown'), junk entries filter before
 * the sum, fractions floor. Pure.
 * @param {Array|null} items the inventory items at death
 * @returns {number|null} the pocket total in units, or null when unreadable
 */
export function deathDropTotal (items = null) {
  if (!Array.isArray(items)) return null
  return items
    .filter(it => it && typeof it.name === 'string' && Number.isFinite(it.count) && it.count > 0)
    .reduce((s, it) => s + Math.floor(it.count), 0)
}

/**
 * (v0.275.0) THE WET WINDOW - the trip-drown class's exposure measure.
 * Faces 36384223490 (x2) and 36378053182 read 'rescue never' x3 on the trip
 * legs (fuel commons walk / deploy / next column) - the trip-drown class is
 * CONFIRMED, but the line could not say HOW LONG the head had been wet
 * before the drown took the bot: a 2s plunge (the pathing side owns the
 * cure) and a 30s wade (the rescue gate's silence is the story) read
 * identically. The bot's own wet tracker (miner.mjs headWetSince, the
 * waterVerdict input) holds the wet-start ts; this renders the exposure
 * window onto the row tail. Junk law: 0 / junk / a future ts reads 'wet
 * unknown' - a missing or reset tracker NEVER masquerades as dry (the
 * -1 sentinel lesson: a reset is not a measurement). Pure.
 *
 * (v0.279.0) THE LAST-EPISODE FALLBACK: face 36397191054's first field read
 * measured 'wet unknown' on BOTH drown deaths (F13 x2) - the drown-timer's
 * early returns (the rescue's swimming state, the cooldown gate) freeze the
 * live tracker exactly while the bot is IN the water, and the surface-bob
 * reset eats the episode at the death tick. The most recent COMPLETED wet
 * episode is still a measurement - of the previous wetting - so a reset
 * tracker with a prior episode renders it honestly LABELED ('@last', never
 * the live read); a tracker with no prior episode keeps 'wet unknown'.
 *
 * @param {number|null} [headWetSince] the wet-start ts from the bot's tracker (0 = dry/reset)
 * @param {number} [now] the read clock (junk/future refuses)
 * @param {number|null} [lastWetMs] the most recent COMPLETED wet episode's duration ms (junk refuses)
 * @returns {string} 'wet Ns' | 'wet Ns@last' | 'wet unknown'
 */
export function wetWindowLabel (headWetSince, now = Date.now(), lastWetMs = null) {
  if (!Number.isFinite(headWetSince) || headWetSince <= 0) {
    if (Number.isFinite(lastWetMs) && lastWetMs > 0) return `wet ${Math.floor(lastWetMs / 1000)}s@last`
    return 'wet unknown'
  }
  if (!Number.isFinite(now) || now < headWetSince) return 'wet unknown'
  return `wet ${Math.floor((now - headWetSince) / 1000)}s`
}

/**
 * (v0.249.0) THE DROWN-DEATH CONTEXT - the drowning-class telemetry gap.
 * Run36325553310 measured the Drowned-class as the RETURNED death leader
 * (4/6: 2x env drown + 2x slain by Drowned) with the shore law at ZERO
 * firings - the drown deaths fell OUTSIDE the combat-flee context the shore
 * law guards, and the rescue telemetry never spoke for them either. Before
 * any cure (the canon: telemetry before cure), every env-drown death now
 * prints ONE context snapshot: the oxygen bar as read at death, the
 * feet/head block names with their waterlogged flags (the truth
 * airBarTrust/waterVerdict/rescue all share), and the rescue relation
 * (active / Ns ago / never). The line rides the 'drown context' filter key
 * in testbed/fleet19.mjs.
 *
 * SHAPES (the four-canonical-forms house law; the v0.205.0 tail precedent -
 * the row tail extends, the legacy tokens keep their positions):
 *   result   'F3 death: drown context (o2 0, feet water, head water, rescue active, leg unknown, wet 12s)'
 *   result   'F3 death: drown context (o2 12, feet water, head air, rescue 7s ago, leg unknown, wet unknown)'
 *   result   'F3 death: drown context (o2 ?, feet water, head water, rescue never, leg unknown, wet 0s)'
 *   refusal  null - the caller prints nothing (junk world, nothing to say;
 *            the handler's try/catch owns this branch, a death must never throw)
 *
 * JUNK-SAFE: a null/unknown oxygen renders '?'; null block names render
 * 'unknown'; a junk lastRescueAt (not finite, or in the future) reads
 * 'never'. Pure: reads, never mutates.
 */
// (v0.270.0) THE TRIP LEG STAMP - face 36378053182's F10 drowned 123s after a
// COMPLETED rescue (rescue complete in 8.0s at 04:52:49, death at 04:54:52)
// with ZERO drowning-rescue lines in the gap: the bot died inside a leg the
// water instruments do not own (the wood trip walked it into a lake) - and
// the black box could not say WHICH leg held the death, the decode needed
// manual inventory-line archaeology. gotoSafe now stamps its label on the
// bot (jobqueue.mjs, before every gate - a refused walk still names its leg)
// and this line renders it: ', leg wood trip' names the owning leg at a
// glance, a bot that never walked reads 'leg unknown' honestly. The token is
// UNCONDITIONAL (always present) so a missing stamp can never masquerade as
// a deliberate omission in the next face's census.
export function drownContextLine (r = {}) {
  const { tag = '', oxygen = null, feet = null, head = null, feetWaterlogged = false, headWaterlogged = false, rescueActive = false, lastRescueAt = null, now = Date.now(), leg = null, headWetSince = null, lastWetMs = null } = r || {}
  if (feet === null && head === null && oxygen === null) return null
  // (v0.264.0) the -1 reset sentinel renders NAMED (the v0.64.0 law): face
  // 36365938885's F1 chain printed a raw 'o2 -1' in this line - the sentinel
  // burst after its rescue, not a bar state. The renderer carries the name so
  // the next decode reads it off the line.
  const o2 = o2SensorLabel(oxygen)
  const f = feet === null ? 'unknown' : feet
  const h = head === null ? 'unknown' : head
  const fw = feetWaterlogged ? ' wl' : ''
  const hw = headWaterlogged ? ' wl' : ''
  let rescue = 'never'
  if (rescueActive) rescue = 'active'
  else if (Number.isFinite(lastRescueAt) && lastRescueAt > 0 && Number.isFinite(now) && now >= lastRescueAt) {
    rescue = `${Math.floor((now - lastRescueAt) / 1000)}s ago`
  }
  const legName = (typeof leg === 'string' && leg.trim()) ? leg.trim() : 'unknown'
  // (v0.275.0) the wet window rides the tail - the trip-drown class's exposure measure
  // (v0.279.0) the last-episode fallback rides beside it - a reset tracker with a prior
  // episode renders the previous wetting '@last' (face 36397191054: 'wet unknown' x2)
  return `${tag} death: drown context (o2 ${o2}, feet ${f}${fw}, head ${h}${hw}, rescue ${rescue}, leg ${legName}, ${wetWindowLabel(headWetSince, now, lastWetMs)})`
}

// (v0.274.0) THE SUFFOCATE DEATH CONTEXT - the suffocate-class telemetry gap.
// Face 36384223490's F1 died 'suffocated in a wall' at [-112,45,424] with a
// 153u pocket (gravel 39!) and ZERO telemetry lead - no context line spoke
// for the class (the v0.249.0 drown context is drown-kind only by design),
// so the black box could not say WHAT filled the head cell. The inventory
// archaeology hints the class: a gravel column collapsed onto a digging bot.
// ONE snapshot line for every env-suffocate death (kind=suffocate): the head
// block NAME at death (a falling-block class reads 'gravel'/'sand' straight
// off the line - the decode names itself), its waterlogged flag, the o2 bar
// (a dry-lens read: a wet head would hand the class to the drowning side),
// and the UNCONDITIONAL leg stamp (the v0.270.0 law - a missing stamp can
// never masquerade as a deliberate omission; 'leg unknown' claims no walk).
// The line rides the 'suffocate context' filter key in testbed/fleet19.mjs.
// JUNK-SAFE: a null head reads 'unknown' (the line NEVER returns null - the
// class already died in silence once; a junk oxygen renders '?'). Pure.
/**
 * @param {object} [r]
 * @param {string} [r.tag] the bot tag ('F1')
 * @param {string|null} [r.head] the head cell's block name at death
 * @param {boolean} [r.headWaterlogged] the head cell's waterlogged flag
 * @param {number|null} [r.oxygen] the o2 bar as read at death (the -1 sentinel renders named)
 * @param {string|null} [r.leg] the gotoSafe leg stamp (junk reads 'unknown')
 * @returns {string} the suffocate context line
 */
export function suffocateContextLine (r = {}) {
  const { tag = '', head = null, headWaterlogged = false, oxygen = null, leg = null } = r || {}
  const h = head === null || head === undefined ? 'unknown' : (typeof head === 'string' && head.trim() ? head.trim() : 'unknown')
  const hw = headWaterlogged ? ' wl' : ''
  const o2 = o2SensorLabel(oxygen)
  const legName = (typeof leg === 'string' && leg.trim()) ? leg.trim() : 'unknown'
  return `${tag} death: suffocate context (head ${h}${hw}, o2 ${o2}, leg ${legName})`
}
// (v0.262.0) THE DROWNED-KILL SHORE CONTEXT - the mob-Drowned telemetry gap.
// Face 36359454749 attempt 2 (the trio's first full field pass) moved the
// fleet's killer channel: Drowned x10 at y~64 shore level (+ Witch x2) - and
// the v0.249.0 context line stays SILENT for every one of them (it prints for
// kind='drown' only; the mob-Drowned kills 'keep the combat verdict' by
// design). Ten deaths with zero waterline context is an undecodable class:
// the cure differs by where the fight stood - IN the water column (the
// sentry/rescue side owns it), at the WATERLINE (the engage-standoff side),
// or on DRY land a step from the shore (the Drowned came ashore - pure
// combat law). One snapshot line per mob-Drowned kill, the v0.249.0 doctrine
// (telemetry before cure): the class verdict, the death cell's y, the
// feet/head block names with their waterlogged flags, and the horizontal
// water neighbors at feet level with their compass bearings. The next face's
// census splits the class by context BEFORE any cure. Rides the
// 'drowned-kill context' filter key in testbed/fleet19.mjs.
//
// SHAPES (the four-canonical-forms house law):
//   result   'F7 death: drowned-kill context (waterline, y 64, feet sand, head sand, water e/w)'
//   result   'F7 death: drowned-kill context (in-water, y 62, feet water, head water, water none)'
//   result   'F7 death: drowned-kill context (dry-shore, y 64, feet grass_block, head air, water none)'
//   refusal  null - not a Drowned kill (the attacker gate), or every world
//            read junk (nothing to say; the handler's try/catch owns the
//            branch, a death must never throw)
//
// JUNK-SAFE: the gate is the ATTACKER (a junk name never prints). A null
// neighbor renders nothing in the bearing list (an unloaded chunk is not dry
// land); an unreadable scan reads 'water unknown' - never a fabricated
// 'none' (none is a positive claim of dryness, the house junk law). The
// class reads from what IS readable; all-null world reads return null
// instead of guessing a class. Pure: reads, never mutates.
export function drownedKillContextLine (r = {}) {
  const { tag = '', attacker = null, feet = null, head = null, feetWaterlogged = false, headWaterlogged = false, neighbors = null, feetY = null } = r || {}
  if (typeof attacker !== 'string' || !/^drowned$/i.test(attacker.trim())) return null
  const feetKnown = feet !== null
  const headKnown = head !== null
  const scanKnown = Array.isArray(neighbors)
  if (!feetKnown && !headKnown && !scanKnown) return null
  const isWet = n => n !== null && WATER_NAMES.has(n)
  const feetWet = isWet(feet)
  const headWet = isWet(head)
  const wetN = scanKnown ? neighbors.filter(n => n && isWet(n.name)) : []
  let cls = 'dry-shore'
  if (feetWet || headWet) cls = 'in-water'
  else if (wetN.length > 0) cls = 'waterline'
  const fw = feetWaterlogged ? ' wl' : ''
  const hw = headWaterlogged ? ' wl' : ''
  const f = feetKnown ? feet : 'unknown'
  const h = headKnown ? head : 'unknown'
  const water = !scanKnown ? 'unknown' : (wetN.length ? wetN.map(n => n.d).join('/') : 'none')
  const y = Number.isFinite(feetY) ? String(feetY) : '?'
  return `${tag} death: drowned-kill context (${cls}, y ${y}, feet ${f}${fw}, head ${h}${hw}, water ${water})`
}

// (v0.277.0) THE VOID DEATH CONTEXT - the out-of-world class's first voice.
// TWO void deaths now stand in the fleet's history, both mute: the rim-dig
// era's F12 'fell out of the world' at [117,-90,0] (kind=other, the first)
// and face 36392745638's F3 at [118,-148,2] - y MINUS 148, 84 blocks BELOW
// the world floor, 22u lost (torch 8, oak_planks 5) with ZERO telemetry lead
// (the lines before the death are other bots'). The x/z cells sit ~17 blocks
// apart on the same latitude band east of the dragon-zone anchor - the
// recurrence is the decode lead: HOW does a bot reach the void (a bedrock
// breach, a pathfinder fall, a frozen-client drop)? The server kind stays
// 'other' (the v0.117.0 law - the kind is never rewritten), so the branch
// keys on the VERB the server itself printed. ONE snapshot line per
// out-of-world death: the death CELL (the recurrence signature - the next
// face's census pins the column), the DEPTH below the world floor (the fall
// distance the client never measured), and the UNCONDITIONAL leg stamp (the
// v0.270.0 law - which walk owned the death; a missing stamp can never
// masquerade as a deliberate omission). The line rides the 'void context'
// filter key in testbed/fleet19.mjs.
// JUNK-SAFE: the line NEVER returns null (the class has died in silence
// twice - an empty call still stamps); a junk cell reads 'unknown' (a string
// coordinate is not a measurement - the strict gate); a junk floor renders
// the depth 'unknown' while the cell still prints (the class reads from what
// IS readable - the drowned-kill law). Pure: reads, never mutates.

export const VOID_FLOOR_Y = -64 // the overworld's floor (vanilla 26.2, the 1.18+ world bottom)

/**
 * @param {object} [r]
 * @param {string} [r.tag] the bot tag ('F3')
 * @param {{x: number, y: number, z: number}|null} [r.pos] the death cell (floored)
 * @param {string|null} [r.leg] the gotoSafe leg stamp (junk reads 'unknown')
 * @param {number} [r.floorY] the world floor (default VOID_FLOOR_Y)
 * @returns {string} the void context line
 */
export function voidContextLine (r = {}) {
  const { tag = '', pos = null, leg = null, floorY = VOID_FLOOR_Y } = r || {}
  const p = (pos && typeof pos === 'object') ? pos : null
  const px = p && Number.isFinite(p.x) ? p.x : null
  const py = p && Number.isFinite(p.y) ? p.y : null
  const pz = p && Number.isFinite(p.z) ? p.z : null
  const cell = px !== null && py !== null && pz !== null ? `${px},${py},${pz}` : 'unknown'
  const depth = py !== null && Number.isFinite(floorY) ? floorY - py : null
  const legName = (typeof leg === 'string' && leg.trim()) ? leg.trim() : 'unknown'
  return `${tag} death: void context (cell ${cell}, depth ${depth === null ? 'unknown' : depth}, leg ${legName})`
}

// (v0.342.0) THE STORM ROW - the per-face storm VERDICT naming the holder.
// Four faces of record priced the bimodal law: 36660134341 (2176 banked,
// storm 0), 36669231548 (73 banked, storm 276), 36679076372 (1641, storm 0,
// flow 4.7), 36686530635 (768, storm 1323 - the worst on record). The rate
// rides the storm, but no line ever NAMED the face's class: a miner digging
// through the logs reads airGlitches=1323 in the bots= line and must do the
// bimodal arithmetic by hand, and the v0.337.0 abandonment's first speaking
// leg (5 hands on that face, the witness guard proven in the field) left no
// counter at all - the hands lived only in rate-limited log lines. The row
// renders ALWAYS (the 05:00 ledger-skip lesson: a CALM verdict is a verdict;
// an absent line class is a filter blind spot), the STORM side names the
// glitch rate per minute and the top per-bot holder with its share (the hole
// row's WHERE, aimed at the storm's own holder), and the abandonment hands
// join when they exist (a storm with hands and a witness proof reads in one
// line years later). The floor is the ledger-grain law's own number (the
// rescue economy's minGlitches = 100): below it the face is weather, and the
// clean bimodal split (0 vs 257+) holds the floor from both sides.
// JUNK-SAFE: a junk fleet sum reads g0 (CALM - garbage never renders as a
// storm), a junk duration drops the rate (the count still speaks), a junk
// bot entry is silent in the holder scan, a junk hand count renders no hands
// (never NaN hands - the body-guard law). Pure: reads, never mutates.
export const STORM_GLITCH_FLOOR = 100

// ---------------------------------------------------------------------------
// (v0.357.0) THE WET-RESCUE EXCLUSION - the storm verdict's feed is polluted
// by one measured class: face 36733939481 read 'storm verdict: STORM - 600
// air glitches (60.0/min), top F12 g600 (100%), 1 abandon hand' while the
// anatomy decomposed ALL 600 to ONE bot's ONE wet rescue (F12 took a wet
// column at [-161,55,401], the drowning rescue ran 8+ passes - o2 4->1->reset,
// buoyancy climbs - and every critical-on-dry read inside that window counted
// as a glitch: the rescue's surface-bob reads dry block contact while the bar
// is genuinely low, physiologically true, class-wise not the ambient storm).
// The liar ladder's own abandon proved the class ('liar ladder abandons the
// glitch class - 2 confirmed no-op pages, the streak lane stands down'). The
// storm verdict is the fleet's loudest weather signal - a wet rescue must
// never read as a storm. THE CURE: the increment classifies (a read inside
// the wet window - head wet NOW, or within WET_RESCUE_GLITCH_WINDOW_MS after
// the wet episode ended or after a rescue fired - counts BOTH counters, the
// total keeps its meaning for the economy and the diet, no cascade) and the
// verdict reads the DRY sum: a face whose storm is all wet downgrades to the
// honest WET class, a mixed face names the excluded share, a clean face
// renders byte-identical to v0.356.0 (wetGlitches absent or zero changes
// nothing - the sync law).
export const WET_RESCUE_GLITCH_WINDOW_MS = 45000

/**
 * Is the read inside the wet-rescue window? Pure, junk-safe: junk never
 * invents a window (the body-guard law) - a junk telemetry read classifies
 * as NOT wet, so the total counter never undercounts.
 * @param {object} [p]
 * @param {boolean} [p.headWetNow] the head is in water at read time
 * @param {number|null} [p.lastWetEndAt] the epoch ms the last wet head episode ended
 * @param {number|null} [p.lastRescueAt] the epoch ms the last drowning rescue fired
 * @param {number|null} [p.now] the read's epoch ms
 * @returns {boolean}
 */
export function wetRescueWindowLive (p = {}) {
  const { headWetNow = false, lastWetEndAt = null, lastRescueAt = null, now = null } = p || {}
  if (headWetNow === true) return true
  const nowN = Number.isFinite(now) && now > 0 ? now : null
  if (nowN === null) return false
  for (const at of [lastWetEndAt, lastRescueAt]) {
    const t = Number.isFinite(at) && at > 0 ? at : null
    if (t !== null && nowN >= t && nowN - t < WET_RESCUE_GLITCH_WINDOW_MS) return true
  }
  return false
}

/**
 * The per-face storm verdict: STORM (at/above the floor: rate + top holder +
 * abandon hands) or CALM (below it). The v0.357.0 wet-rescue exclusion: a
 * wetGlitches input carves the wet-rescue class out of the storm arithmetic -
 * if only the wet share crosses the floor the verdict downgrades to the
 * honest WET class (never silent - a downgrade is a verdict, the 05:00
 * ledger-skip lesson). Always a string - never null.
 * @param {object} [opts]
 * @param {number|null} [opts.airGlitches] the fleet-wide glitch sum
 * @param {number|null} [opts.wetGlitches] the wet-rescue-window share of that sum
 * @param {number|null} [opts.secs] the run duration in seconds (junk drops the rate)
 * @param {Array<{name?: string, stats?: {airGlitches?: number}|null}>} [opts.bots]
 * @param {number|null} [opts.abandons] the fleet-wide abandonment hand sum
 * @returns {string} 'storm verdict: ...'
 */
export function stormVerdictRow (opts = {}) {
  const { airGlitches = null, wetGlitches = null, secs = null, bots = [], abandons = null } = opts || {}
  const g = Number.isFinite(airGlitches) && airGlitches > 0 ? Math.floor(airGlitches) : 0
  // (v0.357.0) the wet share: junk reads 0 (no wet input = the v0.356.0 face,
  // byte-identical), negatives clamp to 0, an overcount clamps to g (the wet
  // share is a subset of the total, never a second storm on top).
  const wRaw = Number.isFinite(wetGlitches) && wetGlitches > 0 ? Math.floor(wetGlitches) : 0
  const w = Math.min(wRaw, g)
  const a = Number.isFinite(abandons) && abandons > 0 ? Math.floor(abandons) : 0
  const hands = a > 0 ? `, ${a} abandon hand${a === 1 ? '' : 's'}` : ''
  if (g >= STORM_GLITCH_FLOOR) {
    const dry = g - w
    if (dry < STORM_GLITCH_FLOOR) {
      // (v0.357.0) THE WET CLASS - the storm was one rescue's tail, named and
      // stood down: the count still speaks (the raw sum is on the line), the
      // wet/dry split is on the line, the hands join (face 36733939481's 1
      // hand rides), and the signal reads calm for every storm consumer.
      return `storm verdict: WET - ${g} air glitches (${w} wet-rescued, dry ${dry}) - the storm signal stays calm${hands}`
    }
    const t = Number.isFinite(secs) && secs > 0 ? Math.floor(secs) : null
    const rate = t ? ` (${((g / t) * 60).toFixed(1)}/min)` : ''
    let topName = null
    let topG = 0
    for (const b of (Array.isArray(bots) ? bots : [])) {
      const s = b && typeof b === 'object' ? b.stats : null
      const bg = s && Number.isFinite(s.airGlitches) && s.airGlitches > 0 ? Math.floor(s.airGlitches) : 0
      if (bg > topG) { topG = bg; topName = (typeof b.name === 'string' && b.name) ? b.name : '?' }
    }
    const top = topName ? `, top ${topName} g${topG} (${Math.round((topG / g) * 100)}%)` : ''
    const wet = w > 0 ? `, wet-rescued ${w}` : ''
    return `storm verdict: STORM - ${g} air glitches${rate}${top}${hands}${wet}`
  }
  return `storm verdict: CALM - ${g} air glitches${hands}`
}

// ---------------------------------------------------------------------------
// (v0.347.0) THE AIR-BAR LEDGER - the storm row names the holder (F9 72%,
// F18 100% - two faces say the storm is ONE bot's air-bar lie) but never
// priced the lie's COST: every 'air-bar glitch override' hand BELIEVED the
// bar and paid a rescue (face 36700431959: F18's 213 lied reads carried two
// override hands - lines 1264/1418, 'believing the bar'). The ignore class
// burns nothing (pure telemetry); the override class burns real rescue
// machinery on a sensor that sat broken. The row prices the hands at the
// face level: how many overrides fired, on how many lied reads, and who
// owns them. Silence IS the healthy verdict (a face of pure ignores prints
// nothing - the leanness law).
//
// The v0.346.0 lesson applied at birth: the new counter rides CARRY_FIELDS
// the day it ships - a relog after a hand must not orphan it (the seventh
// face's exact mortality).
/** One override is one real rescue burn - the grain is 1. */
export const AIR_BAR_LEDGER_MIN_OVERRIDES = 1

/**
 * The face-level air-bar override ledger (pure, junk-safe).
 * @param {Array<{name?: string, stats?: {airGlitches?: number, airBarOverrides?: number}}>} miners
 * @param {object} [opts]
 * @param {number} [opts.minOverrides] the speak floor (default AIR_BAR_LEDGER_MIN_OVERRIDES = 1)
 * @returns {string|null} null reads healthy (no override burned anything - the leanness law)
 */
export function airBarLedgerRow (miners, { minOverrides = AIR_BAR_LEDGER_MIN_OVERRIDES } = {}) {
  if (!Array.isArray(miners)) return null
  const floor = Number.isFinite(minOverrides) && minOverrides > 0 ? Math.floor(minOverrides) : AIR_BAR_LEDGER_MIN_OVERRIDES
  let total = 0
  let lied = 0
  let topName = null
  let topOv = 0
  for (const m of miners) {
    const s = m && typeof m === 'object' ? m.stats : null
    if (!s || typeof s !== 'object') continue
    const ov = Number.isFinite(s.airBarOverrides) && s.airBarOverrides > 0 ? Math.floor(s.airBarOverrides) : 0
    if (ov <= 0) continue
    total += ov
    const lg = Number.isFinite(s.airGlitches) && s.airGlitches > 0 ? Math.floor(s.airGlitches) : 0
    lied += lg
    if (ov > topOv) { topOv = ov; topName = (typeof m.name === 'string' && m.name) ? m.name : '?' }
  }
  if (total < floor) return null
  const top = topName ? `, top ${topName} ${topOv}` : ''
  return `air-bar ledger: ${total} override hand${total === 1 ? '' : 's'} on ${lied} lied reads${top} - each hand believed the lie and paid a rescue`
}

// (v0.356.0) THE SENSOR-LIAR CENSUS - the honest hole row (the disproved
// reads leave the leak) goes SILENT on exactly the face that needs a new
// line: face 36733939481's F12 read g600 with the net holding (4 override
// hands, 6 starts, 3 ladder ratchets) - after the cure the hole row prints
// nothing, and a bar that lied 600 reads would leave no trace in the report
// (the honest silence is a form, but an unpriced 600-read lie is a hole in
// the account, the 05:00 lesson's twin). The census prices the disprovals:
// when a bot's ignored mass clears the floor, the line names who disproved
// how much and what it cost the net instead (the override hands, the
// rescues) - the sensor story the hole row can no longer tell. The floor
// keeps grain out (200 reads: face 36700431959's F18 carried 213 lied reads
// - the smallest whale the watch front named; a smaller class is weather,
// the ledger-grain law). Byte-stable pick: largest disproved mass wins,
// ties break on name ascending (the hole row's own law). Junk counters
// never enter the census (the body-guard law). Pure: reads, never mutates.
export const SENSOR_LIAR_MIN_IGNORED = 200

/**
 * Who disproved the biggest sensor lie this face? (pure, junk-safe)
 * @param {Array<{name?: string, stats?: {airGlitchIgnored?: number, airGlitches?: number, rescues?: number, airBarOverrides?: number}}|null>} miners
 * @param {object} [opts]
 * @param {number} [opts.minIgnored] the speak floor (default SENSOR_LIAR_MIN_IGNORED = 200)
 * @returns {string|null} null when no bot's disproved mass clears the floor (the leanness law)
 */
export function sensorLiarRow (miners, { minIgnored = SENSOR_LIAR_MIN_IGNORED } = {}) {
  if (!Array.isArray(miners)) return null
  const floor = Number.isFinite(minIgnored) && minIgnored > 0 ? Math.floor(minIgnored) : SENSOR_LIAR_MIN_IGNORED
  let top = null
  for (const m of miners) {
    const s = m && typeof m === 'object' ? m.stats : null
    const ig = s && Number.isFinite(s.airGlitchIgnored) && s.airGlitchIgnored > 0 ? Math.floor(s.airGlitchIgnored) : 0
    if (ig <= 0) continue
    const name = (typeof m.name === 'string' && m.name) ? m.name : '?'
    if (!top || ig > top.ig || (ig === top.ig && name < top.name)) top = { ig, name }
  }
  if (!top || top.ig < floor) return null
  return `sensor liar census: ${top.name} disproved ${top.ig} reads - the bar lies, the net held (the honest hole row reads clean)`
}

// (v0.535.0) THE SCOUT'S REPORT ROW - the run-end report's otchetnost lane.
// THE SEAM: printFinalReport reads bots.values() - the miners only - and the
// scout's own counters (scans/finds/travelled/deaths) never surfaced in the
// FLEET RESULT block: a SCOUT=1 run whose scout failed all six join attempts
// printed the same report shape as one whose scout walked the whole run, and
// the ground knowledge those attempts bought was attributable to nothing (the
// 0.195.0 sentry lesson's exact shape, one bot wide). The row prints ALWAYS
// (the 05:00 ledger-skip lesson - an absent line class is indistinguishable
// from a filter blind spot), three faces named: off / requested, never
// spawned / the numbers. Junk-safe: junk counters read zeros honestly (the
// body-guard law), the numbers face is pure arithmetic - it never invents.
export function scoutReportRow (opts = {}) {
  // (the Number(null) lesson, the body guard not a destructuring default: an
  // explicit null opts would throw on the destructure itself)
  const o = opts && typeof opts === 'object' ? opts : {}
  if (!o.requested) return 'scout report: off'
  const stats = o.stats
  if (!stats || typeof stats !== 'object') return 'scout report: requested, never spawned'
  const num = v => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
  return `scout report: scans=${num(stats.scans)} finds=${num(stats.found)} travelled=${num(stats.travelled)} deaths=${num(stats.deaths)}`
}

// (v0.535.0) THE MAP'S COVERAGE ROW - the second otchetnost face the
// hand-away named: the shared map's own coverage (chunks scanned, positions,
// finds by type) had NO report line at all - the patrol's map.report() return
// was discarded by its only caller, and years later a run's map shape is
// unreadable from the mined surface. Prints ALWAYS: the map fills on every
// run (the miners record too - mapRecords rides the v0.18.9 carry), so the
// row is fleet knowledge, never a scout-only vanity. Junk report reads the
// honest 'unavailable' face (diagnostics never invent numbers); junk top
// entries are skipped, the string tails never throw.
export function mapCoverageRow (report) {
  if (!report || typeof report !== 'object') return 'map coverage: unavailable'
  const num = v => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
  const chunks = num(report.chunksScanned)
  const positions = num(report.positions)
  const top = Array.isArray(report.top)
    // (the filter rides BEFORE the cap: a junk entry must not spend an honest
    // slot - junk never crowds the truth out of the line)
    ? report.top.filter(e => Array.isArray(e) && e.length >= 2 && typeof e[0] === 'string')
      .slice(0, 5)
      .map(([t, c]) => `${t}:${num(c)}`)
      .join(',')
    : ''
  return `map coverage: chunks=${chunks} positions=${positions}${top ? ` top=${top}` : ''}`
}
