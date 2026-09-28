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
  'climbs', 'shelters', 'rescues', 'airGlitches', 'claims', 'deaths'
]

// (v0.293.0) THE SWEEP CENSUS CARRY's field list - every monotone counter of
// the miner's stats.sweepDrops view (the fleet row's sweeps=/picked=/failed=/
// below=/above=/deepSkip=/lipDig=/supportDig=/seal=/near=/far=/cut=/nthick=/
// nthin=/ngap=/step=/stepcut= tokens). The coherence pin in
// tests/unit/statcarry.test.mjs cross-checks this list against the miner's
// ride-site default init - a field added there must join here (the identity-
// extend discipline). Nothing coordinate or timestamp-shaped lives in the
// view, so the whole list travels.
export const SWEEP_DROP_FIELDS = [
  'sweeps', 'picked', 'failed', 'below', 'above', 'deepSkip', 'lipDig',
  'supportDig', 'seal1', 'seal2', 'seal3', 'sealNear', 'sealFar',
  'ledgeCut', 'sealCutTargets', 'sealNearThin', 'sealCutGap',
  'stanceStep', 'stanceCut'
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
