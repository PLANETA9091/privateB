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
import { walkFailCensus } from '../../src/lib/walkfail.mjs' // (v0.410.0) the A* starvation's fleet-wide leg (beyond the hop lane)
import { hotspotCensus } from '../../src/lib/hotspot.mjs' // (v0.419.0) the failure geometry's cross-lane read
import { climbOutCensus } from '../../src/lib/climbout.mjs' // (v0.420.0) the vertical doom's verdict read
import { bankFailCensus } from '../../src/lib/bankfail.mjs' // (v0.411.0) the bank lane's own decide/no-path ledger
import { dropWalkCensus } from '../../src/lib/dropwalk.mjs' // (v0.413.0) the vein sweep's per-fail drop-walk line
import { mapTripCensus } from '../../src/lib/maptrip.mjs' // (v0.415.0) the materials plan's launch economics
import { deficitsCensus } from '../../src/lib/deficitrow.mjs' // (v0.417.0) the plan's harvest side (the deficits row's clock)
import { memHbCensus } from '../../src/lib/memhb.mjs' // (v0.408.0) the OOM precursors' field read
import { stormCensus } from '../../src/lib/stormcensus.mjs' // (v0.409.0) the storm EVENT story's field read (verdicts + valve + hb)
import { gcPoolCensus } from '../../src/lib/gcpool.mjs' // (v0.421.0) the GC Pinned hunt's pool read (the old/ext/ab split)

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
    // (v0.407.0) THE DEATH CLOCK - the spiral read mechanical. The end-phase
    // share prices against the log's own clock end; a death before the first
    // heartbeat stays untimed and honestly out of every window.
    const c = sealDeath.clock
    if (c.timed > 0) {
      const untimedNote = c.untimed > 0 ? `, ${c.untimed} untimed (pre-first-hb)` : ''
      const spanNote = c.firstTs === c.lastTs ? `at ts=${c.firstTs}s` : `span ts=${c.firstTs}..${c.lastTs}s`
      console.log(`  death clock: ${c.timed} timed ${spanNote}, clock end ts=${c.clockEnd}s, end-phase(${c.endPhaseWindowS}s) ${c.endPhase}, max burst ${c.maxBurst} in ${c.burstWindowS}s${untimedNote}`)
    }
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
  // (v0.405.0) THE KEEP ARM's row: the reserve's silent branch now
  // self-names (deposit.mjs) and the census reads it - a family that
  // never kept prints the honest zero (faces 23/24's read would have
  // been this row, not '0 firings').
  const keepItems = Object.entries(f.keepByItem).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'
  console.log(`    keep arm: named keeps ${f.keeps}, units held ${f.keepUnits}, keep riders ${f.keepRiders}`)
  if (f.keeps) console.log(`    held by item: ${keepItems}`)
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

// (v0.410.0) THE WALK-FAIL LENS - the A* starvation census's fleet-wide leg.
// The hop-zero census above reads the HOP lane only; the SAME decide/no-path
// starvation walks the tool lanes' own chest walks (fuel commons / iron
// commune / pool seed) and the smelt sweep's per-machine verdicts unread.
// Face 25 attempt 2 carried 79 decide lines - the hop lane owned 42, the
// other 37 rode in shapes nobody parsed. This block reads them and prices
// the fleet-wide starvation beside the hop lane's own count.
{
  const wf = walkFailCensus(lines)
  const hasWalk = wf.walk.total > 0
  const hasSweep = wf.sweep.lines > 0
  if (hasWalk || hasSweep) {
    console.log('--- WALK-FAIL CENSUS (v0.410.0: the A* starvation beyond the hop lane) ---')
  }
  if (hasWalk) {
    const lanes = Object.entries(wf.walk.byLane).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const whys = Object.entries(wf.walk.byWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const bots = Object.entries(wf.walk.byBot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  chest-walk fails: ${wf.walk.total} (nudge ${wf.walk.nudge}) by lane: ${lanes || 'none'}`)
    console.log(`  by why: ${whys || 'none'} - per bot: ${bots || 'none'}`)
    if (wf.walk.timeouts.length) console.log(`  lane walk timeouts ms: ${wf.walk.timeouts.join(',')}`)
  }
  if (hasSweep) {
    const sw = Object.entries(wf.sweep.byWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const sb = Object.entries(wf.sweep.byBot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  sweep verdicts: ${wf.sweep.lines} line(s), machine-unreachable ${wf.sweep.machinesUnreachable} (${sw || 'none'}) busy=${wf.sweep.busy} deferred=${wf.sweep.deferred}${wf.sweep.unparsed ? ` unparsed=${wf.sweep.unparsed}` : ''}`)
    console.log(`  sweep per bot: ${sb || 'none'}`)
    if (wf.sweep.timeouts.length) console.log(`  sweep walk timeouts ms: ${wf.sweep.timeouts.join(',')}`)
  }
  if ((hasWalk || hasSweep) && wf.decideTotal > 0) {
    const hopDecide = hopZero.byWhy['decide-timeout'] || 0
    console.log(`  A* starvation (decide) fleet-wide: walk-fail lanes + sweep = ${wf.decideTotal}, the hop lane's own = ${hopDecide}, total ${wf.decideTotal + hopDecide}`)
    // (v0.413.0) THE DECIDE CLOCK - the cohort's clustering read (the death
    // clock's v0.407.0 shape): a dense burst names a CPU/pressure window;
    // a spread read names geometry.
    const dc = wf.clock
    if (dc.timed > 0) {
      const span = dc.firstTs === dc.lastTs ? `at ts=${dc.firstTs}s` : `span ts=${dc.firstTs}..${dc.lastTs}s`
      const untimed = dc.untimed > 0 ? `, ${dc.untimed} untimed` : ''
      console.log(`  decide clock: ${dc.timed} timed ${span} of clock end ${dc.clockEnd}s, max burst ${dc.maxBurst} in ${dc.burstWindowS}s${untimed}`)
    }
  }
}

// (v0.411.0) THE BANK-FAIL LENS - the bank lane's own decide/no-path ledger.
// The walk-fail lens above read the tool lanes and the sweep; the BANK lane
// - the delivery machinery's heaviest walker - stayed unread. Face 25
// attempt 2 carried 13 bank decide refusals (10 walk-backs - the bot
// ABANDONS the chest and pays the walk home, a whole trip's opportunity
// cost). The block completes the fleet-wide A* starvation read: hop +
// walk-fail lanes + sweep + bank in one row.
{
  const bf = bankFailCensus(lines)
  const hasWb = bf.walkBack.total > 0
  const hasZ = bf.zeros.total > 0
  if (hasWb || hasZ) {
    console.log("--- BANK-FAIL CENSUS (v0.411.0: the bank lane's decide/no-path ledger) ---")
  }
  if (hasWb) {
    const bw = Object.entries(bf.walkBack.byWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const bb = Object.entries(bf.walkBack.byBot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  walk-backs: ${bf.walkBack.total} by why: ${bw || 'none'}`)
    console.log(`  per bot: ${bb || 'none'} - dist from yard: n=${bf.walkBack.dists.n} max=${bf.walkBack.dists.max} avg=${(bf.walkBack.dists.sum / bf.walkBack.dists.n).toFixed(1)}`)
  }
  if (hasZ) {
    const za = Object.entries(bf.zeros.byArm).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const zw = Object.entries(bf.zeros.byWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  zero deliveries: ${bf.zeros.total} by arm: ${za || 'none'} - by why: ${zw || 'none'}`)
  }
  if ((hasWb || hasZ) && bf.decideTotal > 0) {
    const hopDecide = hopZero.byWhy['decide-timeout'] || 0
    const wfDecide = walkFailCensus(lines).decideTotal
    console.log(`  A* starvation GRAND TOTAL (hop + walk-fail + sweep + bank): ${hopDecide + wfDecide + bf.decideTotal} (bank's own = ${bf.decideTotal})`)
    const bc = bf.clock
    if (bc.timed > 0) {
      const span = bc.firstTs === bc.lastTs ? `at ts=${bc.firstTs}s` : `span ts=${bc.firstTs}..${bc.lastTs}s`
      const untimed = bc.untimed > 0 ? `, ${bc.untimed} untimed` : ''
      console.log(`  bank decide clock: ${bc.timed} timed ${span} of clock end ${bc.clockEnd}s, max burst ${bc.maxBurst} in ${bc.burstWindowS}s${untimed}`)
    }
  }
}

// (v0.413.0) THE DROP-WALK LENS - the vein sweep's per-fail drop-walk line.
// The run-level economy rides drops.mjs's own 'sweep drop ledger:' row (the
// failed= split below/plane/above), and the smelt sweep's verdicts ride the
// walk-fail lens - but the PER-FAIL line ('the drop walk to [x,y,z] failed -
// <the walk layer's verdict> (dy D, range R)') stayed unread. Face 26 carried
// 18 of them: the dy family split (the v0.205.0 law), the WHY split (timeout
// vs the doomed-goal ledger vs the fleet goal ceiling) and the timeouts'
// budget-edge read (max == the constant says systemic, scatter says noise).
{
  const dw = dropWalkCensus(lines)
  if (dw.fails > 0 || dw.unparsed > 0) {
    console.log("--- DROP-WALK CENSUS (v0.413.0: the vein sweep's per-fail drop-walk line) ---")
    const db = Object.entries(dw.byBot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const dwy = Object.entries(dw.byWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  drop-walk fails: ${dw.fails}${dw.unparsed ? ` (unparsed ${dw.unparsed})` : ''} by why: ${dwy || 'none'} - per bot: ${db || 'none'}`)
    if (dw.timeouts.n > 0) console.log(`  timeouts: n=${dw.timeouts.n} max=${dw.timeouts.maxMs}ms sum=${dw.timeouts.sumMs}ms`)
    // (v0.418.0) THE WALKED LEG - the timeout anatomy's first split (the row
    // prints only when the field exists in the face): stuck = walked < 1.0
    // (never really moved - the decide-loop / starved-physics class no budget
    // can cure), moved = walked >= 1.0 (the route class - a path existed).
    // maxWalked keeps the raw measurement; walkedNull = the legacy tail.
    if (dw.timeouts.walkedNull < dw.timeouts.n) {
      const mx = dw.timeouts.maxWalked === null ? '?' : dw.timeouts.maxWalked.toFixed(1)
      console.log(`  walked split: stuck=${dw.timeouts.walked0} moved=${dw.timeouts.moved1} (max ${mx}b) legacy=${dw.timeouts.walkedNull}`)
    }
    if (dw.doomed.n > 0) console.log(`  doomed: n=${dw.doomed.n} maxAge=${dw.doomed.maxAgeS}s withSpot=${dw.doomed.withSpot}`)
    if (dw.ceiling.n > 0) console.log(`  ceiling: n=${dw.ceiling.n} maxGoals=${dw.ceiling.maxGoals} maxRefused=${dw.ceiling.maxRefusedS}s`)
    const rng = Object.entries(dw.range).sort((a, b) => a[0] - b[0]).map(([k, v]) => `r${k}=${v}`).join(' ')
    console.log(`  dy families: below=${dw.dy.below} plane=${dw.dy.plane} above=${dw.dy.above} (min ${dw.dy.min} max ${dw.dy.max}) - range: ${rng || 'none'}`)
    // (v0.415.0) THE DROP CLOCK - the fail cohort's WHEN (the walkfail/
    // bankfail v0.413.0 clock's shape): a dense burst names the mid-face
    // concurrent phase, a spread names per-target geometry; the decide
    // GRAND TOTAL untouched - this clock reads fails, not refusals.
    const dwc = dw.clock
    if (dwc.timed > 0) {
      const span = dwc.firstTs === dwc.lastTs ? `at ts=${dwc.firstTs}s` : `span ts=${dwc.firstTs}..${dwc.lastTs}s`
      const untimed = dwc.untimed > 0 ? `, ${dwc.untimed} untimed` : ''
      console.log(`  drop clock: ${dwc.timed} timed ${span} of clock end ${dwc.clockEnd}s, max burst ${dwc.maxBurst} in ${dwc.burstWindowS}s${untimed}`)
    }
  }
}

// (v0.409.0) THE STORM EVENT CENSUS - the stormguard verdicts', the
// allocvalve transitions' and the heartbeat distress' field read. The
// split of labor (the v0.408.0 collision lesson): the gauge precursors
// and the euthanasia locks are the mem-hb lens' MEMORY/OOM PRECURSORS
// block; this census reads the storm's own EVENT story - the rate
// verdicts the gauge cadence can miss, the valve's closures by feeder
// flavor (nobody read the valve's field behavior before), the hb
// late/mainLate peaks.
console.log('--- STORM EVENT CENSUS (v0.409.0: the stormguard verdicts + the allocvalve) ---')
const stormMem = stormCensus(lines)
if (stormMem.hb.count > 0) {
  const hb = stormMem.hb
  console.log(`  heartbeat distress: n=${hb.count} max late=${hb.maxLateMs}ms max mainLate=${hb.maxMainLateMs}ms (rss bookends ${stormMem.rss.firstM}M -> ${stormMem.rss.lastM}M, peak ${stormMem.rss.peakM}M)`)
}
const s = stormMem.storms
if (s.probes + s.fatals > 0) {
  console.log(`  stormguard verdicts: probes=${s.probes} fatals=${s.fatals} peak storm rss=${s.peakStormRssM === null ? '-' : s.peakStormRssM + 'M'} peak rate=${s.peakRateMBs === null ? '-' : s.peakRateMBs + 'MB/s'}`)
}
const v = stormMem.valve
if (v.closures + v.opens > 0) {
  const flavors = Object.entries(v.byFlavor).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(' ')
  console.log(`  allocvalve: closures=${v.closures} (${flavors}) opens=${v.opens} max refused window=${v.maxRefusedS === null ? '-' : v.maxRefusedS + 's'} peak close rss=${v.peakCloseRssM === null ? '-' : v.peakCloseRssM + 'M'}`)
}
if (s.probes + s.fatals + v.closures > 0) {
  console.log(`  storm verdict: the storm EVENT story FIRED this face (verdicts ${s.probes + s.fatals}, valve closures ${v.closures}) - the gauge debt read lives in the MEMORY/OOM PRECURSORS block`)
} else if (stormMem.hb.count === 0) {
  console.log('  reads: 0 (no hb/verdict/valve lines - the face predates them or the fleet leg never ran)')
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

// (v0.415.0) THE MAP-TRIP LENS - the materials plan's own launch economics.
// The plan progress row prices the HAVE side; this block prices the WALK
// side: how many map trips the plan's deficit order even LAUNCHED, what the
// skips refused (the unreachable form embeds its own target list - the
// starved resources priced per name) and where the fleet's feet were (the
// shaft-locked share is the underground economy's tax on the plan).
{
  const mt = mapTripCensus(lines)
  if (mt.launches > 0 || mt.skips.n > 0 || mt.unparsed > 0) {
    console.log('--- MAP-TRIP CENSUS (v0.415.0: the plan\'s launch economics) ---')
    const tgts = Object.entries(mt.byTarget).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const tb = Object.entries(mt.byBot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  launches: ${mt.launches} by target: ${tgts || 'none'} - per bot: ${tb || 'none'}`)
    const sw = Object.entries(mt.skips.byWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const st = Object.entries(mt.skips.unreachableTargets).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const sb = Object.entries(mt.skips.byBot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  skips: ${mt.skips.n} by why: ${sw || 'none'}${st ? ` - starved targets: ${st}` : ''}`)
    console.log(`  skip per bot: ${sb || 'none'}`)
    if (mt.launches + mt.skips.n > 0) {
      const total = mt.launches + mt.skips.n
      console.log(`  launch rate: ${mt.launches}/${total} = ${(100 * mt.launches / total).toFixed(0)}% of the plan's walk asks`)
    }
  }
}

// (v0.417.0) THE DEFICITS CLOCK - the plan's HARVEST side (the map-trip
// lens's complement): the per-tick deficits row (fleet19's topDeficits, the
// anonymous required/have (pct%) five-slot board) stayed unread. The slot-0
// arc prices the worst slot's movement - a drift near zero is the launch
// starvation's harvest-side read; an arc of ONE pct value is the STUCK
// signature; the distinct boards count the ranking's churn (a flat arc with
// high churn reads 'many stuck resources', with low churn 'one stuck all
// face'). The index caveat is the census's own honest read: the row is
// anonymous, the seat's NAME may change hands between rows.
{
  const dc = deficitsCensus(lines)
  if (dc.rows > 0 || dc.unparsed > 0) {
    console.log('--- DEFICITS CLOCK (v0.417.0: the plan\'s harvest side) ---')
    console.log(`  boards: ${dc.rows} rows, slots/row ${dc.slotsPerRow.min}..${dc.slotsPerRow.max}, distinct boards ${dc.distinctBoards} (the ranking churned ${Math.max(0, dc.distinctBoards - 1)} time(s))`)
    const b = dc.board
    const stuckNote = b.distinctPct0 === 1 ? ' - THE STUCK SIGNATURE: the worst slot never moved all face' : ''
    console.log(`  worst slot (index 0, the name churns): pct ${b.firstPct}% -> ${b.lastPct}% (drift ${b.driftPct}%), have ${b.firstHave} -> ${b.lastHave}, distinct pct ${b.distinctPct0}, deepest ${b.minPct0}%${stuckNote}`)
    if (dc.unparsed > 0) console.log(`  unparsed rows: ${dc.unparsed} (the row shape escaped - counted, never dropped)`)
  }
}

// (v0.419.0) THE HOT-SPOT LENS - the failure geometry's cross-lane read
// (the cure pricing's spatial alternative: the decide clock prices WHEN,
// this row prices WHERE). The planar spots join the hop lane's absolute
// chest coords with the tool lanes' own @x,z walk stamps - a spot hit by
// 2+ lanes is the geometry problem's signature (the same ground starving
// multiple walkers), a single-lane spot is that lane's own walk problem.
// The bank walk-backs ride as the relative dist series - never forged
// into absolute positions. Sweep verdicts carry no positions at all.
{
  const hs = hotspotCensus(lines)
  if (hs.spotTotal > 0 || hs.unpositioned.hop > 0 || hs.unpositioned.walkFails > 0 || hs.totals.bankWalkBacks > 0) {
    console.log('--- HOT-SPOT CENSUS (v0.419.0: the failure geometry, hop+tool @coords joined) ---')
    console.log(`  spots: ${hs.spots.length} planar position(s) holding ${hs.spotTotal} failure(s), cross-lane spots ${hs.crossLaneSpots}${hs.crossLaneSpots > 0 ? ' - THE GEOMETRY SIGNATURE: the same ground starves multiple walkers' : ''}`)
    for (const sp of hs.spots.slice(0, 5)) {
      const lanes = Object.entries(sp.byLane).map(([k, n]) => `${k}:${n}`).join(' ')
      const whys = Object.entries(sp.byWhy).map(([k, n]) => `${k}:${n}`).join(' ')
      const bots = Object.keys(sp.bots).join('+')
      console.log(`  spot [${sp.key}]${sp.y !== null ? ` y=${sp.y}` : ''} x${sp.total} (${lanes}) (${whys}) bots ${bots}`)
    }
    if (hs.spots.length > 5) console.log(`  ... ${hs.spots.length - 5} more spot(s) - the tail stays in the lib's row`)
    const un = hs.unpositioned
    if (un.hop > 0 || un.walkFails > 0) console.log(`  unpositioned: hop ${un.hop} ('?' placeholders), chest-walks ${un.walkFails} (the why carried no @coord)`)
    if (hs.totals.bankWalkBacks > 0) console.log(`  bank walk-backs (RELATIVE dists, never spots): n ${hs.bankDists.n}, max ${hs.bankDists.max}, avg ${Math.round(hs.bankDists.sum / hs.bankDists.n)} blocks from yard`)
  }
}

// (v0.420.0) THE CLIMB LENS - the vertical doom's verdict read. The 2230
// brief's open question: is the doom gate WORKING (honest refusals of
// doomed shafts) or OVER-FIRING (climbable yards refused)? A
// stalled-dominated histogram with a deep stage ladder and few OK reads
// HONEST; the OK lines' secs/dug price the cost that WAS payable
// (~4.2s/level, the v0.294.0 pricing); the doom retargets count the
// gate's own re-pricing. The undefineds rows are the emitter's own secs
// leak - the climbs count, their price reads unknown.
{
  const c = climbOutCensus(lines)
  if (c.attempts > 0 || c.retries.plans > 0 || c.retries.noRetry > 0 || c.doomRetargets.n > 0) {
    console.log('--- CLIMB CENSUS (v0.420.0: the vertical doom verdicts, climb out family) ---')
    const okShare = c.attempts > 0 ? Math.round(((c.ok + c.retryOk) / c.attempts) * 100) : 0
    console.log(`  attempts: ${c.attempts} (ok ${c.ok} + retry-ok ${c.retryOk} = ${okShare}% pay, failed ${c.failed} + retry-failed ${c.retryFailed})`)
    const whys = Object.entries(c.byWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')
    if (whys) console.log(`  fail whys: ${whys}${c.stages.n > 0 ? ` - stage ladder depth ${c.stages.n} (max [stage ${c.stages.max}])` : ''}`)
    if (c.ok + c.retryOk > 0) console.log(`  the payable price: gains n${c.gains.n} sum ${c.gains.sum} max ${c.gains.max} levels, dug max ${c.dug.max}, secs n${c.secs.n} (max ${c.secs.max}s${c.secs.n > 0 ? `, avg ${Math.round(c.secs.sum / c.secs.n)}s` : ''})`)
    console.log(`  the ladder's own books: retry plans ${c.retries.plans}, no-retry ${c.retries.noRetry}, doom retargets ${c.doomRetargets.n}${c.unparsed > 0 ? `, unparsed ${c.unparsed} (the shape escaped - counted, never dropped)` : ''}`)
  }
}

// (v0.408.0) THE MEM-HB LENS - the OOM precursors mechanical. FACE 25
// attempt 1 (36857777922) died the run53 OOM class at launch and the
// trigger was priced BY HAND off the dying log's mem gauges (the 1938
// fire: path 6a/10q, evictions 216 -> 788 in ~2 min). The fleet's own
// mem heartbeat carries the precursors as fields - the next face answers
// 'did the eviction velocity spike?' from this row, not a hand grep.
{
  const mem = memHbCensus(lines)
  if (mem.reads > 0) {
    const ev = mem.evicted
    console.log('=== MEMORY / OOM PRECURSORS (the mem-hb lens, v0.408.0) ===')
    console.log(`  gauges: ${mem.reads} reads, rss max ${mem.rssMax}M, heap max ${mem.heapUsedMax}/${mem.heapLimitLast}M, cols max ${mem.colsMax}, ents max ${mem.entsMax}, stale max ${mem.staleMax}`)
    console.log(`  evicted: max ${ev.max}, first ${ev.first} -> last ${ev.last}, peak jump ${ev.peakJump}/gauge, ${ev.resets} guard-reset(s); path peak ${mem.path.peakActive}a/${mem.path.peakQueue}q (max ${mem.path.pathMax})`)
    const stormNote = mem.stormCooldowns > 0
      ? Object.entries(mem.stormByBot).map(([b, s]) => `${b}=${s.count}(max ${s.maxConsecutive})`).join(' ')
      : 'none'
    console.log(`  distress: storm cooldowns ${mem.stormCooldowns} (${stormNote}), oom locks ${mem.oomLocks}`)
  }
}

// (v0.421.0) THE GC POOL LENS - the GC Pinned hunt's own eyes. The v0.354.0
// blind-old-space cure returned the pool split to the mem gauge (heapspace.mjs's
// law: 'the old/ext/ab split says WHICH pool') and the split has flowed on every
// face since - but nobody read it: the mem-hb lens owns the ceilings/eviction
// slice, the storm census the freeze clock. This row reads the POOLS: old =
// retained JS (the leak class), ext = external native, ab = ArrayBuffer backing
// store (the GC-pinned class proper - collectible only when every ref drops).
// The verdict shape beside the freeze clocks: a freeze face with FLAT pools
// points AWAY from GC-pinned; ext/ab climb AT the freeze names the pool.
{
  const gp = gcPoolCensus(lines)
  if (gp.reads > 0) {
    const p = gp.pools
    console.log('=== GC POOLS (the gc-pool lens, v0.421.0) ===')
    console.log(`  gauges: ${gp.reads} reads, unknown pool fields ${gp.unknowns} (the -1 sentinel)`)
    console.log(`  old (retained js): max ${p.old.max}M last ${p.old.last}M, peak climb ${gp.jump.old}M/gauge; ext (external): max ${p.ext.max}M last ${p.ext.last}M, peak climb ${gp.jump.ext}M/gauge; ab (arraybuffer): max ${p.ab.max}M last ${p.ab.last}M, peak climb ${gp.jump.ab}M/gauge`)
    console.log(`  pinned share (ext+ab)/rss max ${gp.pinnedShareMax}%; v8 headroom min ${gp.headroomMin}M (heapTotal-heapUsed)`)
  }
}
