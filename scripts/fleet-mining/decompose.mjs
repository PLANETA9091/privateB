// Decompose a fleet19.log into the evidence classes the worklog tracks.
// Usage: node scripts/fleet-mining/decompose.mjs <path-to-fleet19.log>
import { readFileSync } from 'node:fs'
import { rescueLedger, rescueEndSeconds, RESCUE_END_CLASSES } from '../../src/lib/rescue-ledger.mjs'
import { bankFlowCensus } from '../../src/lib/bankcensus.mjs'
import { routeGateCensus, ROUTE_GATE_RIM_TRAP_REFUSALS } from '../../src/lib/routecensus.mjs' // (v0.388.0) the route gate's field read
import { shooterCensus } from '../../src/lib/shootercensus.mjs' // (v0.390.0) the shooter band's field read
import { deathSweep } from '../../src/lib/deathsweep.mjs' // (v0.389.0) the honest death sweep's field read
import { sealDeathCensus } from '../../src/lib/sealdeath.mjs' // (v0.403.0) the seal economy's death leg
import { sealCensus, SEAL_FAMILIES } from '../../src/lib/sealcensus.mjs' // (v0.397.0) the keep families' field read
import { hopCensus } from '../../src/lib/hopcensus.mjs' // (v0.399.0) the walk-deliveries class's field read

const file = process.argv[2]
if (!file) { console.error('usage: decompose.mjs <fleet19.log>'); process.exit(1) }
const lines = readFileSync(file, 'utf8').split('\n')

const count = (re) => lines.filter(l => re.test(l)).length
const perBot = (re) => {
  const m = {}
  for (const l of lines) {
    const b = l.match(/^F(\d+)\s/)
    if (!b) continue
    if (re.test(l)) m['F' + b[1]] = (m['F' + b[1]] || 0) + 1
  }
  return m
}
const fmt = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'

console.log('=== DEATHS ===')
// (v0.389.0) THE HONEST DEATH SWEEP - the old keyword bucket
// (/died|death|slain|.../ minus /drowning rescue|water:/) printed prose as
// deaths: face 19 (ZERO deaths) carried the steer hazard defer's 'a death
// is a cost the deficit cannot repay' onto the death row - the
// substring-pollution class the 1030 fire named ('hound census polluted by
// the fleet-wide substring'). The sweep now keys on the fleet's death
// ANATOMY ('F16 [F16] died - respawning' / 'F16 [F16] death: ...', the
// double tag, verified across faces 15 and 18); the old bucket survives as
// the AUDIT list - the prose carriers it would have printed print below
// the deaths, visible and counted instead of lying.
const sweep = deathSweep(lines)
for (const l of sweep.deaths) console.log(' ', l.slice(0, 160))
if (sweep.keywordOnly.length) {
  console.log(`  (the anatomy sweep filtered ${sweep.keywordOnly.length} keyword-carrier line(s) - prose, not deaths):`)
  for (const l of sweep.keywordOnly.slice(0, 6)) console.log('   ~', l.slice(0, 140))
}
// (v0.403.0) THE SEAL DEATH LEDGER - the seal economy's third leg: what
// DEATH erased. The reserve keeps at bank time, death bypasses the pocket
// entirely (face 23's F14: arrived 0/8 six times, then dropped ~172u with
// cobble 83 + dirt 26 inside). sealLost is the NAMED floor (the '+N more'
// tail is the fleet's own truncation - never invented).
{
  const sealDeath = sealDeathCensus(lines)
  if (sealDeath.drops > 0 || sealDeath.emptyReads > 0) {
    const perBot = Object.entries(sealDeath.byBot).map(([b, s]) => `${b} ~${s.lost}u (seal ${s.sealLost}u)`).join(' ')
    const emptyNote = sealDeath.emptyReads > 0 ? `, ${sealDeath.emptyReads} empty-pocket read(s)` : ''
    console.log(`  seal death ledger: ${sealDeath.drops} drops lost ~${sealDeath.lostTotal}u (seal-class ${sealDeath.sealLostTotal}u named${emptyNote}) - ${perBot}`)
  }
}

console.log('=== RESCUE STARTS by class ===')
console.log('  start(drowning):', count(/drowning rescue start \(drowning/))
console.log('  start(wet):', count(/drowning rescue start \(wet/))
console.log('  start(other):', count(/drowning rescue start \((?!drowning|wet)/))
console.log('  rescue complete 0.0s:', count(/rescue complete in 0\.0s/))
console.log('  rescue complete >0s:', count(/rescue complete in [1-9]/))
console.log('  per-bot rescue starts:', fmt(perBot(/drowning rescue start/)))
// (v0.368.0) THE RESCUE END-STATE LEDGER - face 14's '53 starts / 27
// completed' left 26 episodes unaccounted: the tool counted ONLY the
// 'rescue complete' line while the machinery names seven more terminations
// in the same line shape (the timeout's full-budget burn, the surface-safe
// release, the frozen standdown, the dead-in-rescue abort - the drowning
// attribution, the bot-gone and error aborts) plus episodes a FATAL face
// leaves open at EOF. The pure pairing lives in src/lib/rescue-ledger.mjs
// (unit-pinned); this block is its field read.
const ledger = rescueLedger(lines)
console.log('--- RESCUE END-STATE LEDGER (v0.368.0) ---')
console.log(`  starts: ${ledger.totals.starts}  unclosed at EOF: ${ledger.totals.unclosed}  orphans: ${ledger.orphanEnds}`)
console.log(`  complete: ${ledger.totals.complete} (standing-wet ${ledger.totals.completeStandingWet})  released: ${ledger.totals.released}  frozen standdown: ${ledger.totals.frozenStanddown}`)
console.log(`  timeout: ${ledger.totals.timeout}  dead-in-rescue: ${ledger.totals.dead}  bot-gone: ${ledger.totals.botGone}  error abort: ${ledger.totals.abortedError}`)
const timeoutRe = RESCUE_END_CLASSES.find(c => c.key === 'timeout').re
const timeoutSeconds = lines.reduce((a, l) => a + (timeoutRe.test(l) ? (rescueEndSeconds(l) ?? 0) : 0), 0)
console.log(`  timeout budget burned: ${timeoutSeconds.toFixed(1)}s`)
// (v0.370.0) THE FORENSICS - the counts name the anomaly, the lines name its
// story: the per-bot timeout budget attributes the whale (the shore-yield
// cure's before/after read is per-bot: F10/F14 must shrink), and the
// verbatim ORPHAN END / UNCLOSED START lines turn the unexplained orphan
// class (1 in face 12) and the FATAL-face open-at-EOF episodes into
// self-explaining reads - no hand grep on the next anomaly.
console.log('  timeout budget per-bot:', Object.entries(ledger.timeoutSecondsByBot).map(([b, s]) => `${b}=${s.toFixed(1)}s`).join(' ') || 'none')
for (const l of ledger.orphanEndLines) console.log('  ORPHAN END:', l)
for (const l of ledger.unclosedLines) console.log('  UNCLOSED START:', l)
console.log(`  mid-episode: shore-stall ${ledger.midEvents.shoreStall || 0}, transit-stall ${ledger.midEvents.transitStall || 0}, blind-live ${ledger.midEvents.blindLive || 0}, no-ground-truth ${ledger.midEvents.noGroundTruth || 0}, repeat-wet standdown ${ledger.midEvents.repeatWetStanddown || 0}`)
console.log('  per-bot ends:', Object.entries(ledger.perBot).map(([b, r]) => `${b}{${Object.entries(r).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(',')}}`).join(' ') || 'none')
// (v0.376.0) THE RELEASE STARVATION CENSUS - released is 0/230 across five
// faces and the timeout lines already carry the proof: the tail field is the
// last three wet/dry reads, and the release's own stability criterion is
// tail-dry-3 (STABILITY_TAIL_DRY). A timeout with tail dry/dry/dry is a bot
// that was SURFACE-STABLE when the budget died - the release branch (the
// pass ladder: bearing -> land -> release -> probes) never ran for it or its
// window starved, and '0 probes' marks the bearing branch eating every pass
// (face 15: all five timeouts are zero-probe - the v0.367.0 stall latch
// never fired there, no stall line exists). The cure's field leg (face 16)
// must convert this class: stall lines first, probes > 0, released leaving
// 0, dry-tail timeouts shrinking toward 0. Mining-surface only: zero fleet
// wiring, zero new log lines.
const timeoutTailRe = /water: rescue timeout \(still wet, (\d+) passes, (\d+) probes, tail (dry|wet)\/(dry|wet)\/(dry|wet)\)/
const tailDist = {}
let stableT = 0; let nearT = 0; let zeroProbeT = 0; let totalT = 0
const stableBots = {}
for (const l of lines) {
  const m = typeof l === 'string' ? l.match(timeoutTailRe) : null
  if (!m) continue
  totalT++
  const dry = [m[3], m[4], m[5]].filter(s => s === 'dry').length
  tailDist[`${dry}dry/3`] = (tailDist[`${dry}dry/3`] || 0) + 1
  const bot = (l.match(/^F(\d+)\s/) || [])[1]
  if (dry === 3) { stableT++; if (bot) stableBots[`F${bot}`] = (stableBots[`F${bot}`] || 0) + 1 }
  if (dry === 2) nearT++
  if (m[2] === '0') zeroProbeT++
}
console.log('--- RELEASE STARVATION CENSUS (v0.376.0) ---')
console.log('  timeout tails (dry reads of 3):', Object.entries(tailDist).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}x${n}`).join(' ') || 'none')
console.log(`  surface-stable timeouts (tail dry/dry/dry - the release's own tail criterion held at budget death): ${stableT}`, 'per-bot:', fmt(stableBots))
console.log(`  near-surface timeouts (2 of 3 tail dry): ${nearT}`)
console.log(`  zero-probe timeouts (the bearing branch ate every pass): ${zeroProbeT} of ${totalT}`)
console.log('  per-bot glitch pages(air-bar ignored):', fmt(perBot(/air-bar glitch ignored/)))
console.log('  liar ladder ratchets:', count(/liar ladder ratchets/), 'per-bot:', fmt(perBot(/liar ladder ratchets/)))
console.log('  liar ladder resets:', count(/liar ladder resets/))
console.log('  overrides (believe the bar):', count(/air-bar glitch override/))
console.log('  wet-critical fast window:', count(/wet-critical fast window/))
console.log('  GRACE HOLD/VOID:', count(/GRACE (HOLD|VOID)/), ' STORM PROBE:', count(/STORM PROBE/), ' FATAL:', count(/FATAL/))
// (v0.371.0) THE DROWNED-HOUND CENSUS - face 15 (36760275928, the first
// SUCCESS face the ledger read) showed the drowning SOURCE the rescue net
// only ever mops after: drowned mobs hound the wet bot while it swims, the
// combat layer answers 'flee toward shore vs drowned (proximity)' dozens of
// times a face, the re-verdict subclass marks the hound that re-engaged, and
// the death lines split 'drown context' (the water did it) from
// 'drowned-kill context' (the mob did it - the hound won). The rescue
// ledger's starts count the SYMPTOM; this census counts the PRESSURE - the
// decode that prices a cure (the hound front) needs both, and the tool must
// read them (the blind-tool lesson). Mining-surface only: zero fleet wiring,
// zero new log lines - the census reads the lines the combat and death
// blocks already own.
console.log('--- DROWNED-HOUND CENSUS (v0.371.0) ---')
console.log('  flee-shore vs drowned:', count(/combat: flee toward shore \([0-9,-]+ step [0-9]+\) vs drowned \(proximity\)/), 'per-bot:', fmt(perBot(/combat: flee toward shore \([0-9,-]+ step [0-9]+\) vs drowned \(proximity\)/)))
console.log('  hound re-verdicts (the re-engaged hound):', count(/vs drowned \(proximity re-verdict\)/))
console.log('  death drown context (the water did it):', count(/death: drown context/))
console.log('  death drowned-kill context (the hound won):', count(/death: drowned-kill context/))
// (v0.373.0) THE HOUND-KILL SPLIT - the death context's first field names
// the arena: 'dry-shore' (feet air, water none - the hound chased the flee
// ashore and won on LAND, the shore is not a safe haven) vs 'in-water' (the
// hound won in the swim). Five dry-shore kills across the held artifacts
// (face 12 x2, face 13 x2, face 15 x1) name the decode: the dry-shore hound
// needs a COMBAT answer, not a swim answer - pricing that cure starts with
// counting the arenas separately.
console.log('  hound-kill arenas: dry-shore', count(/drowned-kill context \(dry-shore/), '| in-water', count(/drowned-kill context \(in-water/))
console.log('  dry-shore hound kills per-bot:', fmt(perBot(/drowned-kill context \(dry-shore/)))
// (v0.375.0) THE TRAPPED-FLEE READ - the flee line's (dX,dZ) is the shore
// bearing the combat layer chose; face 15 showed F12 re-choosing the SAME
// bearing (3,6) event after event - a flee into the same pocket the hound
// owns, and the re-verdicts are the hound re-engaging the trapped flee. A
// trapped flee cannot be outrun by repeating it: the cure (a bearing
// diversity rule or a climb-out) prices off this histogram. Both verdicts
// count (plain + re-verdict) - the pressure per bearing is the signal.
// Mining-surface only: zero fleet wiring, zero new log lines.
const fleeBearing = {}
for (const l of lines) {
  const m = typeof l === 'string' ? l.match(/^(F\d+)\b.*combat: flee toward shore \((-?\d+),(-?\d+) step \d+\) vs drowned \(proximity/) : null
  if (!m) continue
  const k = `${m[1]}(${m[2]},${m[3]})`
  fleeBearing[k] = (fleeBearing[k] || 0) + 1
}
console.log('  flee bearings repeated >=2:', Object.entries(fleeBearing).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}x${n}`).join(' ') || 'none (every flee chose a fresh bearing)')
console.log('  flee bearing diversity:', Object.keys(fleeBearing).length, 'distinct bearings over', Object.values(fleeBearing).reduce((a, b) => a + b, 0), 'flee events')
console.log('  drowned-kill per-bot:', fmt(perBot(/death: drowned-kill context/)))
// (v0.379.0) THE O2-RESET DEATH CENSUS - the sensor-class ledger gains its
// third entry: the oxygen read RESET (reset(-1), the lost read rendered) and
// the death context names the two forms it kills in - face 17 paid the
// rescue-active blind form (F12 drowned head-AIR while the rescue lane flew
// blind on the reset sensor) and face 18 paid the deadlier rescue-never form
// TWICE (F16, F11: head water, the trigger itself blind, the rescue never
// armed) - 3 deaths in 2 faces, zero in face 16. The common shape is the
// breath-mirror controls-blind page: the sentry's sight died 30-36s before
// death, the o2 burned unwatched while the owner failed. The cure (arm the
// rescue on the mirror's last-known o2, or on sight-loss + head water alone)
// prices off this census: the form split says WHICH blind lane to fix first.
// Mining-surface only: zero fleet wiring, zero new log lines.
const o2ResetDeathRe = /death: drown context \(o2 reset\(-1\), feet water, head (water|air), rescue ([^,]+), leg .*, wet ([^)]+)\)/
const o2Bots = {}; let o2Never = 0; let o2Active = 0; let o2HeadWater = 0; let o2HeadAir = 0
for (const l of lines) {
  const m = typeof l === 'string' ? l.match(o2ResetDeathRe) : null
  if (!m) continue
  const bot = (l.match(/^(F\d+)\b/) || [])[1]
  if (bot) o2Bots[bot] = (o2Bots[bot] || 0) + 1
  if (m[2] === 'never') o2Never++; else o2Active++
  if (m[1] === 'water') o2HeadWater++; else o2HeadAir++
}
console.log('--- O2-RESET DEATH CENSUS (v0.379.0) ---')
console.log(`  o2 reset(-1) drown deaths (the sensor died and the water kept it): ${o2Never + o2Active}`, 'per-bot:', fmt(o2Bots))
console.log(`  rescue never (the trigger itself blind): ${o2Never} | rescue active (the lane flew blind): ${o2Active}`)
console.log(`  head water at death: ${o2HeadWater} | head air at death (the bob class): ${o2HeadAir}`)
console.log('  breath-mirror blindness pages (the sentry died first):', count(/breath mirror \[controls-blind\]/), 'per-bot:', fmt(perBot(/breath mirror \[controls-blind\]/)))
const sightSecs = []
for (const l of lines) {
  const m = typeof l === 'string' ? l.match(/sight died (\d+)s before death/) : null
  if (m) sightSecs.push(Number(m[1]))
}
console.log('  sight-loss windows (s before death):', sightSecs.length ? sightSecs.join(', ') : 'none')
console.log('  o2=reset(-1) pass lines (the blind reads between starts):', count(/o2=reset\(-1\)/))
// (v0.382.0) THE BANK-FLOW CENSUS - face 19 (36802577873) closed 19/19 ALIVE
// with a 495u pocket still unbanked (38.6% of it crafted-class surplus the
// mined counter never sees) and the flow-priced budgets naming the gap: the
// static 248s window vs 2433-2789s of delivery need at the observed flow
// (11 static windows), both stranded pockets zero-delivered ('the walk never
// delivered'). The end-phase bank lines already print every number the
// walk-deliveries cure needs; the tool never read them (the blind-tool
// lesson). The pure parser lives in src/lib/bankcensus.mjs (unit-pinned);
// this block is its field read. Mining-surface only: zero fleet wiring,
// zero new log lines - the v0.379.0 precedent.
// (v0.384.0) THE GRANTED-CLOCK FIX - the v0.382.0 census modeled the budget
// line's suffix from imagination ('is not covered'): the field line ends 'is
// not a rate - priced at the ex-burst N.Nu/s' (the v0.348.0 guard's words)
// plus ' - clamped to Ns (the kill margin)' - and face 19's four lines are
// ALL clamped to 300s against a 2433-2789s need: the GRANTED share is 11%,
// the deficit is structural (the kill margin owns it by construction - the
// v0.41.0 clamp law). The cure's lever is EARLIER delivery (a mid-run
// deliverability arm when pocket/rate outruns the time left), not a longer
// final clock. Cure criteria (face 21+): grantedSharePct leaving the teens,
// strandedZeroDelivered shrinking, the crafted-class share shrinking.
console.log('--- BANK-FLOW CENSUS (v0.382.0) ---')
const bankCensus = bankFlowCensus(lines)
if (bankCensus.loot) console.log(`  loot ledger: mined ${bankCensus.loot.mined} banked ${bankCensus.loot.banked} pocket ${bankCensus.loot.pocketUnits}u surplus ${bankCensus.loot.surplus}u conversion ${bankCensus.loot.conversionPct}%`)
if (bankCensus.pocket) console.log(`  pocket anatomy: ${bankCensus.pocket.holders} holders, top ${bankCensus.pocket.topBot} ${bankCensus.pocket.topUnits}u (${bankCensus.pocket.topPct}%) - ${bankCensus.pocket.tail}`)
if (bankCensus.surplus) console.log(`  surplus face: crafted-class ${bankCensus.surplus.craftedUnits}u of ${bankCensus.surplus.pocketUnits}u (${bankCensus.surplus.craftedPct}%), top ${bankCensus.surplus.top.map((t) => `${t.item} ${t.units}u`).join(', ') || 'none'}`)
if (bankCensus.flow) console.log(`  bank flow: ${bankCensus.flow.rateUPerS}u/s (+${bankCensus.flow.bankedDelta}u over ${bankCensus.flow.windowS}s) - the ${bankCensus.flow.pocketUnits}u pocket needs ${bankCensus.flow.secondsPastDeadline}s past the deadline`)
if (bankCensus.budgetAgg) console.log(`  flow-priced budgets: ${bankCensus.budgetAgg.count} printed, ${bankCensus.budgetAgg.clamped} clamped by the kill margin, granted max ${bankCensus.budgetAgg.grantedMaxS ?? 'n/a'}s vs max need ${bankCensus.budgetAgg.maxNeedsS}s = ${bankCensus.budgetAgg.grantedSharePct != null ? bankCensus.budgetAgg.grantedSharePct + '% granted share' : 'the clock moved free'} (per-bot: ${bankCensus.budgets.map((b) => `${b.bot}=${b.flowPricedS}s${b.grantedS != null ? `->${b.grantedS}s` : ''}${b.burst ? ` ex-burst ${b.burst.exBurstRate}u/s` : ''}`).join(' ') || 'none'})`)
if (bankCensus.attribution) console.log(`  stranded pockets (the walk never delivered): ${bankCensus.attribution.stranded.map((s) => `${s.bot} ${s.deliveredU}u/${s.pocketU}u`).join(', ') || 'none'} - zero-delivered: ${bankCensus.attribution.strandedZeroDelivered}`)
if (bankCensus.writeOff.length) console.log(`  final write-off: ${bankCensus.writeOff.map((w) => `${w.bot} ${w.units}u/${w.seconds}s`).join(', ')}`)
if (bankCensus.doom?.why) console.log(`  bank doom why: ${bankCensus.doom.why.whyClass} owns ${bankCensus.doom.why.carried} of ${bankCensus.doom.why.total} failed climb cycles (${bankCensus.doom.why.pct}%)`)
// (v0.387.0) THE DELIVERABLE CENSUS - the v0.385.0 arm's cause line (the
// priced numbers ride it). Cure criteria (face 21+): the arm fires exactly
// when the final bank would say uncovered (never on a drip - the leanness
// law), clamp vs clock names the structural vs temporal split, and the
// worst priced deficit is the whale's mid-run face. A pre-arm tree (face
// 19 and older) speaks nothing here - the null IS the baseline.
if (bankCensus.deliverable) {
  console.log(`  deliverability arm (v0.385.0): ${bankCensus.deliverable.fires} firings (clamp ${bankCensus.deliverable.clampFires} / clock ${bankCensus.deliverable.clockFires}), bots ${bankCensus.deliverable.bots.join(',') || 'none'} - worst priced deficit ${bankCensus.deliverable.worstDeficitS}s (max need ${bankCensus.deliverable.maxNeedS}s vs min granted/left ${bankCensus.deliverable.minLimitS ?? 'n/a'}s)`)
  for (const e of bankCensus.deliverable.events) console.log(`    ${e.bot} ${e.term}: pocket ${e.pocketU}u at ${e.rateUPerS ?? '?'}u/s needs ${e.needS ?? '?'}s vs ${e.limitS ?? '?'}s`)
}
if (!bankCensus.loot && !bankCensus.budgetAgg) console.log('  (no end-phase bank block - a FATAL face truncates it)')

// (v0.388.0) THE ROUTE-GATE CENSUS - the v0.386.0 route gate's field read
// (the blind-tool lesson applied to my own arm before the field needs it,
// the v0.382.0/v0.387.0 census siblings). The gate's planned-route vetoes
// already print their whole anatomy; this block reads it: the refusal
// count, the tier split (point records vs zone envelopes), the depth-law
// mix (entry vs dive), the per-bot/per-label rows, the condemned cells and
// the rim-trap suspects (a COUNT proxy - the fleet log carries no per-line
// clock; a sustained burst on one bot is the every-route-out-refused shape
// the grace/cap knobs would tune).
console.log('--- ROUTE-GATE CENSUS (v0.388.0) ---')
const routeCensus = routeGateCensus(lines)
if (routeCensus.refusals > 0) {
  console.log(`  route gate: ${routeCensus.refusals} refusals (point ${routeCensus.byTier.point} / zone ${routeCensus.byTier.zone}; entry-law ${routeCensus.lawMix.entry} / dive-law ${routeCensus.lawMix.dive})`)
  const botRow = Object.entries(routeCensus.byBot).map(([b, n]) => `${b}=${n}`).join(' ')
  if (botRow) console.log(`  per-bot: ${botRow}`)
  const labelRow = Object.entries(routeCensus.byLabel).map(([lb, n]) => `${lb}=${n}`).join(' ')
  if (labelRow) console.log(`  per-label: ${labelRow}`)
  const cellRow = routeCensus.cells.map((c) => `[${c.cell.x},${c.cell.y},${c.cell.z}]x${c.count}`).join(' ')
  if (cellRow) console.log(`  condemned cells: ${cellRow}`)
  if (routeCensus.rimTrapSuspects.length) console.log(`  RIM-TRAP SUSPECTS (>= ${ROUTE_GATE_RIM_TRAP_REFUSALS} refusals on one bot - a transient rim heals inside the 120s ledger TTL, a sustained burst is the tuning signal): ${routeCensus.rimTrapSuspects.join(', ')}`)
} else {
  console.log('  route gate: 0 refusals (no planned-route veto fired this face)')
}
// (v0.390.0) THE SHOOTER-BAND CENSUS - the combat layer's field read (the
// v0.388.0 route-gate census sibling). The layer already prints its whole
// anatomy on every engagement - the verb, the attacker, the priced
// distance - face 15 carried 668 combat lines and the mining tool read
// three substrings of them. This block reads the band: the total, the
// attacker rows, the RANGED class (the arrow wall / ranged ring / cooldown
// the mobs kill from), the verdict flips, the shelter split, the priced
// engagement distance and any UNKNOWN verbs (the honest-sweep law - a
// wording drift prints its own name instead of vanishing). Zero-engagement
// faces (the wet 18/19) read an honest zero.
console.log('--- SHOOTER-BAND CENSUS (v0.390.0) ---')
const shooter = shooterCensus(lines)
if (shooter.total > 0) {
  const atkRow = Object.entries(shooter.byAttacker).map(([a, n]) => `${a}=${n}`).join(' ')
  console.log(`  combat lines: ${shooter.total} (attackers: ${atkRow || 'none priced'})`)
  const botRow = Object.entries(shooter.byBot).map(([b, n]) => `${b}=${n}`).join(' ')
  if (botRow) console.log(`  per-bot: ${botRow}`)
  // (v0.393.0) THE COMBAT-WHALE LENS - the top bots' verb splits (byBot says
  // WHO carries the lines, byVerb says WHAT the face did; only the cross
  // says what the WHALE was doing)
  for (const [b, n] of Object.entries(shooter.byBot).sort((a, b2) => b2[1] - a[1]).slice(0, 2)) {
    const vr = Object.entries(shooter.byBotVerb[b] || {}).sort((a, b2) => b2[1] - a[1]).map(([v, c]) => `${v}=${c}`).join(' ')
    console.log(`  combat-whale lens ${b} (${n} lines): ${vr || '-'}`)
  }
  // (v0.395.0) THE WHALE-FEED LENS - the sessions behind the top bots'
  // line counts: churn (many short sessions) vs SIEGE (one long one -
  // face 15's F2 reads 287 lines / 3 sessions, max 278: THE SIEGE READ).
  const feedRow = Object.entries(shooter.byBot).sort((a, b2) => b2[1] - a[1]).slice(0, 2)
    .map(([b, n]) => {
      const s = shooter.sessions.byBot[b]
      return s ? `${b} ${n} lines / ${s.sessions} sessions (max ${s.maxLen})` : `${b} ${n} lines`
    })
    .join(' | ')
  if (feedRow) console.log(`  whale feed (split on fight-end/yield or > ${shooter.sessions.gapS}s silence): ${feedRow}`)
  // (v0.400.0) THE SIEGE VERDICT - the diffusion question answered per
  // face: a bot whose longest session reaches the bound carries THE SIEGE
  // (face 15's F2: max 278 >= 120); the churn octave (F12: max 53) never
  // does. An empty map reads 'none' - the honest zero (faces 17/18/19).
  {
    const siegeBots = Object.entries(shooter.sessions.siegeByBot || {})
    const maxOf = Object.values(shooter.sessions.byBot || {}).reduce((m, s) => Math.max(m, s.maxLen), 0)
    const verdict = siegeBots.length > 0
      ? siegeBots.map(([b, m]) => `${b} (max session ${m} >= ${shooter.sessions.siegeMinLen})`).join(', ')
      : `none (max session ${maxOf} < ${shooter.sessions.siegeMinLen})`
    console.log(`  SIEGE verdict: ${verdict}`)
  }
  console.log(`  RANGED band: ${shooter.ranged.events} events (arrow wall ${shooter.ranged.arrowWall} / ring-ranged refused ${shooter.ranged.ringRangedRefused} / cooldown armed ${shooter.ranged.cooldownArmed}; per-attacker: ${Object.entries(shooter.ranged.byAttacker).map(([a, n]) => `${a}=${n}`).join(' ') || '-'})`)
  // (v0.394.0) the wall-miss row - the wall-scan verdict line (formerly
  // 'shelter skip (open field: no diggable wall ...)') is a ROUTE MARKER,
  // not a skip: the ring attempt follows and may succeed. Naming it a skip
  // double-counted one attempt as two skips (face 15: 150 skips / 76 tries).
  // The terrain class of the shelter cure reads THIS row now.
  console.log(`  verdict flips: ${shooter.verdictFlips} - shelter: tries ${shooter.shelter.tries} / skips ${shooter.shelter.skips} / ring-tries ${shooter.shelter.ringTries} / wall-miss ${shooter.shelter.wallMiss ?? 0}`)
  if (shooter.shelter.skips > 0) {
    // (v0.391.0) the why split - the shelter cure's design input (ring-stock
    // prices inventory, no-diggable-wall prices terrain/tool,
    // ring-not-buildable prices the pattern; a multi-reason skip counts in
    // every reason class, so the sum may exceed the skip count)
    const whyRow = Object.entries(shooter.skipWhys).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}=${n}`).join(' ')
    console.log(`  skip whys (co-occurrence census - the sum may exceed ${shooter.shelter.skips}): ${whyRow || '-'}`)
  }
  // (v0.398.0) THE SEAL-STOCK BASELINE - the v0.396.0 reserve's before/after
  // metric: face 15 reads 43 ring-stock skips / 41 zero-have (95%, the
  // corrected live read) - the post-reserve faces must walk the share DOWN.
  if (shooter.ringStock.seen > 0) {
    const pct = Math.round(100 * shooter.ringStock.zeroHave / shooter.ringStock.seen)
    const pairRow = Object.entries(shooter.ringStock.pairs).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p}=${n}`).join(' ')
    console.log(`  seal-stock baseline: ${shooter.ringStock.seen} ring-stock skips, ${shooter.ringStock.zeroHave} zero-have (${pct}%) - pairs: ${pairRow}`)
    // (v0.401.0) THE SEAL ROSTER - who arrives seal-empty: per-bot
    // seen/zeroHave, the reserve's blind-spot detector (a bot still at
    // zero AFTER the reserve names where the cure missed)
    const roster = Object.entries(shooter.ringStock.byBot || {}).sort((a, b) => b[1].zeroHave - a[1].zeroHave)
      .map(([b, s]) => `${b} ${s.zeroHave}/${s.seen}`).join(' ')
    if (roster) console.log(`  seal roster (zero/seen per bot): ${roster}`)
  }
  if (shooter.maxDist !== null) console.log(`  engagement dist: max @${shooter.maxDist}u priced across ${shooter.withDist} dists`)
  const verbRow = Object.entries(shooter.byVerb).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => `${v}=${n}`).join(' ')
  if (verbRow) console.log(`  top verbs: ${verbRow}`)
  const otherRow = Object.entries(shooter.otherVerbs).map(([v, n]) => `${v}=${n}`).join(' ')
  if (otherRow) console.log(`  UNKNOWN verbs (the vocabulary drifted - name them): ${otherRow}`)
} else {
  console.log('  combat: 0 lines (no mob engagement this face - the honest zero)')
}
// (v0.358.0) THE FREEZE-STORM + NUDGE BLOCK - face 36740244530 (the first
// FATAL face, exit 143) was mined by hand because the tool counted none of
// its classes: the frozen-relog loop (#N consecutive + the bypass echoes),
// the freeze closure's own anatomy, and the nudge family's field legs (the
// v0.356.0 side-step ladder, the v0.355.0 re-segment) rode the artifact
// unread. A FATAL face never prints the FLEET RESULT - the mid-run lines
// are ALL the account there is; the tool must read them.
console.log('--- FROZEN-RELOG LOOP / FREEZE CLOSURE ---')
console.log('  frozen client relogs:', count(/frozen client relog/), 'per-bot:', fmt(perBot(/frozen client relog/)))
console.log('  gate bypassed (critical):', count(/gate bypassed \(critical read/), ' (wet cycler):', count(/gate bypassed \(wet cycler/))
console.log('  gate holds the page:', count(/frozen-return gate holds the page/))
console.log('  frozen physics standdowns:', count(/rescue standing down \(frozen physics/))
console.log('  ticking-flat freeze names:', count(/freeze named ticking-flat/))
console.log('  hazard memorized:', count(/hazard memorized/))
console.log('--- NUDGE FAMILY FIELD LEGS ---')
console.log('  nudge approach verdicts:', count(/path nudge approach:/), 'per-bot:', fmt(perBot(/path nudge approach:/)))
console.log('  nudge inside envelope:', count(/inside the direct envelope\)/), ' still outside:', count(/still outside/))
console.log('  stall side-step lines:', count(/stall side-step/), 'per-bot:', fmt(perBot(/stall side-step/)))
console.log('  envelope re-segment lines:', count(/envelope re-segment/))
console.log('  singular probe rescues:', count(/the singular probe rescued the scan/))

// (v0.360.0) THE FACE-14 LEGS - face 14 (dispatched on 22876eb) carries FOUR
// unproven field legs and the tool must read each one's row or mid-run line:
// the WET verdict class (v0.357.0 - an all-wet face downgrades to
// 'storm verdict: WET - N air glitches (N wet-rescued, dry 0)'), the DRY
// DIET tail (v0.359.0 - a mixed whale names ', wet-rescued N', an all-wet
// whale leaves the diet silent), the honest hole's first live read (0.356.0
// - 'sensor liar census: F.. disproved N reads'), and the assist burst cap's
// neighborhood (the climb rise assist lines, the pf: last-pulse chain, the
// freeze-storm FATAL the 24/500 pair must kill). A FATAL face never prints
// the FLEET RESULT - the mid-run legs stay the account (the v0.358.0
// lesson), so the burst-cap counts ride beside the result-row counts.
console.log('--- FACE-14 LEGS (the storm family rows + the burst-cap neighborhood) ---')
console.log('  verdict STORM:', count(/storm verdict: STORM/), ' WET:', count(/storm verdict: WET/), ' CALM:', count(/storm verdict: CALM/))
console.log('  verdict wet-rescued tails:', count(/storm verdict: .*wet-rescued/))
console.log('  storm diet rows:', count(/storm diet:/), ' diet wet tails:', count(/storm diet: .*wet-rescued/))
console.log('  air-bar ledger rows:', count(/air-bar ledger:/))
console.log('  sensor liar census rows:', count(/sensor liar census:/))
console.log('  sentry per-bot rows:', count(/sentry per-bot:/))
console.log('  freeze storm FATAL lines:', count(/freeze storm/))
console.log('  last-pulse chain lines (pf:):', count(/pf:(goal|queue|done)/))
console.log('  climb rise assist lines:', count(/climb rise assist/), 'per-bot:', fmt(perBot(/climb rise assist/)))
console.log('  assist timeouts (the 4.5s class):', count(/climb rise assist: .*timeout/))

console.log('=== GOAL BRAKE / DUCK / VALVE ===')
console.log('  brake refuse lines:', count(/goal brake:.*refus/), 'per-bot:', fmt(perBot(/goal brake:.*refus/)))
console.log('  spin breaker lines:', count(/spin breaker/), 'per-bot:', fmt(perBot(/spin breaker/)))
console.log('  fleet ceiling lines:', count(/fleet goal ceiling/))
console.log('  stormduck lines:', count(/\[stormduck\]/))
console.log('  allocvalve lines:', count(/\[allocvalve\]/))
console.log('  walk governor churn:', count(/walk governor.*churn/))

console.log('=== CRAFT / SMELT / FUEL (the verified craft + the ladder) ===')
console.log('  quiet craft:', count(/the quiet craft/))
console.log('  named silent exit:', count(/the named silent exit/))
console.log('  craft success lines:', count(/batch\(es\)/))
console.log('  per-bot craft batches:', fmt(perBot(/batch\(es\)/)))
console.log('  smelt lines:', count(/smelt/i))
console.log('  fuel anchor:', count(/fuel anchor/), ' fuel commons:', count(/fuel commons/), ' fuelbank:', count(/fuelbank|bank fuel/i))
console.log('  iron lines:', count(/iron/))
console.log('  ladder lead lines:', count(/ladder/))

console.log('=== BANK / DEPOSIT ===')
console.log('  bank visits:', count(/bank(ed)?[: ]/i) > 0 ? count(/\bbank\b/) : 0)
console.log('  bank fallback/budget exhausted:', count(/budget exhausted/))
console.log('  chest unreachable:', count(/chest unreachable/))
console.log('  deposit probe:', count(/deposit/i))

// (v0.397.0) THE SEAL-RESERVE CENSUS - the deposit-side keep families
// (fuel/cobble/smelt tithes + the v0.396.0 seal reserve) were never read
// by the tool; their bounded self-naming (first 2 firings named, a 3rd
// rides the rider line, the rest silent) is the log's ONLY account of
// how often the keeps fired. The seal family's field leg is new with
// the reserve itself - its first fleet contact rides the NEXT face
// (face 22 runs c387008, pre-reserve).
console.log('--- SEAL-RESERVE CENSUS (v0.397.0: the four bounded keep families) ---')
const seal = sealCensus(lines)
for (const fam of SEAL_FAMILIES) {
  const f = seal[fam]
  const items = Object.entries(f.byItem).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'
  const kept = Object.entries(f.kept).sort((a, b) => b[1] - a[1]).map(([k, v]) => `keep${k}x${v}`).join(' ') || '-'
  console.log(`  ${fam}: named firings ${f.banked}, units ${f.units}, riders ${f.riders} (each = a 3rd+ silent firing), bots ${f.bots.join(',') || 'none'}`)
  if (f.banked || f.riders) {
    console.log(`    by item: ${items}`)
    console.log(`    kept floors: ${kept}`)
  }
}

// (v0.399.0) THE HOP-ZERO CENSUS - the walk-deliveries class's field read.
// The hop is the deposit chain's cheapest delivery; a zero-hop is the
// machinery bleeding where it costs least (face 22: 24 zeros - goal-churn
// 8, walk-timeout 5, decide-timeout 4, no-path 3, open-timeout 2,
// brake-refusal 1, nothing-to-deposit 1). The goal-churn class is the
// storm's own signature (goals replaced mid-walk); the timeouts price the
// budget's honesty (a 28s walk timeout against a 15s budget is the
// budget's own lie).
console.log('--- HOP-ZERO CENSUS (v0.399.0: the walk-deliveries class) ---')
const hopZero = hopCensus(lines)
if (hopZero.total > 0) {
  const whys = Object.entries(hopZero.byWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
  const bots = Object.entries(hopZero.byBot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
  console.log(`  zero-hops: ${hopZero.total} by why: ${whys || 'none'}`)
  console.log(`  per bot: ${bots || 'none'}`)
  const hot = Object.entries(hopZero.byChest).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `[${k}]x${v}`).join(' ')
  if (hot) console.log(`  hot chests (repeat zero positions): ${hot}`)
  if (hopZero.timeouts.walk.length) {
    console.log(`  walk timeouts ms: ${hopZero.timeouts.walk.join(',')}`)
    // (v0.404.0) THE RE-PRICE SPLIT: the v0.56.0 short-hop pin (d<=16 -> 15s)
    // retired - a walk-timeout at EXACTLY 15000ms is the pin's fingerprint,
    // so the split prices the cure's field leg (post-cure, the <=15s class
    // should shrink to the chain-clamped stragglers only).
    const w = hopZero.timeouts.walk
    const pinned = w.filter((m) => m === 15000).length
    const under = w.filter((m) => m < 15000).length
    const base = w.filter((m) => m > 15000).length
    console.log(`  walk budget split (the v0.404.0 re-price verdict): pinned(=15s)=${pinned} chain-clamped(<15s)=${under} base(>15s)=${base}`)
  }
  if (hopZero.timeouts.open.length) console.log(`  open timeouts ms: ${hopZero.timeouts.open.join(',')}`)
  if (hopZero.dists.n) console.log(`  dist: n=${hopZero.dists.n} max=${hopZero.dists.max} avg=${(hopZero.dists.sum / hopZero.dists.n).toFixed(1)}`)
} else {
  console.log('  zero-hops: 0 (a clean delivery face - the honest zero)')
}

console.log('=== COMBAT (v0.135.0 instrument) ===')
console.log('  fight ended:', count(/combat: fight ended/), 'per-bot:', fmt(perBot(/combat: fight ended/)))
console.log('  fighting lines:', count(/combat: fighting/))
const verdicts = {}
for (const l of lines) {
  const v = l.match(/fight ended vs \w+ \(verdict (\w+)/)
  if (v) verdicts[v[1]] = (verdicts[v[1]] || 0) + 1
}
console.log('  fight verdicts:', fmt(verdicts))

console.log('=== STORM GUARD / PULSE ===')
console.log('  looppulse notes:', count(/pulse/), ' lag probe:', count(/lag.probe/i))
console.log('  mem lines (last 5):')
for (const l of lines.filter(l => /mem:|rss/i.test(l)).slice(-5)) console.log('   ', l.slice(0, 150))

console.log('=== RELOOT (the death economy, v0.200.0+; the v0.207.0 retry classes) ===')
console.log('  arms (walking):', count(/reloot: walking to the own death spot/), 'per-bot:', fmt(perBot(/reloot: walking to the own death spot/)))
console.log('  arrivals:', count(/reloot: arrived in/))
const relootWhys = {}
for (const l of lines) {
  const w = l.match(/reloot: no walk \(([^)]+)\)/)
  if (w) relootWhys[w[1].split(' ')[0]] = (relootWhys[w[1].split(' ')[0]] || 0) + 1
}
console.log('  refusal whys:', fmt(relootWhys))
console.log('  walk failures:', count(/reloot: walk failed/))
console.log('  no-path retries armed:', count(/reloot: no-path retry at range/), 'per-bot:', fmt(perBot(/reloot: no-path retry at range/)))
console.log('  retry arrivals:', count(/reloot: retry arrived in/))
console.log('  retry failures:', count(/reloot: retry failed/))
console.log('  combat flee yields (open-field lens):', count(/combat: open-field yield vs/))
console.log('  refused retries (no retry: why):', count(/reloot: walk failed.*\(no retry: /))
console.log('  surface retries armed:', count(/reloot: surface retry at/), 'per-bot:', fmt(perBot(/reloot: surface retry at/)))
console.log('  surface arrivals:', count(/reloot: surface arrived/))
console.log('  surface failures:', count(/reloot: surface failed/))
console.log('  refused surfaces (no surface: why):', count(/reloot: retry failed.*\(no surface: /))
const surfaceWhys = {}
for (const l of lines) {
  const w = l.match(/reloot: retry failed.*\(no surface: ([^)]+)\)/)
  if (w) surfaceWhys[w[1].split(' ')[0]] = (surfaceWhys[w[1].split(' ')[0]] || 0) + 1
}
console.log('  surface refusal whys:', fmt(surfaceWhys))
// (v0.221.0) THE RIM DIG - the ladder's fourth leg (the sealed pool's exit
// ramp): the arm, the opened seal, the honest verdicts and the guard's holds
// each count separately (the decode reads the field debut's anatomy).
console.log('  rim dig arms:', count(/reloot: rim dig at \[/), 'per-bot:', fmt(perBot(/reloot: rim dig at \[/)))
console.log('  rim dig seals opened:', count(/reloot: rim dig opened the seal/))
console.log('  rim dig dones:', count(/reloot: rim dig done in/))
console.log('  rim dig failures:', count(/reloot: rim dig failed/))
console.log('  rim dig guard holds:', count(/reloot: rim dig held/))
console.log('  rim dig refusals:', count(/reloot: rim dig refused/))
console.log('  rim dig skips:', count(/reloot: rim dig skipped/))

// (v0.223.0) THE WET CHURN - the after-storm evacuation's field face: the
// arms name the storm bots (the per-bot cadence read the plan priced), the
// releases read the hold's exits, the swap lines split dry wood from rest.
console.log('=== WET CHURN (the evacuation, v0.223.0+) ===')
console.log('  evacuations armed:', count(/churn: evacuation armed/), 'per-bot:', fmt(perBot(/churn: evacuation armed/)))
console.log('  evacuations released:', count(/churn: evacuation released/), 'per-bot:', fmt(perBot(/churn: evacuation released/)))
console.log('  arm counts:', fmt((() => { const m = {}; for (const l of lines) { const a = l.match(/churn: evacuation armed \((\d+) rescues\//); if (a) m[`x${a[1]}`] = (m[`x${a[1]}`] || 0) + 1 } return m })()))
console.log('  rescues during holds still counted by the rescue section (the machinery is untouchable)')

// (v0.225.0) THE DRAGON ZONE - the kill anchor's field face: the entries name
// the walkers (the zone went live only when a magic kill armed the anchor),
// the magic kills themselves count the class that feeds it.
console.log('=== DRAGON ZONE (the evacuation, v0.225.0+) ===')
console.log('  magic kills:', count(/using magic/), 'per-bot:', fmt(perBot(/using magic/)))
console.log('  zone entries:', count(/dragonzone: bot inside the kill zone/), 'per-bot:', fmt(perBot(/dragonzone: bot inside the kill zone/)))

// (v0.228.0) THE SWEEP CENSUS - the harvest sweep's field face: the census
// line (v0.197.0) names every outcome class, the v0.228.0 defer adds the
// storm-defer bucket (run68's 13-refusal burn becomes a named stance).
const occurrences = (re) => lines.reduce((a, l) => a + (l.match(re) ?? []).length, 0)
console.log('=== SWEEP CENSUS (the harvest, v0.139.0+; the v0.228.0 defer) ===')
console.log('  census lines:', count(/ sweep: /), 'per-bot:', fmt(perBot(/ sweep: /)))
console.log('  harvests:', count(/sweep: collected \d+/))
console.log('  zero-histogram lines:', count(/sweep: 0 collected - /))
console.log('  unreachable buckets:', occurrences(/machine unreachable/g))
console.log('  defer announcements:', count(/\] sweep deferred \(the lanes hold\)/), 'per-bot:', fmt(perBot(/sweep deferred/)))
console.log('  busy buckets:', occurrences(/busy x\d+/g))
console.log('  idle-empty reads:', count(/idle-empty machine/))

// (v0.229.0) THE DUSK BANK - the heavy pocket's priced delivery: the arm
// names itself in the bank trip label ladder ('dusk-plan', the same 'bank '
// filter key), the budget line carries the arm, the deliveries ride the
// existing bank rows.
console.log('=== DUSK BANK (the heavy-pocket delivery, v0.229.0+) ===')
console.log('  dusk-plan arms:', count(/bank trip: dusk-plan/), 'per-bot:', fmt(perBot(/bank trip: dusk-plan/)))
console.log('  dusk-plan budgets:', fmt((() => { const m = {}; for (const l of lines) { const a = l.match(/bank trip: dusk-plan budget (\d+)s/); if (a) m[`${a[1]}s`] = (m[`${a[1]}s`] || 0) + 1 } return m })()))
console.log('  legacy dusk arms (the v0.193.0 forecast lane, untouched):', count(/bank trip: dusk /))

console.log('=== PLAN / WORLDMAP ===')
console.log('  map trips:', count(/map trip/i), ' worldmap scans:', count(/worldmap|scan/i))
console.log('  plan lines:', count(/materials plan|plan progress/i))
