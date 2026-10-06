// Decompose a fleet19.log into the evidence classes the worklog tracks.
// Usage: node scripts/fleet-mining/decompose.mjs <path-to-fleet19.log>
import { readFileSync } from 'node:fs'
import { rescueLedger, rescueEndSeconds, RESCUE_END_CLASSES } from '../../src/lib/rescue-ledger.mjs'
import { orphanOwnerCensus } from '../../src/lib/orphanowner.mjs' // (v0.679.0) the orphan end's per-bot owner (the dead-client class names its bot)
import { askWhyCensus } from '../../src/lib/askwhycensus.mjs' // (v0.652.0) THE ASK'S OWN WHY BOOK - the ask ladder's walk-failure whys joined to the dry terminals (the delivery side's v0.612.0 why-book law, the ask side's own seat)
import { bankFlowCensus, bankYield } from '../../src/lib/bankcensus.mjs' // (v0.686.0) + the yield dial - the banked mass over the visit lane's own line count
import { routeGateCensus, ROUTE_GATE_RIM_TRAP_REFUSALS } from '../../src/lib/routecensus.mjs' // (v0.388.0) the route gate's field read
import { shooterCensus } from '../../src/lib/shootercensus.mjs' // (v0.390.0) the shooter band's field read
import { shelterLedger, OUTCOME_CLASSES } from '../../src/lib/shelterledger.mjs' // (v0.457.0) the combat verdict's price - the outcome join; (v0.466.0) the class vocabulary for the flee-ground cross-read
import { deathSweep } from '../../src/lib/deathsweep.mjs' // (v0.389.0) the honest death sweep's field read
import { sealDeathCensus, strandedPiles, BIG_PILE_U } from '../../src/lib/sealdeath.mjs' // (v0.403.0) the seal economy's death leg; (v0.476.0) the stranded piles - the sweep-reach wire's price
import { sealCensus, SEAL_FAMILIES } from '../../src/lib/sealcensus.mjs' // (v0.397.0) the keep families' field read
import { hopCensus } from '../../src/lib/hopcensus.mjs' // (v0.399.0) the walk-deliveries class's field read
import { openDeafCensus, chestFateLedger } from '../../src/lib/opendeaf.mjs' // (v0.438.0) the open-timeout zeros against the valve + the main-late spikes; (v0.448.0) the returns to the autopsied chests
import { zeroClockCensus, budgetFloorVerdict } from '../../src/lib/zeroclock.mjs' // (v0.441.0) the hop zeros' face-phase anatomy
import { budgetSpread, budgetGoalSplit } from '../../src/lib/budgetspread.mjs' // (v0.473.0) the budget-zero family's per-bot half - the sizing lever's spread read (fuel commons + iron commune, the trip kind rides the line); (v0.475.0) the goal-size split - the miscalibration read
import { o2Gap } from '../../src/lib/o2gap.mjs' // (v0.477.0) the rescue-relation split - the o2 census's missing half (stale vs live rescues) + the sentry's last-known read joined per drown death
import { sensorToll } from '../../src/lib/sensortoll.mjs' // (v0.707.0) the sensor's own toll - the reset(-1) skin's mass across the family's three skins
import { ascendStall } from '../../src/lib/ascendstall.mjs' // (v0.708.0) the ascend's live fence - the stall lane's own mass (the live side the toll fences out)
import { entryWindow } from '../../src/lib/entrywindow.mjs' // (v0.480.0) the effective window - the live trigger's real reaction window (lead - the stale floor) priced against the lane's own saves
import { walkFailCensus } from '../../src/lib/walkfail.mjs' // (v0.410.0) the A* starvation's fleet-wide leg (beyond the hop lane)
import { decideWeather } from '../../src/lib/decideweather.mjs' // (v0.689.0) THE DECIDE WEATHER - the A* starvation's own sky read (the starve's ents/rss at its own anchor)
import { hotspotCensus, hotspotBands } from '../../src/lib/hotspot.mjs' // (v0.419.0 + the v0.421.0 band read) the failure geometry's cross-lane read
import { climbOutCensus } from '../../src/lib/climbout.mjs' // (v0.420.0) the vertical doom's verdict read
import { bankFailCensus } from '../../src/lib/bankfail.mjs' // (v0.411.0) the bank lane's own decide/no-path ledger
import { nopathBill } from '../../src/lib/nopathbill.mjs' // (v0.716.0) the no-path spike's own WHO read - the door family's no-path rides folded per bot per lane (the column's repeats vs the crowd's spread)
import { dropWalkCensus } from '../../src/lib/dropwalk.mjs' // (v0.413.0) the vein sweep's per-fail drop-walk line
import { mapTripCensus, parseWorldmapTail, mapTripGap, tripReceipt, tripVoice, pocketDrain, pocketDrainAttr, materialBalance, balanceReconcile, leakClock, RECEIPT_WINDOW_SAMPLES } from '../../src/lib/maptrip.mjs' // (v0.415.0) the materials plan's launch economics; (v0.445.0) the knowledge side + the gap composer; (v0.447.0) the delivery leg's yield; (v0.449.0) the window calibration; (v0.450.0) the voice roster; (v0.451.0) the pocket drain ledger; (v0.452.0) the drain attribution; (v0.453.0) the material balance; (v0.455.0) the lenses converge; (v0.458.0) the re-gather share; (v0.460.0) the no-leak's own name; (v0.472.0) the leak clock - the share's third split
import { deficitsCensus } from '../../src/lib/deficitrow.mjs' // (v0.417.0) the plan's harvest side (the deficits row's clock)
import { smeltLedger } from '../../src/lib/smeltledger.mjs' // (v0.461.0) the furnace lane's own words - the batches, the clips, the refusals
import { furnacePut } from '../../src/lib/furnaceput.mjs' // (v0.664.0) THE FURNACE PUT'S OWN PAIR - the no-walk opens and the slot read-back's input x fuel pairing (the machine's own diet)
import { fuelDiet, coalEquivalent } from '../../src/lib/fueldiet.mjs' // (v0.666.0) THE FUEL DIET'S OWN BILL - the intent side's fuel split by the emitter's own window law (metal vs junk) + the kindling bill + the coal touch + the plain-furnace mismatch
import { fuelYieldOf } from '../../src/lib/smelting.mjs' // (v0.666.0) the vanilla yield table's own voice - the diet row's coal divisor, never a made constant
import { tierDeferCensus } from '../../src/lib/tierdefer.mjs' // (v0.463.0) the tool ladder's own voice - the steer's deferred names counted
import { deathGrounds, DEATH_GROUND_RADIUS } from '../../src/lib/deathground.mjs' // (v0.464.0) the combat deaths' spatial join - the mob-cure's WHERE input
import { deathDropCensus } from '../../src/lib/deathdropcensus.mjs' // (v0.647.0) the death-drop stakes' own census - the silent-arm join; (v0.663.0) the stakes' own clock rides the same shape
import { RELOOT_DESPAWN_MS } from '../../src/lib/reloot.mjs' // (v0.663.0) the despawn one-truth - the arm-lag row's own inversion base
import { upgradeCensus, deferPromise, upgradeVerdicts, verdictSpread, promisePersistence } from '../../src/lib/upgradecensus.mjs' // (v0.465.0) the tool ladder's own harvest - the rung's delivered tools counted; (v0.467.0) the defer promise's order-aware join; (v0.468.0) the verdict census - the counter-vs-words window named; (v0.470.0) the verdict spread - the worn class's per-bot spread; (v0.471.0) the promise persistence - the kept bots' cross-face fate
import { counterGap, upgradeJoin } from '../../src/lib/countergap.mjs' // (v0.469.0) the counter-words gap - the tally join that closes the book the verdict census named (SLOT COLLISION #5: 0.468.0 taken mid-fire); (v0.474.0) the words-verdict join - the residual's name
import { mainFreezeCensus } from '../../src/lib/mainfreeze.mjs' // (v0.661.0) THE MAIN FREEZE'S OWN ROW - the blackbox dump's own census (the ring's last named activity reads at last)
import { stormRefusalLedger } from '../../src/lib/stormrefusal.mjs' // (v0.478.0) the storm ledger - the craft storm's transient/terminal split, the three handoffs' standing why-read
import { fleeLedger, STUCK_REFLEE_U } from '../../src/lib/fleeledger.mjs' // (v0.481.0) the flee survival ledger - the escape lane's own episode book (the start side's outcome, the chase's progress)
import { criticalPrelude } from '../../src/lib/criticalprelude.mjs' // (v0.483.0) the critical prelude - the combat lane's own low-hp sensor priced (the bar's join to the flight it announced)
import { verdictExecution } from '../../src/lib/verdictflip.mjs' // (v0.484.0) the verdict execution - the flip's own fate book, re-versioned 0.485.0 (SLOT COLLISION #13: 0.484.0 taken by fire-2038's THE PILE ARM mid-fire) (fled / stood / sheltered / died / open)
import { fightLedger } from '../../src/lib/fightledger.mjs' // (v0.486.0) the fight cost ledger - the stand-and-fight lane's own episode book (the win's cost anatomy priced)
import { flipDrift } from '../../src/lib/flipdrift.mjs' // (v0.487.0) the execution drift - the decision-to-flight gap priced (the flip book's fled rows joined back to the decision; SLOT COLLISION #14: 0.486.0 taken by fire-2130's THE FIGHT COST LEDGER mid-fire)
import { shelterLadder } from '../../src/lib/shieldledger.mjs' // (v0.489.0) the shield ladder - the shelter attempt's own book (the wall door, the ring door, the re-scan tax)
import { famineCensus } from '../../src/lib/famineledger.mjs' // (v0.687.0) the famine anatomy - the trip's own starvation read (which slot starves)
import { woodTripCensus } from '../../src/lib/tripcensus.mjs' // (v0.690.0) the walk's delivery - the famine→gathered pairing prices the gather walk's own cure rate (SLOT COLLISION #16: 0.689.0 taken by fire-1639's THE DECIDE WEATHER mid-fire)
import { woodClimbCost } from '../../src/lib/climbcost.mjs' // (v0.694.0) the climb's price - the trip's real rent (+levels/steps/dug/seconds) filed under the delivery class
import { woodRefusalCensus } from '../../src/lib/climbrefusal.mjs' // (v0.691.0) the refusal's why - the climb-fail→refusal join names the walk's start seat
import { smeltVerdict } from '../../src/lib/smeltverdict.mjs' // (v0.490.0) the smelt verdict - the furnace's own report card (the yield line graded against its own forecast; SLOT COLLISION #15: 0.489.0 taken by fire-2238's THE SHIELD LADDER mid-fire)
import { ringAfter } from '../../src/lib/ringafter.mjs' // (v0.493.0) the ring aftermath - what the ring landing bought (the shield ladder's book joined forward: the sieve, the siege, the hold)
import { smeltHold } from '../../src/lib/smelthold.mjs' // (v0.491.0) the smelt hold ledger - the reserve decision's own fate (the hold joined to what the leg then did)
import { toolRecovery } from '../../src/lib/toolrecovery.mjs' // (v0.492.0) the recovery book - the pick-less bootstrap's own report card
import { stickBill } from '../../src/lib/stickbill.mjs' // (v0.711.0) the stick economy's own bill - the four lanes' stick cells folded into one toll
import { chaseBill } from '../../src/lib/chasebill.mjs' // (v0.712.0) the chase's own geometry - the chased deaths' killDelta bill (the speed gap vs the trade lost)
import { crossfireBill } from '../../src/lib/crossfirebill.mjs' // (v0.714.0) the crossfire's own bill - the second hostile's kill folded (the killer's, the fled threat's, the crowd sensor's reads)
import { armoryCensus } from '../../src/lib/armorycensus.mjs' // (v0.494.0) the armory census - the weapon supply chain's own book (the sword + spare-pick lanes' verdicts and failure anatomy)
import { tableGate } from '../../src/lib/tablegate.mjs' // (v0.495.0) the table gate - the tool chain's zero-point (the spare-table bootstrap's own book)
import { campBuild } from '../../src/lib/campbuild.mjs' // (v0.497.0) the camp build book - where furnaces come from (the camp ladder's field fate)
import { pounceBook } from '../../src/lib/pouncebook.mjs' // (v0.498.0) the pounce book - the well pounce's decline probe anatomy and the attempt verdicts
import { assistLedger } from '../../src/lib/assistledger.mjs' // (v0.499.0) the assist ledger - the pounce handoff's aftermath (the ownership claim priced: rose vs died at the climb boundary)
import { torchBook } from '../../src/lib/torchbook.mjs' // (v0.500.0) the torch ledger - the light supply's floors, rungs, asks and yield
import { veinLedger } from '../../src/lib/veinledger.mjs' // (v0.501.0) the vein ledger - the sweep's terminals, walk yield, gallery digs, refusals and the tier guard
import { commonsLedger } from '../../src/lib/commonsledger.mjs' // (v0.502.0) the commons ledger - the ask's answer: the sweeps, the walk anatomy, the deliveries
import { bridgeBook } from '../../src/lib/bridgebook.mjs' // (v0.496.0) the bridge book - the vertical walk's fill lane (the refusals' why-flip, the cobble signature, the server's own veto; SLOT COLLISION #17: 0.495.0 taken by fire-0008's THE TABLE GATE mid-fire)
import { bridgeRefusalCensus, bridgeRefusalRow } from '../../src/lib/climbbridge.mjs' // (v0.665.0) THE CLIMB BRIDGE'S FIELD READ - the refusal book's own grains wired to the mining surface: the gate, the pit donor, the plant clear, the shadow gate's defers
import { planTopCensus } from '../../src/lib/plantop.mjs' // (v0.440.0) the named board - the stuck slot's own name
import { sentryCensus } from '../../src/lib/sentry.mjs' // (v0.422.0) the drowning sentry's per-pass read (the water lane's first census)
import { rescueClockCensus } from '../../src/lib/rescueclock.mjs' // (v0.431.0) the rescue lane's price leg (durations + the frozen blindness)
import { frozenCensus } from '../../src/lib/frozencensus.mjs' // (v0.426.0) the freeze family's census (the F10 frozen-while-head-wet class's read)
import { transitCensus, targetCadence, TRANSIT_POCKET_DEPTH } from '../../src/lib/transitcensus.mjs' // (v0.427.0) the rescue swim's launch lane (the toward-known-land read); (v0.435.0) the stall depth split; (v0.446.0) the launch cadence verdict
import { rearmCensus } from '../../src/lib/rearm.mjs' // (v0.443.0) the same-target re-arm brake's family row
import { transitLoopLedger } from '../../src/lib/transitloop.mjs' // (v0.692.0) the per-bot swim loop's own account (the whale's ledger)
import { whaleWaterBill } from '../../src/lib/whalewater.mjs' // (v0.698.0) the whale's water bill - the zero-gain loop's rescue-side account
import { calmRescueParadox } from '../../src/lib/calmrescue.mjs' // (v0.701.0) the calm paradox - the death-free face's full-speed water lane
import { bankDocket, doorstepStormCensus } from '../../src/lib/bankdocket.mjs' // (v0.700.0) the bank's docket - the silent bank's own anatomy (the door leg vs the empty-pocket leg); (v0.706.0) + the doorstep storm's census (the three lanes' doors folded into one toll)
import { walkoutWitnessCensus } from '../../src/lib/walkoutcensus.mjs' // (v0.437.0) the walk-out witness's own numbers (the window/displacement/unmeasured read)
import { relogBill } from '../../src/lib/relogbill.mjs' // (v0.715.0) the relog's own loop bill - the relogs' repeats joined to the walk-out's stalled deliveries (the loop's own meter)
import { kickBill } from '../../src/lib/kickbill.mjs' // (v0.717.0) the kick's own churn - the kick cells joined to the relog cells (the pair, the split, the repeats over both lanes)
import { memHbCensus, RSS_JUMP_STORM_M, ENT_JUMP_STORM_N } from '../../src/lib/memhb.mjs' // (v0.408.0) the OOM precursors' field read
import { stormCensus } from '../../src/lib/stormcensus.mjs' // (v0.409.0) the storm EVENT story's field read (verdicts + valve + hb)
import { gcPoolCensus } from '../../src/lib/gcpool.mjs' // (v0.421.0) the GC Pinned hunt's pool read (the old/ext/ab split)
import { voidCensus } from '../../src/lib/voidcensus.mjs' // (v0.423.0) the out-of-world stamp's field read
import { deathKindCensus } from '../../src/lib/deathkinds.mjs' // (v0.425.0) the vertical-death front's mechanical leg
import { houndCensus } from '../../src/lib/houndcensus.mjs' // (v0.433.0) the hound presence's field read
import { faceFate } from '../../src/lib/facefate.mjs' // (v0.546.0) the frozen book's READER side - the face's own fate named before the censuses speak

const file = process.argv[2]
if (!file) { console.error('usage: decompose.mjs <fleet19.log> [priorFace.log]'); process.exit(1) }
const lines = readFileSync(file, 'utf8').split('\n')
// (v0.471.0) the optional prior face's log - the promise persistence's
// roll call (the kept bots of the face BEFORE this one). Absent -> the
// persistence row stays silent (no prior face, no cross-face read).
const prevFile = process.argv[3] || null
const prevLines = prevFile ? readFileSync(prevFile, 'utf8').split('\n') : null

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

// (v0.546.0) THE FACE FATE - the reader's own account row, FIRST: which of
// the three endings this log carries (result / partial / none - the frozen
// book). The v0.358.0 lesson was a comment, not a row: a truncated
// artifact read exactly like a complete one until the human scrolled.
{
  const ff = faceFate(lines)
  console.log('=== FACE FATE ===')
  if (ff.fate === 'result') console.log(`  fate: FLEET RESULT (reason: ${ff.reason}) - the complete account follows`)
  else if (ff.fate === 'partial') console.log(`  fate: PARTIAL EVIDENCE - the report block absent, the kill's own line landed (${ff.line.slice(0, 110)}) - the counters exist, the full account does not`)
  else console.log(`  fate: NO FINAL REPORT - ${ff.why}`)
}

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
// (v0.425.0) THE DEATH KIND CENSUS - the sweep LISTS the deaths, the census
// CLASSIFIES them by the server's own kind= verdict (the announce payload's
// authority - the v0.117.0 doctrine) so every face counts fall/drown/mob/...
// mechanically (faces 26/27 mined by hand before this row existed). The
// vertical row is the F-9 front's read: the fall/void family names its
// death cell and the inference verdict - 'kind=fall' never re-counted by
// eye again; an unparsed announce-shaped line surfaces, never vanishes.
{
  const kinds = deathKindCensus(lines)
  const causeRow = kinds.total
    ? Object.entries(kinds.byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    : 'none'
  const unparsedNote = kinds.unparsed.length ? `, UNPARSED ${kinds.unparsed.length}` : ''
  // (v0.672.0) the inferred-only note: rows the death handler printed from
  // the raw inference (no server verdict at the killing tick) now JOIN the
  // buckets - the arc reads the death clock raw - and this note names how
  // many of them carry no server verdict.
  const inferredNote = kinds.inferredOnlyCount ? `, INFERRED-ONLY ${kinds.inferredOnlyCount}` : ''
  console.log(`  death causes: ${causeRow}${inferredNote}${unparsedNote}`)
  // (v0.713.0) THE INFERENCE'S OWN BILL - the two-way read of the
  // inference's tails across the whole face (the server kind stays the
  // authority; the bill measures the witness, never re-adjudicates).
  if (kinds.inference.total > 0) console.log(`  the inference's own bill (v0.713.0): ${kinds.inference.total} death(s) with a server verdict and an inferred tail - the kind join agree ${kinds.inference.kindAgree} / disagree ${kinds.inference.kindDisagree}; the bracket corroborates ${kinds.inference.corroborates}, blind ${kinds.inference.blind}, contradicts ${kinds.inference.contradicts}, bystander ${kinds.inference.bystander}`)
  for (const v of kinds.vertical) {
    console.log(`  vertical death: ${v.bot} ${v.verb}${v.attacker ? ` by ${v.attacker}` : ''} at [${v.pos ? v.pos.join(',') : 'cell unreadable'}] (inference ${v.corroboration})`)
  }
  // (v0.674.0) THE OTHER-VERB CENSUS - the honest-'other' verbs named by
  // their words (a new vanilla phrasing surfaces the face it debuts).
  const ovs = Object.entries(kinds.otherVerbs).sort((a, b) => b[1] - a[1])
  if (ovs.length) {
    console.log(`  other-verb census: ${ovs.map(([v, n]) => `${n}x "${v}"`).join(' | ')} - the honest-'other' verbs named (a new phrasing names itself)`)
  }
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
    // (v0.476.0) THE STRANDED PILES - the sweep-reach wire's price: the
    // piles the death ledger named, joined with the reloot lane's own
    // verdicts. The lane walked ZERO piles across the stored faces (the
    // single unarmed refusal, face 43 - 'the empty pocket bootstraps
    // first'). The arrival lines carry no units - the reader never
    // invents a recovered mass; the price stays the honest bound.
    const sp = strandedPiles(lines)
    if (sp.drops > 0 || sp.refusals > 0 || sp.arms > 0) {
      const bigNote = sp.drops > 0 ? `, big(>=${BIG_PILE_U}u) ${sp.bigPiles} carrying ${sp.bigPileUnits}u` : ''
      const biggestNote = sp.biggest ? ` - biggest ${sp.biggest.units}u (${sp.biggest.bot} @[${sp.biggest.pos ?? '-'}]) = ${(sp.topShare * 100).toFixed(0)}%` : ''
      const whys = Object.entries(sp.refusalWhys).map(([w, n]) => `${w} ${n}`).join(', ')
      const laneNote = ` - the reloot lane: arms ${sp.arms}${sp.pileArms ? ` (pile arms ${sp.pileArms})` : ''}, arrivals ${sp.arrivals}, refusals ${sp.refusals}${whys ? ` (${whys})` : ''}`
      const priceNote = sp.arrivals > 0 ? `the lane walked ${sp.arrivals} pile(s) home (the units uncounted - the lines carry no mass)` : 'THE PRICE: the lane never walked - the dropped mass sits where it fell'
      console.log(`  stranded piles (v0.476.0): ${sp.drops} pile(s) ~${sp.dropped}u${bigNote}${biggestNote}${laneNote} - ${priceNote}`)
    }
    // (v0.407.0) THE DEATH CLOCK - the spiral read mechanical. The end-phase
    // share prices against the log's own clock end; a death before the first
    // heartbeat stays untimed and honestly out of every window.
    const c = sealDeath.clock
    if (c.timed > 0) {
      const untimedNote = c.untimed > 0 ? `, ${c.untimed} untimed (pre-first-hb)` : ''
      const spanNote = c.firstTs === c.lastTs ? `at ts=${c.firstTs}s` : `span ts=${c.firstTs}..${c.lastTs}s`
      console.log(`  death clock: ${c.timed} timed ${spanNote}, clock end ts=${c.clockEnd}s, end-phase(${c.endPhaseWindowS}s) ${c.endPhase}, max burst ${c.maxBurst} in ${c.burstWindowS}s${untimedNote}`)
      // (v0.680.0) THE SIEGE PACE - the sustained-pressure read beside the
      // burst read: the 22nd flight (37416742832) rode 29 mob deaths at max
      // burst 3 - a SUSTAINED siege the max burst alone underprices.
      const paceNote = c.pace !== null
        ? `  siege pace: ${c.pace} deaths/min over ${(c.spanS / 60).toFixed(1)} min of timed span - the sustained pressure the max burst misses`
        : ''
      if (paceNote) console.log(paceNote)
      // (v0.675.0) THE END-PHASE TAX - the deadline's own price: the units
      // whose deaths stamped inside the final 60s window (the rescue and
      // the re-gather cannot repay them - the face ends before any walk).
      if (sealDeath.endPhaseLost > 0 && sealDeath.lostTotal > 0) {
        const share = Math.round((100 * sealDeath.endPhaseLost) / sealDeath.lostTotal)
        console.log(`  end-phase tax: ~${sealDeath.endPhaseLost}u of ~${sealDeath.lostTotal}u lost (${share}%) died in the final ${c.endPhaseWindowS}s - the deadline's own tax`)
      }
      // (v0.676.0) THE BURST SHARE - the storm regime's own read: the max
      // burst names the densest 30s window, the share names the storm's
      // SIZE (the deaths die together - the swarm face vs the skirmish
      // face; the arc counts the totals, this prices the regime).
      if (c.burstDeaths > 0) {
        const share = Math.round((100 * c.burstDeaths) / c.timed)
        console.log(`  burst share: ${c.burstDeaths} of ${c.timed} deaths rode bursts (>=${c.burstMin} in ${c.burstWindowS}s) (${share}%) in ${c.burstClusters} cluster(s) - the storm's own share`)
      }
    }
  }
}

// (v0.423.0) THE VOID CENSUS - the out-of-world stamp's field read. "void"
// is the physical fall below the overworld floor (y < -64; the server's
// 'fell out of the world [kind=other]'), "stamp" = the v0.277.0 'void
// context' snapshot (cell / depth / leg) the death handler prints for it.
// Two history deaths stand, both mute (pre-stamp trees): F12 [117,-90,0]
// depth 26, F3 [118,-148,2] depth 84 - the ~17-blocks-east-of-anchor column
// (x 117-118, z 0-2) is the recurrence signature the census pins. The stamp
// has been ARMED-SILENT in every field face since (no void death occurred);
// this block renders the read ALWAYS (the 05:00 ledger-skip lesson: a CALM
// verdict is a verdict, an absent line class is a filter blind spot), so
// the stamp's first field line lands in a mechanical row, not a grep.
{
  const vc = voidCensus(lines)
  console.log("--- VOID CENSUS (v0.423.0: the out-of-world stamp's field read) ---")
  if (vc.stamps > 0 || vc.serverVoidDeaths > 0 || vc.unparsed > 0) {
    const vb = Object.entries(vc.byBot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  void stamps: ${vc.stamps} - per bot: ${vb || 'none'}${vc.unparsed ? ` (unparsed ${vc.unparsed})` : ''}`)
    const cols = Object.entries(vc.byColumn).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    for (const [key, n] of cols) {
      const ys = vc.cells.filter(cell => `${cell.x},${cell.z}` === key).map(cell => cell.y)
      console.log(`  column ${key}: n=${n} (y ${Math.min(...ys)}..${Math.max(...ys)})`)
    }
    console.log(`  depth below floor: n=${vc.depths.n} (min ${vc.depths.min === null ? '-' : vc.depths.min} max ${vc.depths.max === null ? '-' : vc.depths.max}) unknown=${vc.depths.unknown} (negative = above floor - the contradiction is the datum)`)
    if (vc.stamps > 0) {
      const legs = Object.entries(vc.byLeg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
      console.log(`  legs: ${legs}`)
      if (vc.knownColumn > 0) console.log(`  THE KNOWN COLUMN (x 117..118, z 0..2, ~17b east of the dragon-zone anchor [100,49,1]): ${vc.knownColumn} of ${vc.stamps} land on it - the recurrence signature REPEATS`)
    }
    if (vc.serverVoidDeaths > 0) console.log(`  server void deaths: ${vc.serverVoidDeaths} (kind=other ${vc.serverKindOther})`)
    if (vc.muted) console.log(`  THE MUTE FLAG: ${vc.serverVoidDeaths} server void death(s) with ZERO stamp lines - a pre-v0.277.0 tree is legitimately mute; otherwise the emit site's verb gate failed and the front opens`)
  } else {
    console.log("  reads: 0 (the stamp armed-silent - no void death this face; the two history deaths [117,-90,0] depth 26 / [118,-148,2] depth 84 stay the record)")
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
// (v0.701.0) THE CALM PARADOX - the death-free face's full-speed water
// lane: 0 deaths rode 35 rescue starts (the 33rd's own shape). The churn
// has its explainers when deaths ride (honest silence); below the floor
// the quiet lane stays data; at the paradox the row names the lane's own
// clock (the frozen dives, the wet strands - never the deaths).
const calm = calmRescueParadox(lines)
if (calm && calm.paradox) {
  const p = calm.paradox
  const top = p.top ? `top ${p.top[0]}=${p.top[1]} of ${p.spenders} spender(s)` : 'no spender table'
  console.log(`  the calm paradox (v0.701.0): 0 death(s) rode ${p.starts} rescue start(s) (${top}, ends complete ${p.ends.complete} / released ${p.ends.released} / standdown ${p.ends.frozenStanddown} / timeout ${p.ends.timeout} / unclosed ${p.ends.unclosed}) - the water lane churns on its own clock, the deaths are not its meter`)
}
// (v0.679.0) THE ORPHAN OWNER - the orphans' per-bot split: the fleet-wide
// count answers 'how many', the owner split answers 'WHOSE client died'
// (the stand-down's own words: 'the reconnect lane owns a dead client').
// The 21st flight rode 8 orphans - F3 x4, F8 x1, F19 x3 - the dead-client
// class's owners, beside the same face's drown=4 'o2 reset(-1)' deaths.
const oo = orphanOwnerCensus(ledger.orphanEndLines)
if (oo.total > 0) {
  const owners = Object.entries(oo.owners).map(([b, n]) => `${b}=${n}`).join(' ') || 'untagged'
  const classes = Object.entries(oo.byClass).map(([k, n]) => `${k} ${n}`).join(', ')
  console.log(`  orphan owners: ${owners} (${classes})${oo.unattributed > 0 ? `, unattributed ${oo.unattributed}` : ''} - the dead-client class names its bot`)
}
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
// (v0.431.0) THE RESCUE CLOCK - the rescue lane's price leg: every end's
// 'in Ns' duration (the ledger prices only the timeout class) + the frozen
// standdown's blind bracket - the three counters of the self-diagnosis the
// field reads 0/0 fourteen times (the frozen dive gathers nothing).
{
  const rc = rescueClockCensus(lines)
  if (rc.ends > 0 || rc.unparsed > 0) {
    console.log('--- RESCUE CLOCK (v0.431.0: the rescue lane\'s price leg) ---')
    const classes = Object.entries(rc.byClass).map(([k, n]) => `${k} ${n}`).join(', ')
    console.log(`  ends: ${rc.ends}${classes ? ` (${classes})` : ''}`)
    const priced = Object.entries(rc.durations).filter(([, s]) => s.n > 0)
    for (const [k, s] of priced) console.log(`  price ${k}: n${s.n}, avg ${(s.sum / s.n).toFixed(1)}s, max ${s.max}s`)
    const unpriced = Object.entries(rc.durations).filter(([, s]) => s.unpriced > 0).map(([k, s]) => `${k}:${s.unpriced}`).join(' ')
    if (unpriced) console.log(`  unpriced (the shape carries no tail): ${unpriced}`)
    if (rc.blind.lines > 0 || rc.blind.bracketlessStanddowns > 0) {
      const p = rc.blind.passes
      console.log(`  the frozen blindness: brackets ${rc.blind.lines} (passes n${p.n}, avg ${p.n > 0 ? (p.sum / p.n).toFixed(1) : 'n/a'}, max ${p.max}), full-blind (0 shore + 0 probes) ${rc.blind.fullBlind}${rc.blind.fullBlind > 0 ? ' - THE FROZEN DIVE GATHERS NOTHING before the reconnect lane takes over' : ''}, bracketless ${rc.blind.bracketlessStanddowns}`)
    }
    if (rc.unparsed > 0) console.log(`  unparsed: ${rc.unparsed} refused blind: token(s) - the escape hatch`)
  }
}
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
// (v0.433.0) THE HOUND-PRESENCE LENS - eight faces of 'hound absent' were a
// blind read, not an honest zero: the rows above count only the WET flee
// ('flee toward shore ... (proximity)') and the hound-won death
// ('drowned-kill context'), while the combat block's own lines carry the
// hound in the forms the fleet actually answers with. Face 27 (36870593766)
// proves it in held log: FOUR answer moments vs drowned - F10 sheltered and
// fled one on dry land, F9 and F14 fought and KILLED theirs (wooden_sword,
// 5-6 rounds) - every legacy row zero. The lens reads the whole anatomy (the
// v0.389.0 deathsweep lesson, one parser per emitter): presence = the answer
// moments (fight / flee-dry / shelter / flee-shore incl. the cornered
// no-cell form / the escape hatch), defeats = 'fight ended (mob down)' (the
// fleet WON), hops/flips/re-verdicts = the episode's own detail, kills vs
// drown-contexts split the won/lost deaths. Mining-surface only: zero fleet
// wiring, zero new log lines.
const hound = houndCensus(lines)
console.log(`  hound presence (any form): ${hound.presence} answer moment(s) - fight ${hound.fight} / flee-dry ${hound.fleeDry} / shelter ${hound.shelter} / flee-shore ${hound.fleeShore} (legacy-plain ${hound.fleeShorePlain}) / shore-no-cell ${hound.shoreNoCell} / other ${hound.other}`, 'per-bot:', fmt(hound.presenceByBot))
console.log(`  hound defeats (the fleet won - mob down): ${hound.fightsWon}`, 'per-bot:', fmt(hound.fightsWonByBot), `| other fight exits: ${hound.fightEndsOther}`)
console.log(`  hound episode detail: flee hops ${hound.fleeHops} / verdict flips ${hound.verdictFlips} / re-verdicts ${hound.reVerdicts}`)
console.log(`  hound kills (the hound won): ${hound.kills} (dry-shore ${hound.killsDryShore} / in-water ${hound.killsInWater} / waterline ${hound.killsWaterline}) | drown contexts (the water did it): ${hound.drownContexts}`)
for (const s of hound.otherSamples) console.log("   ~ hound other:", s.slice(0, 140))
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
// (v0.477.0) THE RESCUE-RELATION SPLIT - the o2 census's (v0.379.0) missing
// half: 'rescue Ns ago' is a COMPLETED rescue (the re-entry class - the lane
// saved the bot once, the leg walked it back), not the live lane - the
// census's 'active' bucket took both. The sentry's last-known read joins
// beside it (the leakClock law at-or-before the death; sentry.mjs's own
// parser - one parser per emitter). o2Gap in src/lib/o2gap.mjs owns the
// death-context grammar (the reader side had none); silent on zero deaths.
const o2g = o2Gap(lines)
if (o2g && o2g.deaths > 0) {
  const o2Bits = Object.entries(o2g.perBot).map(([bot, v]) => `${bot} [last pass ${v.lastPass ? `${v.lastPass.head} o2=${v.lastPass.o2.kind === 'value' ? v.lastPass.o2.value : v.lastPass.o2.kind}` : 'none'}, rescue ${v.rescueKind === 'stale' ? `${v.rescueAgo}s ago` : v.rescueKind}, ${v.wetKind === 'unknown' ? 'wet unknown' : `wet ${v.wetS}s${v.wetKind === 'atLast' ? '@last' : ''}`}]`).join(' ')
  console.log(`  rescue relation split (v0.477.0): live ${o2g.rescue.live} (the lane was flying) / stale ${o2g.rescue.stale} (Ns ago - the lane completed, the bot re-drowned) / never ${o2g.rescue.never} - wet at-last ${o2g.wet.atLast}, live ${o2g.wet.live}, unknown ${o2g.wet.unknown} - last-pass join ${o2g.lastPass.seen}/${o2g.deaths}${o2Bits ? ` (${o2Bits})` : ''}`)
}
// (v0.479.0) THE RE-ENTRY PRICE - the sight-loss wiring's price read (the
// fire-1838 handoff): the mirror cue joins each death at-or-before (the
// leakClock law) - the sight-loss + head-water trigger's own evidence,
// priced per death. Silent on zero deaths.
if (o2g && o2g.deaths > 0) {
  const cueBits = Object.entries(o2g.perBot).map(([bot, v]) => v.cue
    ? `${bot} [${v.cueKind}${v.cue.head.toLowerCase() === 'wet' ? '' : ` - head ${v.cue.head}`}, sight died ${v.cue.sightDiedSecs ?? '?'}s before, mirror o2=${v.cue.o2}, ${v.cue.why}]`
    : `${bot} [blind - no mirror joined]`).join(' ')
  console.log(`  re-entry price (v0.479.0): the sight-loss + head-water wiring catches ${o2g.cue.wired}/${o2g.deaths} - cue-only ${o2g.cue.cueOnly} (head dry/unknown at the mirror tick - the wider trigger's case), blind ${o2g.cue.blind} (the sensor gap) - mirrors ${o2g.mirrors}${cueBits ? ` (${cueBits})` : ''}`)
}
// (v0.480.0) THE EFFECTIVE WINDOW - the re-entry price's honest second leg:
// a live trigger arms when the snapshot age CROSSES the stale floor (the
// mirror's own constant, imported - one truth), so the REAL window is the
// blindness lead MINUS the floor, not the raw lead. Priced against the
// lane's own saves (rescue-ledger's classifier - never forked). Silent on
// zero deaths.
const ew = entryWindow(o2g, lines)
if (ew) {
  const ewBits = Object.entries(ew.perDeath).map(([bot, v]) => `${bot} [lead ${v.lead ?? '?'}s - floor ${ew.floorSec}s = ${v.effective !== null ? `${v.effective}s` : 'n/a'}, ${v.verdict}]`).join(' ')
  console.log(`  effective window (v0.480.0): the live trigger's window = lead - ${ew.floorSec}s stale floor; the lane's saves cost min ${ew.laneCost.min}s / median ${ew.laneCost.median}s / max ${ew.laneCost.max}s (n=${ew.laneCost.saves}) - fits ${ew.verdicts.fits} / tight ${ew.verdicts.tight} / misses ${ew.verdicts.misses} / unpriced ${ew.verdicts.unpriced}${ewBits ? ` (${ewBits})` : ''}`)
}
// (v0.707.0) THE SENSOR'S OWN TOLL - the reset(-1) skin's full mass across
// the family's three skins: the death contexts the v0.379.0 census owns,
// the breath mirrors the v0.479.0 cue lens owns, and the deep-pocket
// ascends NOBODY owned (the fire-2230 front: the family is a lane of its
// own). Silent on a clean face.
const stoll = sensorToll(lines)
if (stoll && stoll.rides > 0) {
  const whyBits = Object.entries(stoll.mirrorWhy).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k} ${v}`).join(', ')
  const topBot = Object.entries(stoll.botRides).sort((a, b) => b[1] - a[1])[0]
  console.log(`  the sensor's toll (v0.707.0): ${stoll.rides} reset(-1) ride(s) - drown contexts ${stoll.deaths} (never ${stoll.rescue.never} / live ${stoll.rescue.live} / stale ${stoll.rescue.stale}), breath mirrors ${stoll.mirrors}${whyBits ? ` (${whyBits})` : ''}, deep-pocket ascends ${stoll.ascends}${stoll.other > 0 ? `, other ${stoll.other}` : ''} - top ${topBot ? `${topBot[0]}=${topBot[1]}` : 'none'}`)
}
// (v0.708.0) THE ASCEND'S LIVE FENCE - the stall lane's own mass (the
// live side the v0.707.0 toll fences out): the sensor-innocent stalls
// (the jump sat 3+ passes on a FULL sensor, the ceiling dig bought the
// way out) with the fence's cross-check leg (dead here == the toll's
// ascends). Silent on an ascend-free face.
const astall = ascendStall(lines)
if (astall && astall.ascends > 0) {
  const topStall = Object.entries(astall.bots).sort((a, b) => b[1] - a[1])[0]
  const passes = Object.entries(astall.minPasses).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}+ x${v}`).join(', ')
  console.log(`  the ascend's live fence (v0.708.0): ${astall.ascends} ascend(s) - the stall lane's ${astall.live} live (sensor held), ${astall.dead} dead (the toll's own)${passes ? `, stall floor ${passes}` : ''} - top ${topStall ? `${topStall[0]}=${topStall[1]}` : 'none'}`)
}
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
// (v0.682.0) THE CRATER VERDICT RIDE - the fleet's own decode judged the
// banked share; the mining lens carries the verdict beside the numbers it
// always read (the bank silence's NAME, not just its ledger row).
if (bankCensus.crater) console.log(`  banked crater: ${bankCensus.crater.sharePct}% of the endgame loot reached chests (banked ${bankCensus.crater.banked} of ${bankCensus.crater.mass}u) - ${bankCensus.crater.tail}`)
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
// (v0.457.0) THE SHELTER OUTCOME LEDGER - the combat/night cure's PRICE.
// The killers row named the lane (face 36: the mob family 82% of the
// drain); the shooter census counts the machinery's verdicts; neither ever
// joined a DEATH to the bot's last combat verdict. This block reads the
// join: each combat death (the server kind token the authority) lands in
// the outcome class it died in - sheltered (the wall itself failed) /
// shelter-attempt (the machinery still negotiating: try, wall-miss, skip,
// ring) / fight / flee / ranged / other / ambushed (no combat line at all)
// - priced by the adjacent death drop's ~Nu (the last-before-drop law the
// pocket killers pinned). THE CURE FORK the row reads: the biggest priced
// class names the fix - sheltered -> the wall design, shelter-attempt ->
// the machinery's speed/stock, ambushed -> the sentry, fight -> the trade,
// flee -> the escape. Zero-combat-death faces read the honest zeros (the
// wet faces' water lane is not this ledger's subject - the excluded count
// says so).
{
  const sl = shelterLedger(lines)
  console.log(`--- SHELTER OUTCOME LEDGER (v0.457.0: the combat verdict's price - the last verdict before each combat death) ---`)
  const excluded = sl.otherDeaths + sl.unparsedDeaths
  console.log(`  combat deaths: ${sl.combatDeaths} (excluded: ${excluded} non-combat${sl.unparsedDeaths ? ` [incl. ${sl.unparsedDeaths} no-kind-token]` : ''}) - priced ${Object.values(sl.outcomes).reduce((s, o) => s + o.u, 0)}u, unpriced ${sl.unpriced}, pairMisses ${sl.pairMisses}`)
  const alive = Object.entries(sl.outcomes).filter(([, o]) => o.n > 0)
  if (alive.length) {
    const classRow = alive.map(([c, o]) => `${c}: ${o.n} (${o.u}u) [${o.bots.join(',')}]`).join(' | ')
    console.log(`  ${classRow}`)
    const top = alive.slice().sort((a, b) => b[1].u - a[1].u || b[1].n - a[1].n)[0]
    const why = top[0] === 'sheltered'
      ? 'the WALL itself failed - the shelter sealed and still lost'
      : top[0] === 'shelter-attempt'
        ? 'the MACHINERY was too slow - the try/skip/wall-miss was not sealed in time'
        : top[0] === 'ambushed'
          ? 'the SENTRY never spoke - no combat verdict before the death'
          : top[0] === 'fight'
            ? 'the TRADE loses - the fight itself is the leak'
            : top[0] === 'flee'
              ? 'the ESCAPE fails - the disengage is the leak'
              : 'the class split stays open - read the rows'
    console.log(`  the price's answer: ${top[0]} carries ${top[1].u}u/${top[1].n} death(s) - ${why}`)
  } else {
    console.log(`  ${sl.combatDeaths === 0 ? 'no combat deaths this face - the pricing waits (the water lane is not this ledger\'s subject)' : 'the rows read zero - the honest zero'}`)
  }
  // (v0.459.0) THE FLEE FORK - the disengage cure's own pricing. The
  // price's answer named the flee class the leak (face 36: 812u/10); the
  // fork reads HOW the flee fails, from the died line's own inference
  // tail: the death-time killer distance (close <=4 - the flee gained
  // NOTHING, the chase kept its melee reach; far >8 - the flee gained and
  // the arrows/blast still took the trade) and the chase/crossfire split
  // (the kind token's killer vs the last verdict's attacker - the server
  // token stays the authority, the join is a courtesy). The bands are
  // design input: the cure wire must fix the winning side, not the losing
  // one. Blind inferences (drown's own blindness) count honest.
  if (sl.combatDeaths > 0) {
    const db = sl.distBands
    console.log(`  kill dist bands (all combat deaths, the inference's own ruler): close ${db.close} / mid ${db.mid} / far ${db.far} / blind ${db.unpriced}`)
    const fleeRows = sl.rows.filter(d => d.outcome === 'flee')
    if (fleeRows.length) {
      const nClose = fleeRows.filter(d => d.distBand === 'close').length
      const nMid = fleeRows.filter(d => d.distBand === 'mid').length
      const nFar = fleeRows.filter(d => d.distBand === 'far').length
      const nBlind = fleeRows.filter(d => !d.distBand).length
      const chase = fleeRows.filter(d => d.chasedDown === true).length
      const crossfire = fleeRows.filter(d => d.chasedDown === false).length
      const noAtt = fleeRows.filter(d => d.chasedDown === null).length
      const verdict = (nClose + nMid + nFar) === 0
        ? 'no readable distance - the fork stays open'
        : nClose > nMid + nFar
          ? 'THE CHASE WINS - the flee never opens distance; the cure is a disengage that GAINS ground, not a better wall'
          : nFar > nClose + nMid
            ? 'THE ARROWS WIN - the flee gains ground and the arc still takes the trade'
            : 'the split is open - read the rows'
      console.log(`  the flee fork: ${fleeRows.length} flee death(s) - chase ${chase} / crossfire ${crossfire} / no-verdict-attacker ${noAtt}; bands close ${nClose} / mid ${nMid} / far ${nFar} / blind ${nBlind} - ${verdict}`)
    } else {
      console.log(`  the flee fork: no flee deaths - the disengage pricing waits`)
    }
  }
}
// (v0.481.0) THE FLEE SURVIVAL LEDGER - the escape lane's own episode
// book (the start side's outcome: nobody ever joined a flee START to its
// own terminus - the death-side lenses read HOW/WHEN/WHERE of the deaths,
// this reads what the ESCAPES did: the success book, the chase's progress
// between consecutive flee lines, the start-side bands x died share).
{
  const fl = fleeLedger(lines)
  console.log(`--- FLEE SURVIVAL LEDGER (v0.481.0: the flee start's own outcome - the escape lane's success book) ---`)
  if (!fl || fl.starts === 0) {
    console.log('  flee episodes: 0 (the escape lane silent - the calm face reads zero honestly)')
  } else {
    const book = fl.reflee + fl.stood + fl.sheltered + fl.chased + fl.crossfire + fl.diedOther + fl.open
    console.log(`  flee episodes: ${fl.starts} - reflee ${fl.reflee} (stuck ${fl.stuckReflees}) / stood ${fl.stood} / sheltered ${fl.sheltered} / chased ${fl.chased} / crossfire ${fl.crossfire} / died-other ${fl.diedOther} / open ${fl.open} - book ${book}/${fl.starts}`)
    if (fl.hp) console.log(`  hp at flee start: min ${fl.hp.min.toFixed(1)} / median ${fl.hp.median.toFixed(1)} / max ${fl.hp.max.toFixed(1)}; kite starts ${fl.kiteStarts}`)
    const bb = fl.bands
    console.log(`  start bands: close ${bb.close.starts} (died ${bb.close.died}) / mid ${bb.mid.starts} (died ${bb.mid.died}) / far ${bb.far.starts} (died ${bb.far.died})${bb.unpriced.starts ? ` / unpriced ${bb.unpriced.starts}` : ''}`)
    const cr = fl.crowd
    const crVerdict = cr.crowd.starts === 0
      ? 'no crowd starts - the solo lane owns this face'
      : cr.solo.starts === 0
        ? 'every start flew crowded - the crowd is the face\'s own weather'
        : (() => {
            const cs = cr.crowd.died / cr.crowd.starts
            const ss = cr.solo.died / cr.solo.starts
            return cs > ss
              ? `the CROWDED flights die more (crowd ${(cs * 100).toFixed(0)}% vs solo ${(ss * 100).toFixed(0)}%) - the second hostile is already counted at the flight decision`
              : cs < ss
                ? `the solo flights die more (solo ${(ss * 100).toFixed(0)}% vs crowd ${(cs * 100).toFixed(0)}%) - the crowd census is not this face's doom axis`
                : 'the shares are even - the crowd does not split this face\'s doom'
          })()
    console.log(`  crowd price (v0.482.0): solo (nearby 0-1) ${cr.solo.starts} (died ${cr.solo.died}) / crowd (nearby 2+) ${cr.crowd.starts} (died ${cr.crowd.died})${cr.unpriced.starts ? ` / unpriced ${cr.unpriced.starts}` : ''} - ${crVerdict}`)
    for (const r of fl.rows.filter(x => x.outcome === 'chased')) {
      console.log(`   chased: ${r.bot} fled ${r.mob} @${r.dist} (hp ${r.hp}) - killed @${r.killDist ?? '-'} (delta ${r.killDelta === null ? 'unpriced' : `${r.killDelta > 0 ? '+' : ''}${r.killDelta.toFixed(1)}`})${r.killDelta !== null && r.killDelta < 0 ? ' - THE MOB CLOSED IN' : r.killDelta !== null ? ' - the flee gained, the trade lost' : ''}`)
    }
    // (v0.712.0) THE CHASE'S OWN GEOMETRY - the chased rows folded into
    // one bill: the speed gap's deaths (the mob closed in) vs the
    // trade's (the flee gained and died anyway) vs the flat
    // re-contact - the stable read underneath the cross-read's flip.
    const cb = chaseBill(fl)
    if (cb) {
      console.log(`  the chase's bill (v0.712.0): ${cb.chased} chased death(s) - the mob closed in ${cb.closedIn}, the flee gained ${cb.gained} (the trade lost), flat re-contact ${cb.flat}, unpriced ${cb.unpriced}${cb.closedIn > cb.gained && cb.closedIn > cb.flat ? ' - THE SPEED GAP OWNS THE LEAK' : ''}`)
    }
    for (const r of fl.rows.filter(x => x.outcome === 'crossfire')) {
      console.log(`   crossfire: ${r.bot} fled ${r.mob} @${r.dist} (hp ${r.hp}) - died to ${r.killer || 'the ' + r.deathKind + ' kind'} (the second hostile's kill)`)
    }
    // (v0.714.0) THE CROSSFIRE'S OWN BILL - the face-level fold of the
    // second hostile's kills (the chased class's own bill rides beside
    // it, the v0.712.0 row): WHO owns the toll (the killer's server
    // token, the authority), WHAT the exit was escaping (the fled
    // threat's split), the kind families, and the crowd sensor's read
    // (the ledger's founding law: the crossfire's sensor is the nearby
    // count). The honest silence when no crossfire death rode the face.
    const xb = crossfireBill(fl)
    if (xb) {
      const bk = Object.entries(xb.byKiller).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'
      const bm = Object.entries(xb.byMob).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'
      const bd = Object.entries(xb.byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'
      const miss = xb.unpricedKiller > 0 ? `, the second hostile unnamed ${xb.unpricedKiller}` : ''
      console.log(`  the crossfire's bill (v0.714.0): ${xb.n} crossfire death(s) - the second hostile: ${bk}; fled: ${bm}; kind ${bd}; solo ${xb.crowd.solo} / crowd ${xb.crowd.crowd} / unpriced ${xb.crowd.unpriced}${miss} - the exit ran into the second hostile's reach`)
    }
    const refl = fl.rows.filter(x => x.outcome === 'reflee' && x.refleeDelta !== null)
    if (refl.length) {
      const stuckRows = refl.filter(x => Math.abs(x.refleeDelta) <= STUCK_REFLEE_U)
      console.log(`  chase progress (reflee deltas): ${refl.map(x => `${x.bot} ${x.mob} ${x.dist}->${(x.dist + x.refleeDelta).toFixed(1)} (${x.refleeDelta > 0 ? '+' : ''}${x.refleeDelta.toFixed(1)})`).join('; ')}${stuckRows.length ? ` - STUCK ${stuckRows.length}/${refl.length}` : ''}`)
    }
    const died = fl.chased + fl.crossfire
    const verdict = died === 0
      ? 'no flee died - the escape lane held'
      : fl.crossfire > fl.chased
        ? 'THE CROSSFIRE LEADS - the second hostile owns the doom; the disengage must read the crowd, not just the chase'
        : fl.chased > fl.crossfire
          ? 'THE CHASE LEADS - the flee never escapes its own threat; the disengage must GAIN ground'
          : 'the split is even - read the rows'
    console.log(`  the survival fork: ${died}/${fl.starts} flee episode(s) died mid-flee (chased ${fl.chased} / crossfire ${fl.crossfire}) - ${verdict}`)
  }
}
// (v0.483.0) THE CRITICAL PRELUDE - the combat lane's own low-hp sensor
// priced (the critical bar's join to the flight it announced: the join
// cover, the prelude cover, the critical-zone cover + the sensor gap -
// the o2 lane's blind-lane twin).
{
  const cp = criticalPrelude(lines)
  console.log(`--- CRITICAL PRELUDE (v0.483.0: the critical bar's own flight announcement) ---`)
  if (!cp || cp.bars === 0) {
    console.log('  critical bars: 0 (the drain sensor silent - the calm face reads zero honestly)')
  } else {
    console.log(`  critical bars: ${cp.bars} - joined ${cp.joinedBars} / tail ${cp.unjoinedBars} (the bar announces the flight it precedes)`)
    console.log(`  prelude cover: flee starts ${cp.fleeStarts} - with prelude ${cp.prelude.with} / without ${cp.prelude.without}`)
    const crVerdict = cp.criticalFlees === 0
      ? 'no critical-zone flight - the bar spoke without a low-hp flee (the honest tail)'
      : cp.gap === 0
        ? `every critical-zone flight (hp < ${8}) rode the prelude - the sensor covers the drain zone`
        : `gap ${cp.gap} - the silent zone is not blind (the shelter-skip's own lane covers the gap - the two preludes hand off)`
    console.log(`  critical zone (hp < ${8}): ${cp.criticalFlees} flight(s), covered ${cp.covered} - ${crVerdict}`)
  }
}
// (v0.485.0) THE VERDICT EXECUTION - the flip's own fate book (the
// decision line priced: the verdict says flee - who actually closed it:
// a new escape episode, the fight lane, the shelter lane, the death, or
// the face's tail).
{
  const vx = verdictExecution(lines)
  console.log(`--- VERDICT EXECUTION (v0.485.0: the flip's own fate) ---`)
  if (!vx || vx.flips === 0) {
    console.log('  verdict flips: 0 (the flee verdict never contested - the calm face reads zero honestly)')
  } else {
    const book = vx.fled + vx.stood + vx.sheltered + vx.died + vx.open
    console.log(`  verdict flips: ${vx.flips} - fled ${vx.fled} / stood ${vx.stood} / sheltered ${vx.sheltered} (THE SHIELD TAKEOVER) / died ${vx.died} / open ${vx.open} - book ${book}/${vx.flips}`)
    if (vx.hp) console.log(`  hp at flip: min ${vx.hp.min.toFixed(1)} / median ${vx.hp.median.toFixed(1)} / max ${vx.hp.max.toFixed(1)}`)
    for (const r of vx.rows.filter(x => x.verdict === 'fled')) {
      const gap = r.executedHp === null ? 'the execution hp unpriced' : `${r.flipHp.toFixed(1)} -> ${r.executedHp.toFixed(1)}${r.executedMob && r.executedMob !== r.mob ? ` (the threat changed: ${r.mob} -> ${r.executedMob})` : ''}`
      console.log(`   fled: ${r.bot} flipped vs ${r.mob} - executed ${gap}`)
    }
  }
}
// (v0.486.0) THE FIGHT COST LEDGER - the stand-and-fight lane's own
// episode book (the emitter prints the win's full cost anatomy byte for
// byte and no reader ever counted it: the exit class, the hp pair - the
// COST, a negative cost is the regen outpacing the grind - the swings,
// the weapon, the rounds). The abandon names the threat-change class,
// the shelter takeover the wall's answer, the rounds field prices the
// TIME the hp cost hides (the pickaxe tax's own ruler).
{
  const fl = fightLedger(lines)
  console.log(`--- FIGHT COST LEDGER (v0.486.0: the fight's own price) ---`)
  if (!fl || fl.starts === 0) {
    console.log('  fights: 0 (the face never stood its ground - the calm face reads zero honestly)')
  } else {
    const book = fl.mobDown + fl.deadline + fl.chaseCeiling + fl.verdictIgnore + fl.abandoned + fl.sheltered + fl.died + fl.open
    console.log(`  fights: ${fl.starts} - mob down ${fl.mobDown} / deadline ${fl.deadline} / chase ceiling ${fl.chaseCeiling} / verdict ignore ${fl.verdictIgnore} / abandoned ${fl.abandoned} / sheltered ${fl.sheltered} / died ${fl.died} / open ${fl.open} - book ${book}/${fl.starts}`)
    if (fl.costs) console.log(`  the wins' cost (hp): min ${fl.costs.min.toFixed(1)} / median ${fl.costs.median.toFixed(1)} / max ${fl.costs.max.toFixed(1)} - free wins ${fl.freeWins}${fl.costs.min < 0 ? ' (the NEGATIVE tail is the regen slog: the fight outlasted the drain)' : ''}`)
    const wbits = Object.entries(fl.weapons).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}:${n}`).join(' ')
    if (wbits) console.log(`  the weapons: ${wbits} - the longest fight ${fl.slog.maxRounds} rounds (${fl.slog.bot} vs ${fl.slog.mob}, ${fl.slog.weapon})${fl.slog.weapon && fl.slog.weapon.includes('pickaxe') ? ' - THE PICKAXE TAX: the tool ground where the sword would have swung' : ''}`)
    const abandons = fl.rows.filter(r => r.outcome === 'abandoned')
    for (const r of abandons) {
      console.log(`   abandoned: ${r.bot} fought ${r.mob} @${r.hp === null ? '?' : r.hp.toFixed(1)} - flew vs ${r.closeMob || '?'} @${r.closeHp === null ? '?' : r.closeHp.toFixed(1)}${r.threatChanged ? ' (the threat changed mid-fight)' : ' (the same threat won the argument)'}`)
    }
    // (v0.488.0) THE VICTOR'S TAIL - what the WIN bought: the bot's next
    // boundary line after each mob-down win (the same close vocabulary),
    // the drained tail's own flight pricing the victory drain, the exit
    // zones split against the policy's own flee line (one truth)
    const tbits = [
      fl.tails['re-engaged'] ? `re-engaged ${fl.tails['re-engaged']}` : null,
      fl.tails.drained ? `drained ${fl.tails.drained} (THE VICTORY DRAIN: the critical bar answered the win)` : null,
      fl.tails.fled ? `fled ${fl.tails.fled}` : null,
      fl.tails.sheltered ? `sheltered ${fl.tails.sheltered}` : null,
      fl.tails['died-after'] ? `died-after ${fl.tails['died-after']}` : null,
      fl.tails.chained ? `chained ${fl.tails.chained}` : null,
      fl.tails.quiet ? `quiet ${fl.tails.quiet}` : null
    ].filter(Boolean).join(' / ')
    console.log(`  the victor's tail (v0.488.0): ${tbits || 'no mob-down wins - no tails'}`)
    console.log(`  the winners' exit zones vs the flee line ${fl.exitZones.fleeLine}: below ${fl.exitZones.belowFlee} / at-or-above ${fl.exitZones.atOrAbove}${fl.exitZones.belowFlee === 0 && fl.exitZones.atOrAbove > 0 ? ' - the fight lane never ENDS a fight below the policy line' : ''}`)
    for (const r of fl.rows.filter(x => x.tailClass === 'drained' || x.tailClass === 'died-after' || x.tailClass === 'fled')) {
      const drain = r.tailDrain === null ? 'the flight hp unpriced' : `the victory drain ${r.tailDrain.toFixed(1)}`
      console.log(`   ${r.tailClass}: ${r.bot} won vs ${r.mob} at ${r.endHp === null ? '?' : r.endHp.toFixed(1)} - the tail ${r.tailGap === null ? '?' : `+${r.tailGap}`} lines${r.tailFleeHp === null ? '' : `, the flight at ${r.tailFleeHp.toFixed(1)} (${drain})`}`)
    }
  }
}
// (v0.487.0) THE EXECUTION DRIFT - the decision-to-flight gap priced on
// the flip book's own rows (the fire-2100 read's own lens: the verdict
// says flee, the world keeps moving - how far did it drift between the
// flip and the flight the flip opened). The join rides verdictExecution
// (one parser per shape, zero new RE): the fled rows' executedMob /
// executedHp join back to the flip's mob / hp - mobChanged names the
// threat drift, hpDelta the hp drift (negative = hp lost mid-prose),
// driftWindow the machinery prose the world moved across.
{
  const fd = flipDrift(lines)
  console.log(`--- EXECUTION DRIFT (v0.487.0: the decision-to-flight gap priced) ---`)
  if (!fd || fd.flips === 0) {
    console.log('  flips: 0 (no verdict contested the flight - the drift has no input)')
  } else if (fd.fledJoins === 0) {
    console.log(`  flips ${fd.flips}, fled ${fd.fled}, executions priced 0${fd.unpricedFled ? ` (unpriced fled ${fd.unpricedFled})` : ''} - no drift input (face 42's own shape)`)
  } else {
    const verdict = fd.mobChanged > fd.mobSame
      ? "THE DRIFTED EXECUTION LEADS - the decision's world is stale by the flight"
      : fd.mobSame > fd.mobChanged
        ? 'the instant execution leads - the verdict became the flight untouched'
        : 'the drift splits even at this n'
    console.log(`  flips ${fd.flips} - fled ${fd.fled} = joins ${fd.fledJoins} + unpriced ${fd.unpricedFled}; mobSame ${fd.mobSame} / mobChanged ${fd.mobChanged} / hpLost ${fd.hpLost} - ${verdict}`)
    if (fd.hpDelta) console.log(`  hp delta: min ${fd.hpDelta.min.toFixed(1)} / median ${fd.hpDelta.median.toFixed(1)} / max ${fd.hpDelta.max.toFixed(1)}`)
    if (fd.window) console.log(`  prose window: min ${fd.window.min} / median ${fd.window.median} / max ${fd.window.max} lines`)
    for (const j of fd.rows) {
      console.log(`   ${j.bot}: ${j.flipMob}@${j.flipHp.toFixed(1)} -> ${j.execMob}@${j.execHp.toFixed(1)}${j.mobChanged ? ' (THE THREAT DRIFTED)' : ' (the instant execution)'} - window ${j.driftWindow} lines${j.hpDelta < 0 ? `, hp lost ${Math.abs(j.hpDelta).toFixed(1)}` : ''}`)
    }
  }
}
// (v0.489.0) THE SHIELD LADDER - the shelter attempt's own book (the
// takeover class's engine priced: every 'shelter try' opens a ladder
// episode, the machinery walks inside it, the bot's next boundary closes
// it - ringed / laneLost / died / open; the pregate names the skips that
// refused before any try). The doors: the wall door (wall misses - the
// open-field signature says it never opens) and the ring door (ring
// tries x the ringed close). The re-scan tax: the bot's consecutive
// same-threat episode pairs - the scan re-asking a question the world
// already answered.
{
  const sl = shelterLadder(lines)
  console.log(`--- SHIELD LADDER (v0.489.0: the shelter attempt's own book) ---`)
  if (!sl || sl.tries === 0) {
    console.log(`  shelter tries: 0 (the ladder never walked${sl && sl.pregate ? ` - pregate refusals ${sl.pregate}` : ' - the calm face reads zero honestly'})`)
  } else {
    const book = sl.ringed + sl.laneLost + sl.died + sl.open
    console.log(`  shelter tries: ${sl.tries} - ringed ${sl.ringed} / laneLost ${sl.laneLost} / died ${sl.died} / open ${sl.open} - book ${book}/${sl.tries}; pregate refusals ${sl.pregate}`)
    console.log(`  the doors: wall ${sl.wallMisses}/${sl.tries} missed (the open-field signature - the wall never landed at this n) | ring ${sl.ringLanded} landed / ${sl.ringRefused} refused of ${sl.ringTries} tried`)
    if (sl.wallMissTiming) {
      const t = sl.wallMissTiming
      console.log(`  the wall-miss timing: threat at ${t.min}..${t.max}u (median ${t.median}) when the wall was asked - ${t.within5}/${t.n} already inside 5u (the door arrives after the threat is close)`)
    }
    console.log(`  the re-scan tax: ${sl.sameThreatRescans} same-threat pairs / ${sl.threatChangedRescans} threat-changed (the scan re-asking what the world answered)`)
    const cls = Object.entries(sl.skipClasses).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ')
    if (cls) console.log(`  the refusals: ${cls}`)
    if (sl.prose) console.log(`  the ladder prose: min ${sl.prose.min} / median ${sl.prose.median} / max ${sl.prose.max} lines per episode`)
    for (const r of sl.rows.filter(x => x.outcome === 'ringed')) {
      console.log(`   ringed: ${r.bot} vs ${r.mob} (ring tries ${r.ringTries}) - the ring door opened`)
    }
  }
}
// (v0.493.0) THE RING AFTERMATH - what the ring landing bought (the
// shield ladder's book stops at the ringed close; the aftermath walks
// forward from it: died-in-shelter / re-shelter same / re-shelter moved
// / lane return / held tail). The completeness law: the one ringed-then-
// died rode the INCOMPLETE wall (cells 2/8 - the mob walked the gap);
// the siege read: consecutive same-mob rings are the ring's pause-not-
// end signature (the re-scan tax's ringed-side twin).
{
  const ra = ringAfter(lines)
  console.log(`--- RING AFTERMATH (v0.493.0: what the ring landing bought) ---`)
  if (!ra || ra.ringed === 0) {
    console.log(`  ringed episodes: 0 (the ring door never opened this face${ra ? '' : ' - junk reads null'})`)
  } else {
    const book = ra.diedInShelter + ra.reShelter + ra.laneReturn + ra.heldTail
    console.log(`  ringed ${ra.ringed} - died-in-shelter ${ra.diedInShelter} / re-shelter ${ra.reShelter} (same ${ra.reShelterSame} / moved ${ra.reShelterMoved}) / lane-return ${ra.laneReturn} / held-tail ${ra.heldTail} - book ${book}/${ra.ringed}`)
    console.log(`  the completeness law: full rings ${ra.complete.full} / incomplete ${ra.complete.incomplete} - deaths full ${ra.deathsByWall.full} / incomplete ${ra.deathsByWall.incomplete}${ra.deathsByWall.incomplete ? ' - THE SIEVE: the gap is the door' : ''}`)
    if (ra.sieges.chains) console.log(`  the sieges: ${ra.sieges.chains} chain(s), longest ${ra.sieges.max} consecutive same-mob rings (the ring is a pause, not an end)`)
    for (const r of ra.rows) {
      const wallTxt = r.wall && r.wall.cells ? `${r.wall.kind} ${r.wall.cells[0]}/${r.wall.cells[1]}${r.wall.complete ? ' full' : ' INCOMPLETE'}` : 'wall unread'
      const aft = r.aftermath === 'reShelter' ? `re-shelter vs ${r.reMob}${r.reDist !== null ? `@${r.reDist}` : ''}` : r.aftermath
      const gap = r.gapLines === null ? 'window tail' : `${r.gapLines} lines`
      console.log(`   ringed: ${r.bot} vs ${r.mob} (${wallTxt}) -> ${aft} after ${gap}`)
    }
  }
}
// (v0.464.0) THE DEATH GROUND CENSUS - the combat deaths' spatial join
// (the mob-cure's WHERE leg: the shelter ledger read HOW, the flee fork
// read WHEN-distance, nothing read WHERE the same ground killed several
// bots - a nest harvests a radius, not a point). The died line's own
// coord joins planar (+-12 manhattan - the radius priced across faces
// 36/37/39/41: R4 never clusters, R24 merges nests); a ground holding
// 2+ deaths is the multi-kill signature, 3+ the nest harvest. The killer
// tally names each ground (mixed killers = one shared dangerous ground).
{
  const dg = deathGrounds(lines)
  if (dg && dg.combatDeaths > 0) {
    console.log(`--- DEATH GROUND CENSUS (v0.464.0: the combat deaths' spatial join - the mob-cure's WHERE input) ---`)
    console.log(`  deaths ${dg.combatDeaths} on ${dg.grounds.length} ground(s) (+-${DEATH_GROUND_RADIUS} planar${dg.blind ? `, blind ${dg.blind}` : ''}) - multi-kill grounds ${dg.multiGrounds}, singles ${dg.singles}`)
    for (const g of dg.grounds.slice(0, 5)) {
      const killers = Object.entries(g.killers).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ')
      console.log(`  ground [${g.x},${g.z}] x${g.n} (${killers}) bots ${g.bots.slice().sort().join('+')}${g.n >= 3 ? ' - THE NEST HARVEST SIGNATURE: one ground took 3+ bots this face' : ''}`)
    }
    if (dg.grounds.length > 5) console.log(`  ... ${dg.grounds.length - 5} more ground(s) - the tail stays in the lib's row`)
    // (v0.466.0) THE FLEE GROUND CROSS-READ - the two lenses join on the
    // same died lines: the shelter ledger read the OUTCOME (the verdict
    // before each combat death), the death ground read the PLACE (the
    // ground's shared size). The join answers the standing disengage
    // question: does the escape die ON the killing field it fled from?
    // The rows zip positionally (both walk the combat deaths in line
    // order - the same anchor, the same combat-kind law); the bot match
    // is the sanity gate, a mismatch skips the row honest.
    const slx = shelterLedger(lines)
    if (slx.rows.length === dg.rows.length && dg.rows.every((r, i) => r.bot === slx.rows[i].bot)) {
      const perClass = {}
      let shared = 0
      for (let i = 0; i < dg.rows.length; i++) {
        const cls = slx.rows[i].outcome
        const g = perClass[cls] || (perClass[cls] = { n: 0, onMulti: 0, onSingle: 0, blind: 0 })
        g.n++
        if (dg.rows[i].groundN === null) g.blind++
        else {
          if (dg.rows[i].groundN >= 2) { g.onMulti++; shared++ }
          else g.onSingle++
        }
      }
      const fmtClass = c => perClass[c] ? `${c} ${perClass[c].onMulti}/${perClass[c].n}` : null
      const classBits = OUTCOME_CLASSES.map(fmtClass).filter(Boolean).join(', ')
      const flee = perClass.flee
      console.log(`  the flee ground cross-read (v0.466.0): deaths on shared grounds ${shared} of ${dg.combatDeaths}${classBits ? ` (${classBits})` : ''}`)
      if (flee && flee.n > 0) {
        const verdict = flee.onMulti * 2 >= flee.n
          ? 'THE FLEE DIES ON THE SHARED GROUND - the escape never leaves the killing field (the disengage must EXIT the ground, not just gain distance)'
          : 'the escapes die off the shared grounds - the chase\'s reach, not the ground, takes them'
        console.log(`  the cross-read's answer: ${verdict}`)
      }
    }
  }
}

// (v0.647.0) THE DEATH-DROP CENSUS - the deathdrop class's own arm join:
// the stakes the v0.199.0 drop lines name, joined to the re-loot lane's
// voice after each stake (line order = time order). A mass stake with no
// lane row is the SILENT class - the recovery never spoke for it - the
// v0.201.0 walk lane's own accountability seat (face 37239853197: arms 1
// of 7, ~714u at stake, the silent six carried every unit). Mining-surface
// only: zero fleet wiring, zero new log lines.
{
  const dc = deathDropCensus(lines)
  if (dc && dc.drops.length > 0) {
    console.log(`--- DEATH DROP CENSUS (v0.647.0: the stakes' own arm join - the lane's voice vs the silent six) ---`)
    console.log(`  stakes: ${dc.drops.length} death drop(s) across ${dc.deaths} death(s), ${dc.lostU}u at stake (${dc.emptyReads} empty-pocket read(s))`)
    const armed = dc.armed.bots.map((b) => `${b}`).join('+') || '-'
    const silent = dc.silent.bots.map((b) => `${b}`).join('+') || '-'
    console.log(`  arm join: armed ${dc.armed.n} (${dc.armed.u}u: ${armed}) / SILENT ${dc.silent.n} (${dc.silent.u}u: ${silent})${dc.silent.u > 0 ? ' - THE SILENT CLASS: the recovery never spoke for these stakes' : ''}`)
    if (dc.silent.n > 0) console.log(`  the silent stakes' bots heaviest-first: ${dc.silent.bots.join(' ')} - the wiring read needs its own face priced by this lens first`)
    // (v0.663.0) THE SILENT STAKE'S OWN CLOCK - the arm's lag vs the face's
    // tail. The arm lag reads the WALK row's own window field (the bot's
    // own plan arithmetic - despawn minus window = the minutes the
    // respawned bot's bootstrap and the loop's serialization price before
    // the walk arms). The silent split rides the seal death clock's
    // end-phase law: pre-tail = the read had the window and never spoke
    // (the wiring seat); end-phase = the bank's loop outlived the read.
    // Non-zero only (the mining-surface law): a face with no walks prints
    // no lag row, a face with no silent stakes prints no split row.
    if (dc.clock.armLag.n > 0) {
      console.log(`  arm lag (v0.663.0: the walk's own window read, the ${Math.round(RELOOT_DESPAWN_MS / 1000)}s despawn inverted): n=${dc.clock.armLag.n}, median ${dc.clock.armLag.medianS}s, max ${dc.clock.armLag.maxS}s - the respawned bot's bootstrap prices the wait before the walk arms`)
    }
    const sp = dc.clock.silent
    if (sp.preTail.n > 0 || sp.endPhase.n > 0) {
      const preNote = `pre-tail x${sp.preTail.n} stake(s) ${sp.preTail.u}u${sp.preTail.bots.length ? ` (${sp.preTail.bots.join(' ')}) - the read had the window and never spoke (the wiring seat)` : ''}`
      const epNote = `end-phase x${sp.endPhase.n} stake(s) ${sp.endPhase.u}u${sp.endPhase.bots.length ? ` (${sp.endPhase.bots.join(' ')}) - the bank's loop outlived the read` : ''}`
      const untimedNote = sp.untimed > 0 ? ` / untimed ${sp.untimed} (pre-first-hb)` : ''
      console.log(`  silent clock (v0.663.0): ${preNote} / ${epNote}${untimedNote}`)
    }
  }
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
// (v0.425.0) THE RELOG WALK-OUT CENSUS - the frozen-after-relog detector's
// field leg. Face 36864564525's F10 rode the walk-out promise's silence
// ("the fresh client walks the hazard-ledgered column out") through THREE
// consecutive frozen relogs; these rows read the enforcement's own lines:
// the stalled windows (the walk-out failed its gate-ladder budget), the
// rung split (reset / + goal release / the named shift exit). A face whose
// relogs cured reads ZERO here - the honest zero (a held walk-out prints
// no stall line, so the rung rows ARE the account).
{
  const rws = count(/relog walk-out stalled/)
  // (v0.437.0) THE WALK-OUT WITNESS LENS - the window's own numbers (the
  // rung verdicts below stay the 0.425.0 lane's raw counts). Hoisted: the
  // v0.715.0 bill rides the same census whether the stalls printed or not.
  const wwc = walkoutWitnessCensus(lines)
  if (rws > 0) {
    console.log("--- RELOG WALK-OUT CENSUS (v0.425.0: the frozen-after-relog detector) ---")
    console.log(`  stalled windows: ${rws} per-bot: ${fmt(perBot(/relog walk-out stalled/))}`)
    console.log(`  rung 1 (gates reset): ${count(/rung 1: the walk gates/)}  rung 2 (+ goal release): ${count(/rung 2: the gates reset/)}  rung 3 (shift exit named): ${count(/rung 3: the gates reset/)}`)
    const ws = wwc.windows.windowS
    const dp = wwc.windows.displacement
    const wwn = wwc.windows.n
    const dpRow = dp.n > 0 ? `, displacement ${dp.min}..${dp.max} blocks (avg ${(dp.sum / dp.n).toFixed(2)}) vs the bar max ${wwc.windows.barMax}` : ''
    console.log(`  witness numbers: window ${ws.min}..${ws.max}s (avg ${(ws.sum / ws.n).toFixed(1)})${dpRow}, unmeasured ${dp.unmeasured}/${wwn}`)
    if (wwc.unparsed > 0) console.log(`  unparsed: ${wwc.unparsed} walk-out line(s) the grammar refused - the escape hatch`)
  }
  // (v0.715.0) THE RELOG'S OWN LOOP BILL - the founding warning's own
  // meter (the v0.425.0 header: 'the relog lane was feeding the loop
  // it exists to break'): the relogs joined to the walk-out's stalled
  // deliveries (a walked-out verdict prints nothing - the stalls are
  // the promise's FAILED deliveries by shape), the ladder's depth, and
  // the REPEATS - the bots that relogged 2+ times, the loop's own skin
  // (a single relog is the saver's job; the second is the column
  // reproducing). Opens on relogs > 0 - a stall-free relog face reads
  // the promise HELD, the bill's own honest read.
  const rb = relogBill(frozenCensus(lines), wwc)
  if (rb) {
    const rbs = Object.entries(rb.repeatBots).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const pct = (x) => (x * 100).toFixed(0)
    const loopTail = rb.repeats > 0
      ? `; the loop's skin: ${rb.repeats} bot(s) relogged 2+ (${rbs}) owning ${rb.repeatRelogs}/${rb.relogs} relogs (${pct(rb.repeatRelogs / rb.relogs)}%)${rb.repeatRelogs / rb.relogs >= 0.5 ? ' - THE RELOG FEEDS THE LOOP' : ''}`
      : '; no repeats - the saver did its job, the loop never opened'
    console.log(`  the relog's own bill (v0.715.0): ${rb.relogs} relog(s) -> ${rb.stalls} stalled walk-out(s) (${pct(rb.stallRate)}%), the ladder r1 ${rb.rungs.r1} / r2 ${rb.rungs.r2} / r3 ${rb.rungs.r3}${loopTail}`)
  }
}
// (v0.717.0) THE KICK'S OWN CHURN - the duplicate-login kick's own bill:
// the frozen census's kick cells joined to its relog cells (the
// signature law - parsed cells in, one shape out, zero new regexes).
// The PAIRED bots (both lanes' customers - the double churn), the SPLIT
// (kick-only whales vs relog-only savers - whose churn is whose), and
// the REPEATS (2+ churn events of either kind - the v0.715.0 repeats
// law over both lanes; a single event is the lane doing its job, the
// second is the churn reproducing). Opens on kicks > 0 - a relog-only
// face stays the relog bill's own subject.
{
  const kb = kickBill(frozenCensus(lines))
  if (kb) {
    const kbSort = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    const kbpct = (x) => (x * 100).toFixed(0)
    const pairTail = kb.paired.n > 0
      ? Object.entries(kb.paired.byBot).map(([k, v]) => `${k} kicks ${v.kicks}/relogs ${v.relogs}`).join(', ')
      : 'none - the churn split clean'
    console.log(`  the kick's own churn (v0.717.0): ${kb.kicks} kick(s) across ${Object.keys(kb.kickBots).length} bot(s) + ${kb.relogs} relog(s) = ${kb.churn} churn event(s); the pair: ${kb.paired.n} bot(s) rode BOTH lanes (${pairTail}); the split: kick-only ${kb.kickOnly.n} (${kbSort(kb.kickOnly.bots)}), relog-only ${kb.relogOnly.n} (${kbSort(kb.relogOnly.bots)}); the churn's repeats: ${kb.repeats.n} bot(s) 2+ events owning ${kb.repeats.owned}/${kb.churn} (${kbpct(kb.repeats.share)}%)`)
  }
}
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
// (v0.652.0) THE ASK'S OWN WHY BOOK: the dry 'budget spent' terminals priced
// by name - the decide class, the fleet goal ceiling, the water interlock -
// the delivery side's why-book law at the ask ladder's own seat (face
// 37249185472 read 36 dry terminals with no why census anywhere; the next
// face names the front before any blind code change prices itself).
{
  const aw = askWhyCensus(lines)
  const whyBits = Object.entries(aw.whys).filter(([, n]) => n > 0).map(([k, n]) => `${k} x${n}`)
  const dryBits = Object.entries(aw.dryByWhy).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}u`)
  console.log(`  ask why census: ${aw.terminals} dry terminal(s), ${aw.unitsDry}u un-taken - whys: ${whyBits.length ? whyBits.join(', ') : 'none'}`)
  console.log(`  ask why census (dry by last why): ${dryBits.length ? dryBits.join(', ') : 'none priced'}`)
  // (v0.653.0) THE DECIDE'S OWN SKINS - the decide class's own anatomy: the
  // geometry skin (no-path) vs the budget skin (decide-timeout), with the
  // opposite cures - the next lever prices WHICH skin owns the dry
  const skinBits = Object.entries(aw.decideSkins).filter(([, n]) => n > 0).map(([k, n]) => `${k} x${n}`)
  const skinDryBits = Object.entries(aw.dryBySkin).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}u`)
  console.log(`  ask why census (decide skins): ${skinBits.length ? skinBits.join(', ') : 'no decide whys'} (dry: ${skinDryBits.length ? skinDryBits.join(', ') : 'none priced'})`)
  // (v0.655.0) THE DECIDE'S OWN SIDES - the skins' side split: the fuel ladder
  // owns the three-leg rescue, the food ladder owns none - the food rescue
  // seat prices from this row (which side owns which skin and how much dry)
  const sideBits = []
  // (v0.659.0) the loop rides the census's OWN side keys - the iron commune
  // (the third ask ladder) prints its segment only when its mass is non-zero
  // (the additive law, the filter's own byte-stability)
  for (const s of (aw.sides ? Object.keys(aw.sides) : [])) {
    const b = Object.entries(aw.sides[s]).filter(([, n]) => n > 0).map(([k, n]) => `${k} x${n}`)
    const dB = Object.entries(aw.dryBySide[s]).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}u`)
    if (b.length || dB.length) sideBits.push(`${s}: ${b.length ? b.join(', ') : 'no decide whys'}${dB.length ? ` (${dB.join(', ')})` : ''}`)
  }
  console.log(`  ask why census (decide skins by side): ${sideBits.length ? sideBits.join(' | ') : 'no decide whys'}`)
  // (v0.660.0) THE GOVERNOR'S RUNS' OWN ROW - the v0.658.0 run detector's own
  // print completes its mining surface (the first field read rode an inline
  // node call one fire too long - the mining-surface law: the face's own rows
  // print themselves). The runs are pure COUNTS (no dry - the runs price no
  // units, the v0.658.0 law); only the non-zero buckets print (the additive
  // filter's own byte-stability); the guard keeps older census shapes honest
  const runBits = Object.entries(aw.governorRuns || {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} x${n}`)
  console.log(`  ask why census (governor runs): ${runBits.length ? runBits.join(', ') : 'no governor runs'}`)
}
console.log('  iron lines:', count(/iron/))
console.log('  ladder lead lines:', count(/ladder/))

console.log('=== BANK / DEPOSIT ===')
const bankVisitLines = count(/bank(ed)?[: ]/i) > 0 ? count(/\bbank\b/) : 0
console.log('  bank visits:', bankVisitLines)
// (v0.686.0) THE BANK YIELD DIAL - the mass each visit-line carried: the
// ratio that moved between faces 23/24/25 (0.0 -> 2.8 -> the alive bank).
// The silence law: a face with no bank lane reads nothing; a live lane
// that banked nothing is the 23rd's own finding (THE SILENT BANK).
const bankYieldRow = bankYield(bankCensus.loot ? bankCensus.loot.banked : null, bankVisitLines)
if (bankYieldRow) console.log(`  bank yield: ${bankYieldRow.rateUPerVisit}u/visit (${bankYieldRow.banked}u banked over ${bankYieldRow.visits} visit-lines)${bankYieldRow.silent ? ' - THE SILENT BANK (the lane walked, the mass never moved)' : ' - the bank moved'}`)
// (v0.700.0) THE BANK'S DOCKET - the silent bank's own anatomy: the visit
// lines dissect into the door leg (the walk failed: chest unreachable /
// no chest reached) and the empty-pocket leg (the chest reached, the
// deposit moved 0: the zero probes + the deposit zeros). The fork names
// the silence's owner - the fleet's cure input rides whichever leg owns.
const bd = bankDocket(lines, bankVisitLines)
if (bd && (bd.door.total > 0 || bd.pocket.total > 0)) {
  const fork = bd.pocket.total > bd.door.total
    ? ' - THE POCKET MET THE CHEST EMPTY: the visits and the mass lived on different clocks'
    : bd.door.total > bd.pocket.total
      ? ' - THE CHEST DOOR NEVER OPENED: the walk\'s own failures own the silence'
      : ' - THE DOCKET SPLITS: the door and the empty pocket share the silence'
  console.log(`  the bank's docket (v0.700.0): the door leg ${bd.door.total} (chest unreachable ${bd.door.unreachable}, decide timeouts ${bd.door.decideTimeouts}, no chest ${bd.door.noChest}, lid timeouts ${bd.door.lidTimeout}, beyond radius ${bd.door.beyondRadius}), the empty-pocket leg ${bd.pocket.total} (zero probes ${bd.pocket.zeroProbes}, deposit zeros ${bd.pocket.depositZeros}), the why-phrase ${bd.pocket.nothingToDeposit}, views ${bd.views}, fallbacks ${bd.fallbacks}${bd.depositPositives > 0 ? `, deposit positives ${bd.depositPositives}` : ''}${fork}${bd.rate ? `, the door's rate ${bd.rate.doorPct}% of ${bd.rate.visits} visit-lines` : ''}`)
}
// (v0.704.0) THE FUEL LANE'S OWN DOOR - the nudge walk's own verdict in
// the fuel lane's skin, the bank's legs' sibling across the lane fence.
// Its own row (the legs-only gate does not own it), the honest silence
// when the lane walked clean.
if (bd && bd.fuel.total > 0) console.log(`  the fuel lane's own door (v0.704.0): ${bd.fuel.total} walk failure(s) after the nudge (decide ${bd.fuel.decide}, no path ${bd.fuel.noPath}, retry timeouts ${bd.fuel.retryTimeout}${bd.fuel.other > 0 ? `, other ${bd.fuel.other}${bd.fuel.goalBrake > 0 || bd.fuel.rescueRefused > 0 ? ` - the other's skins: the goal brake ${bd.fuel.goalBrake}, the water rescue's refusals ${bd.fuel.rescueRefused}` : ''}` : ''})`)
if (bd && bd.iron.total > 0) console.log(`  the iron commune's own door (v0.705.0): ${bd.iron.total} walk failure(s) (decide ${bd.iron.decide}, no path ${bd.iron.noPath}, retry timeouts ${bd.iron.retryTimeout}${bd.iron.other > 0 ? `, other ${bd.iron.other}${bd.iron.goalBrake > 0 || bd.iron.rescueRefused > 0 ? ` - the other's skins: the goal brake ${bd.iron.goalBrake}, the water rescue's refusals ${bd.iron.rescueRefused}` : ''}` : ''})`)
// (v0.716.0) THE NOPATH DOOR'S OWN BOT BILL - the spike's WHO read (the
// door family's no-path rides folded per bot per lane): a lane's repeats
// name the column reproducing (the relog lane's v0.715.0 law's door-side
// twin), a wide distinct spread names the crowd riding (the goal's own
// verdict - the approach side stays the coordinate lens's front). The
// honest silence when the doors read no no-path.
const npb = nopathBill(lines)
if (npb) {
  const laneRow = (lane) => lane.n > 0
    ? `${lane.n} by ${lane.distinct} bot(s)${Object.keys(lane.repeats).length > 0 ? ` (repeats ${Object.entries(lane.repeats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')})` : ''}`
    : 'clean'
  // (v0.718.0) THE RIDER'S OWN CROSS-LANE - the additive tail (the v0.653.0
  // law: the row's existing prose stays byte-stable): the bots the door
  // family refused ACROSS LANES, the heaviest first (the stance read -
  // every lane refused the same bot's approach, the 41st's F15 the whale).
  const riders = npb.crossLane.total > 0
    ? Object.entries(npb.crossLane.rides).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}u@${npb.crossLane.bots[k]}lanes`).join(' ')
    : ''
  console.log(`  the no-path door's own bot bill (v0.716.0): ${npb.n} ride(s) - fuel ${laneRow(npb.fuel)} / food ${laneRow(npb.food)} / iron ${laneRow(npb.iron)} - the repeats' column vs the crowd's spread names the spike's owner${riders ? ` - the cross-lane rider(s) (v0.718.0): ${riders} - THE STANCE READ: every lane refused the same bot's approach` : ''}`)
}
// (v0.706.0) THE DOORSTEP STORM'S CENSUS - the three lanes' doors fold
// into one toll (a census is a SUM, not a row of cells): the storm's
// size per face and the decide skins' share of it (the A* doorstep
// starvation's own slice). The honest silence when no door read.
if (bd) {
  const storm = doorstepStormCensus(bd)
  if (storm) console.log(`  the doorstep storm's census (v0.706.0): ${storm.total} door(s) across the three lanes (${storm.lanes.map(l => `${l.lane} ${l.total}`).join(', ')}) - the decide skins ${storm.decide} of ${storm.total} (${storm.decidePct}%)`)
}
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

// (v0.441.0) THE ZERO CLOCK - every hop zero class bracketed into the
// face's thirds by its pulse anchors (the midpoint read; unplaced counted,
// never assumed). The question the lens exists for: the budget-floor class
// (the chain budget's own exhaustion) - LATE dominance means the floor's
// EOF design bounded the spend and the pocket's drain is the lever; MID
// dominance means the budgets themselves are the lever.
console.log('--- ZERO CLOCK (v0.441.0: the hop zeros\' face-phase anatomy, thirds of the observed clock) ---')
const zeroClock = zeroClockCensus(lines)
if (zeroClock.zeros.length > 0) {
  console.log(`  clock: end ${zeroClock.clockEnd}s over ${zeroClock.anchors.length} anchor(s), thirds ${zeroClock.thirdS !== null ? Math.round(zeroClock.thirdS) : '?'}s, wide brackets ${zeroClock.wide} (the sparse-anchor faces judge the midpoints loosely)`)
  const classes = Object.entries(zeroClock.byClass).sort((a, b) => b[1].n - a[1].n)
  for (const [why, row] of classes) {
    const bots = Object.entries(row.byBot).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  ${why}: n=${row.n} early ${row.byPhase.early} / mid ${row.byPhase.mid} / late ${row.byPhase.late} / unplaced ${row.byPhase.unplaced}${bots ? ` per bot: ${bots}` : ''}`)
  }
  const bf = budgetFloorVerdict(zeroClock)
  if (bf.verdict === 'late') console.log(`  THE BUDGET-FLOOR VERDICT: LATE-dominant (${bf.n}) - the floor's EOF design bounded the spend; the pocket's drain is the lever, the budget is not`)
  else if (bf.verdict === 'mid') console.log(`  THE BUDGET-FLOOR VERDICT: MID-dominant (${bf.n}) - the chain budgets bite mid-run; the budget sizing is the lever`)
  else if (bf.verdict === 'early') console.log(`  THE BUDGET-FLOOR VERDICT: EARLY-dominant (${bf.n}) - the floor bites from the start; the chain's opening budget is the lever`)
  else if (bf.verdict === 'mixed') console.log(`  THE BUDGET-FLOOR VERDICT: mixed (${bf.n}) - no dominance, no verdict claimed`)
  // (v0.473.0) THE BUDGET SPREAD - the sizing lever's per-bot half: does
  // the zero-delivery budget bite ONE bot (a local defect - the bot's own
  // route or chest) or SPREAD across the lane (the fleet-wide sizing
  // lever)? The trip kind rides the line (fuel commons | iron commune);
  // the goal mass is the sizing read's raw material. Zero budgets read
  // zero honestly (the row stays silent).
  const bs = budgetSpread(lines)
  if (bs && bs.zeros > 0) {
    const bsBits = Object.entries(bs.perBot).sort((x, y) => y[1].zeros - x[1].zeros || x[0].localeCompare(y[0])).slice(0, 4).map(([k, v]) => `${k}=${v.zeros}`).join(' ')
    console.log(`  budget zeros (v0.473.0): ${bs.zeros} zero-delivery budget(s) (delivered ${bs.delivered} of ${bs.goal}u goal) across ${bs.spreadBots} bot(s) - fuel ${bs.byKind.fuel}, commune ${bs.byKind.commune}${bs.topBot ? `, top ${bs.topBot} ${bs.topN}` : ''}${bsBits ? ` (${bsBits})` : ''}`)
    // (v0.475.0) THE GOAL SPLIT - the sizing lever's goal-size half: do the
    // zero-delivery budgets ride TINY goals (the goal itself is the
    // miscalibration - raise the floor) or spread across goal sizes (the
    // chain is the lever)? The zero-delivery class only; silent on zero.
    const bgs = budgetGoalSplit(lines)
    if (bgs && bgs.zeros > 0) {
      const pct = Math.round(bgs.oneShare * 100)
      console.log(`  budget goal split (v0.475.0): one-unit ${bgs.one.zeros}/${bgs.zeros} (${pct}%, ${bgs.one.goal}u) - 2-3u ${bgs.small.zeros} (${bgs.small.goal}u), 4+u ${bgs.wide.zeros} (${bgs.wide.goal}u) - ${pct >= 50 ? 'the 1u goal itself is the miscalibration candidate' : 'the sizing lever rides the chain, not the goal'}`)
    }
  }
} else {
  console.log(`  hop zeros: 0 (clock ${zeroClock.clockEnd === null ? 'unread' : zeroClock.clockEnd + 's'} - the honest zero)`)
}

// (v0.438.0) THE OPEN-DEAF WINDOW - the open-timeout hop zeros against the
// face's distress clock. The bot REACHED the chest and could not OPEN it for
// 10s; the mechanism (server-tick starvation vs chest contention) was
// unpriced. The read: each zero bracketed by its pulse anchors (lo..hi), the
// bracket tested against the allocvalve's closed spans and the mainLate
// spikes. SEMANTICS: no overlap is the HYPOTHESIS KILL (the zero definitely
// sat outside the window); an overlap is only a POSSIBLE hit (the bracket is
// a window, not a moment) - the asymmetry is the read's honesty.
console.log('--- OPEN-DEAF WINDOW (v0.438.0: the open-timeout zeros vs the valve + the main-late spikes) ---')
const openDeaf = openDeafCensus(lines)
if (openDeaf.openDeaf.length > 0) {
  console.log(`  anchors: ${openDeaf.anchors.length} pulse read(s), late>=${openDeaf.lateMs}ms: ${openDeaf.anchors.filter((a) => a.mainLate !== null && a.mainLate >= openDeaf.lateMs).length}`)
  const spans = openDeaf.valve.spans.map((s) => s.open !== null ? `[${s.close}..${s.open}]` : `[${s.close}..unclosed]`).join(' ')
  console.log(`  valve: closes ${openDeaf.valve.closes}, opens ${openDeaf.valve.opens}, unclosed ${openDeaf.valve.unclosed}${spans ? `, spans: ${spans}` : ''}`)
  const brackets = openDeaf.openDeaf.map((e) => `[${e.lo === null ? '?' : e.lo}..${e.hi === null ? '?' : e.hi}]@${e.chest || '?'}(${e.bot})`).join(' ')
  console.log(`  open-timeout zeros: n=${openDeaf.openDeaf.length}, ms ${openDeaf.ms.min}..${openDeaf.ms.max}, brackets: ${brackets}`)
  console.log(`  bracket-in-window (possible): ${openDeaf.paired.inValveCloseN}, late-bracket (possible): ${openDeaf.paired.lateN} - 0 overlaps = the lag hypothesis DIES for those zeros`)
  // (v0.439.0) the retry voice's own ledger - the TRUE open-deaf burn is
  // 2x the zeros' price (each zero burned TWO 10s attempts), and a 'won'
  // row is a delivery the old log priced as a coin-flip.
  const r = openDeaf.retries
  if (r.n > 0) {
    const rb = Object.entries(r.byBot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  open retry voice: n=${r.n} (cause ${r.byKind.cause} / won ${r.byKind.won} / lost ${r.byKind.lost}), per bot: ${rb}, matched: ${r.matched} - the true open-deaf burn is 2x the zeros' ms (two 10s attempts each)`)
  } else {
    console.log('  open retry voice: 0 lines (a pre-v0.439.0 face or clean opens - the two are not distinguishable by design)')
  }
  // (v0.444.0) THE OPEN LOST AUTOPSY row - the lost opens' block identity.
  // The ALL-LOST field verdict (face 30) left the cure direction open: a
  // block still reading chest prices occlusion/lag (the arrival/admission
  // front), a replaced/unloaded block prices stale coords (the map's rot).
  // The row reads the share and the lost-match consistency; a pre-v0.444.0
  // face or a face with no lost opens stays silent-honest.
  const au = openDeaf.autopsies
  if (au.n > 0) {
    const bb = Object.entries(au.byBlock).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')
    console.log(`  open lost autopsy: n=${au.n} blocks: ${bb} (matches the ${r.byKind.lost} lost: ${au.matchedLost}) - chest reads price occlusion/lag, the rest prices stale coords`)
    // (v0.448.0) THE DEAD CHEST LEDGER row - the fleet's RETURNS to the
    // autopsied chests: per coord, the hop approaches split by class
    // (open-zeros are THIS lane's burn, walk-zeros are the walk lanes'),
    // and the repeat verdict: a stale coord re-burned to another open-zero
    // is the preflight/blacklist cure's direct fuel; a one-off stale
    // prices only a future return. A chest-verdict coord's repeats are
    // the arrival front's evidence, named but not owned here.
    const fate = chestFateLedger(lines)
    if (fate.n > 0) {
      console.log('--- DEAD CHEST LEDGER (v0.448.0: the returns to the autopsied chests - the stale-cure\'s fuel) ---')
      for (const c of fate.coords) {
        const leg = c.verdict === 'stale'
          ? 'THE STALE LEG (the map rotted under the plan)'
          : 'the occlusion leg (the arrival front owns the burn)'
        const ap = c.approaches
        const reads = ap
          ? `approached ${ap.total}x (open ${ap.open}, walk ${ap.walk}${ap.dMin !== null ? `, d ${ap.dMin}..${ap.dMax}` : ''})`
          : 'no hop-zero approaches this face'
        const verdict = c.verdict === 'stale'
          ? (ap && ap.open > 1
            ? ' - THE REPEAT: the fleet burned on rot it had already paid for, the blacklist cure\'s direct case'
            : ' - a one-off this face, the preflight prices a future return\'s 20s')
          : ''
        console.log(`  [${c.chest}]: reads ${c.block} - ${leg}; ${reads}${verdict}`)
      }
      console.log(`  stale repeats: ${fate.staleRepeats} coord(s) opened-lost more than once - ${fate.staleRepeats > 0 ? 'the blacklist cure has its fuel' : 'the blacklist cure waits for its fuel'}`)
    }
  } else if (r.byKind.lost > 0) {
    console.log(`  open lost autopsy: 0 lines against ${r.byKind.lost} lost (a pre-v0.444.0 face - the dead chests' identity is not distinguishable by design)`)
  }
} else if (openDeaf.anchors.length > 0 || openDeaf.valve.closes > 0) {
  console.log(`  open-timeout zeros: 0 (the face's distress clock: ${openDeaf.anchors.length} anchor(s), ${openDeaf.valve.closes} valve close(s) - the honest zero)`)
} else {
  console.log('  open-timeout zeros: 0, no anchors, no valve lines (the face never printed the clock - nothing claimed)')
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
    // (v0.689.0) THE DECIDE WEATHER - the starves' own sky read (the memory
    // correlation front's sibling leg): every decide refusal joined to the
    // mem gauge at or before its own anchor - does the A* starve under the
    // entity climb's pressure, or on its own geometry.
    const dw = decideWeather(lines)
    if (dw.gauged > 0 && dw.ents) {
      const fork = dw.crowded
        ? (dw.crowded.n * 2 >= dw.crowded.of
            ? 'the starve rode the crowded sky'
            : 'the starve is its own disease - the sky stayed calm at the starves')
        : 'the share unpriced (no ceiling)'
      const share = dw.crowded
        ? `${dw.crowded.n}/${dw.crowded.of} gauged starves sat at or past half the face's ents ceiling`
        : 'the share unpriced (no ceiling)'
      console.log(`  the decide weather: the A* starved at ents ${dw.ents.min}..${dw.ents.max} (median ${dw.ents.median}) / rss ${dw.rss.min}..${dw.rss.max}M - ${share} (${fork})`)
    } else if (dw.fails > 0) {
      console.log(`  the decide weather: ${dw.fails} starve(s), ${dw.ungauged} before the first gauge - the sky never read`)
    }
    // (v0.695.0) THE HOP LANE'S SKY - the hop-zero lane's own decide
    // starves under the same sky (the v0.689.0 lens grew the lane): the
    // bank yard's own zeros ride here, and the drained sky names the
    // starves the entity climb cannot explain (the rss that stayed is
    // the row's own suspect).
    if (dw.hop.zeros > 0) {
      if (dw.hop.gauged > 0 && dw.hop.ents) {
        const share = dw.hop.crowded
          ? `${dw.hop.crowded.n}/${dw.hop.crowded.of} at or past half the face's ents ceiling`
          : 'the share unpriced (no ceiling)'
        const drained = dw.hop.drained && dw.hop.drainedRss
          ? `, ${dw.hop.drained.n}/${dw.hop.drained.of} under the drained sky (ents 0 - the entity climb cannot explain those, the rss held ${dw.hop.drainedRss.min}..${dw.hop.drainedRss.max}M)`
          : ''
        console.log(`  the hop lane's sky: ${dw.hop.zeros} hop zero(s) starved at ents ${dw.hop.ents.min}..${dw.hop.ents.max} (median ${dw.hop.ents.median}) / rss ${dw.hop.rss.min}..${dw.hop.rss.max}M - ${share}${drained}`)
      } else {
        console.log(`  the hop lane's sky: ${dw.hop.zeros} hop zero(s), ${dw.hop.ungauged} before the first gauge - the sky never read`)
      }
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
    // (v0.436.0) THE UNDERGROUND ATTEMPTS READ - the shaft-bottom chain's
    // burn (the face-27 underground=21 class's own number).
    const ug = bf.zeros.underground
    if (ug.n > 0) {
      const ub = Object.entries(ug.byBot).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')
      const att = ug.attempts.n > 0 ? `, attempts ${ug.attempts.min}..${ug.attempts.max} (avg ${(ug.attempts.sum / ug.attempts.n).toFixed(1)})` : ''
      const pinned = Object.keys(ug.byBot).length === 1 && ug.n >= 3 ? ' - THE SHAFT-BOTTOM SEAT (the per-bot doom)' : ''
      console.log(`  still-underground zeros: ${ug.n}${att}${ub ? `, top bots: ${ub}` : ''}${pinned}`)
    }
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
    // (v0.420.0) THE NOPATH GOAL ROW - the no-path verdict's own detail leg
    // (the F17 anomaly's read: the A* PROVES the goal sphere dead, the doomed
    // ledger then refuses the neighborhood without a second A*). Goals
    // dedup'd first-seen, cap 24 (nopath.mjs's own NOPATH_CAP parity).
    if (dw.nopath.n > 0) console.log(`  no-path: n=${dw.nopath.n} goals ${dw.nopath.goals.join(' ') || 'none'}`)
    if (dw.ceiling.n > 0) console.log(`  ceiling: n=${dw.ceiling.n} maxGoals=${dw.ceiling.maxGoals} maxRefused=${dw.ceiling.maxRefusedS}s`)
    // (v0.431.0) THE GOAL ADMISSION - the standability gate's share (the
    // refusal fired BEFORE the goto: no budget burned on those goals, the
    // walked split's stuck share reads the residue the gate did not own).
    if (dw.admission.n > 0) console.log(`  goal admission: n=${dw.admission.n} (unstandable goals refused before the goto - the burn they would have paid leaves the lane)`)
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
// (v0.661.0) THE MAIN FREEZE'S OWN ROW - the distress row's own body: the
// blackbox dump fires when mainLate >= 5s and the freeze owns the face's
// economy (the 37265374356 face: ~53s at ts=561s, 'pf:queue fuel commons
// w' named, banked 55 of 1640 mined - the cadence froze inside the one
// window that had to deliver). Face order, each freeze its own token;
// 'no main freeze' on the honest zero.
console.log('  ' + mainFreezeCensus(lines).row)
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

// (v0.440.0) THE PLAN TOP NAMES - the deficits board's named seat (the
// v0.417.0 index caveat CURED: face 28's stuck slot sat at 157926/0 (0.0%)
// for the whole face and NO ONE could say which resource - the anonymous
// row's own design debt). The named board rides the same tick emission
// beside the deficits line (the deficits line stays byte-identical); this
// census reads the seat's NAME arc: one distinct name all face = THE NAMED
// STUCK SIGNATURE (aim the fleet there), hand changes = the board's stuck,
// not one resource's. The per-resource arcs name the plan's permanent
// residents (a resource on EVERY board row never left the top five).
{
  const pt = planTopCensus(lines)
  if (pt.rows > 0 || pt.unparsed > 0) {
    console.log('--- PLAN TOP NAMES (v0.440.0: the stuck slot has a name) ---')
    console.log(`  named boards: ${pt.rows} rows, slots/row ${pt.slotsPerRow.min}..${pt.slotsPerRow.max}`)
    if (pt.rows === 0) {
      // (v0.442.0) THE LEAK VERDICT: every named row escaped - face 30's
      // emitter leak class (the res key never rode the materialsProgress
      // value, the JS-undefined token printed in the name's seat). The seat
      // line stays silent (no fake name math); the escape hatch speaks.
      console.log('  worst seat: unnamed - EVERY named row escaped the grammar (the emitter-leak class: the name\'s source printed a token no resource key can own); the named signature needs the emitter fix, the deficits clock still reads')
    } else {
      const st = pt.seat
      const seatNote = st.distinctNames.length === 1
        ? ' - THE NAMED STUCK SIGNATURE: ONE resource held the worst seat all face'
        : ` - the seat changed hands ${st.handChanges} time(s): the board is stuck, not one resource`
      console.log(`  worst seat: ${st.firstName} -> ${st.lastName} (${st.distinctNames.length} distinct name(s)${st.distinctNames.length <= 3 ? `: ${st.distinctNames.join(' -> ')}` : ''})${seatNote}`)
      const residents = Object.entries(pt.byRes).sort((a, b) => b[1].n - a[1].n).slice(0, 3)
      for (const [res, a] of residents) {
        console.log(`  ${res}: n=${a.n} pct ${a.firstPct}%..${a.lastPct}% (min ${a.minPct}%, max ${a.maxPct}%), have ${a.minHave}..${a.maxHave}`)
      }
    }
    if (pt.unparsed > 0) console.log(`  unparsed rows: ${pt.unparsed} (the named-row shape escaped - counted, never dropped)`)
  }
}

// (v0.445.0) THE MAP TRIP GAP - the named stuck resource's own delivery
// read: the knowledge side (the worldmap tail's position counts) beside
// the launch economics (the v0.415.0 census) and the plan's stuck name
// (the v0.440.0 named board). Face 31's shape: sand required 157926,
// have 0..12 all face, the map HOLDS sand=226 - and the trips named it
// 10x with 9 unreachable + 7 shaft-locked + 1 launched: the KNOWLEDGE leg
// is fat, the DELIVERY leg starves. Honest skips: no stuck name (the
// board churned), no map tail (a pre-worldmap face), no trip lines at all
// - each reads its own silence, nothing composed from nothing.
{
  const pt = planTopCensus(lines)
  const stuck = pt.rows > 0 && pt.seat.distinctNames.length === 1 ? pt.seat.lastName : null
  const mt = mapTripCensus(lines)
  const wm = parseWorldmapTail((() => { for (let i = lines.length - 1; i >= 0; i--) { const w = parseWorldmapTail(lines[i]); if (w) return lines[i] } return null })())
  if (stuck && mt.launches + mt.skips.n > 0) {
    const g = mapTripGap(mt, wm, stuck)
    const know = g.mapKnown
      ? `the map holds ${g.mapPositions} ${stuck} position(s)`
      : 'the map\'s knowledge is unreadable by design (no worldmap tail this face)'
    console.log('--- MAP TRIP GAP (v0.445.0: the stuck resource\'s knowledge-delivery read) ---')
    console.log(`  ${stuck}: demanded by the trip lane ${g.demanded}x (launches ${g.stuckLaunches}, unreachable skips ${g.unreachable}, shaft-locked ${g.shaftLocked}); ${know} - the delivery leg, not the knowledge leg, is the lever`)
  }
}

// (v0.447.0) THE TRIP RECEIPT - the delivery leg's YIELD: did the launches
// that DID leave ever move the pocket? The periodic pulse line's counter
// tail is the fleet-wide read (unattributed by construction); each
// res-launch gets the delta across its 2-sample window (~30s), and the
// incidental verdict prices the counter's own motion against the first
// launch. Face 32's shape: six launches (4 sand) yet the first nonzero
// landed BEFORE the first sand launch - the shore leg feeds the pocket
// too. Honest skips: no samples (a pre-pulse face), no launches (the gap
// row's own subject), a pocket that never moved (the verdict says so).
{
  const rc = tripReceipt(lines, 'sand')
  if (rc) {
    console.log(`--- TRIP RECEIPT (v0.449.0: the delivery leg's yield - the window calibrated to the trip's round trip: ${RECEIPT_WINDOW_SAMPLES} samples) ---`)
    const verdict = rc.firstNonzeroVsLaunch === 'before'
      ? `the first nonzero landed BEFORE the first ${rc.res} launch - the incidental leg (shore/underground) feeds the pocket too`
      : rc.firstNonzeroVsLaunch === 'after'
        ? `the first nonzero landed AFTER the first ${rc.res} launch - the launch window delivered`
        : 'the pocket never moved all face'
    console.log(`  ${rc.res} pocket: start ${rc.start} -> end ${rc.end} (peak ${rc.peak}); first nonzero ${rc.firstNonzero ? `at t-${rc.firstNonzero.t}s` : 'none'} - ${verdict}`)
    // (v0.449.0) each window carries its span (the delta's accrual time)
    // and holeMax (the largest sampling gap inside); a holeMax above the
    // trip walk budget (45s) means a SAMPLING HOLE sat inside - the delta
    // is a BOUND, never a timing read (face 33's hole was 82s).
    const w = rc.windows.map(x => {
      if (x.delta === null) return `${x.bot}(no sample in window)`
      const hole = x.holeMax > 45 ? `, hole ${x.holeMax}s - a bound, not a timing read` : ''
      const sp = x.span !== null ? ` (span ${x.span}s${hole})` : ''
      // (v0.456.0) the window's sign named: delivered / drained / flat
      return `${x.bot}${x.delta >= 0 ? '+' : ''}${x.delta}u${sp} ${x.sign}`
    }).join(' ')
    console.log(`  launch windows (${rc.windows.length}, ${RECEIPT_WINDOW_SAMPLES}-sample fleet-wide, unattributed): ${w || 'none'}`)
    // (v0.456.0) THE WINDOW'S SIGN - the summary. A DRAINED window is the
    // plan-side alarm: the resource's stock FELL while a trip ran (the
    // demand outran the delivery); flat rides the face-33 lag class.
    const signs = { delivered: 0, drained: 0, flat: 0 }
    for (const x of rc.windows) if (x.sign) signs[x.sign]++
    if (signs.drained > 0) {
      console.log(`  DRAINED WINDOW(S): ${signs.drained} - the stock FELL across the launch window (a withdrawal/death/placement inside the span outran the trip; the launch's own yield is a net read, never attributed)`)
    } else if (signs.flat > 0) {
      console.log(`  flat window(s): ${signs.flat} - the stock held (the face-33 lag class: the yield may sit past the window)`)
    }
  }
}

// (v0.451.0) THE POCKET DRAIN LEDGER - where the pocket's peak goes. The
// receipt prices the rise; the faces kept ending with the pocket drained
// (face 34: peak then 404u). The pulse header's own banked/smelted
// counters settle it: the bank absorbed the drop (the delivery chain
// closed end-to-end), the furnace did, both, or honestly UNACCOUNTED.
{
  const pd = pocketDrain(lines)
  if (pd) {
    console.log('--- POCKET DRAIN LEDGER (v0.451.0: the pulse header\'s banked/smelted counters vs the pocket\'s peak-to-end drop) ---')
    const why = pd.verdict === 'banked'
      ? `the bank absorbed the drain (the delivery chain closed end-to-end)`
      : pd.verdict === 'smelted'
        ? 'the furnace absorbed the drain'
        : pd.verdict === 'banked+smelted'
          ? 'the bank and the furnace absorbed the drain together'
          : pd.verdict === 'unaccounted'
            ? 'UNACCOUNTED - the counters cannot explain the drop (placement/loss/crafting - the next read\'s subject)'
            : 'no drain - the pocket never fell below its peak'
    console.log(`  pocket start ${pd.start}u -> end ${pd.end}u (peak ${pd.peak}u at t-${pd.peakT}s, drop ${pd.drop}u); banked +${pd.bankedDelta}, smelted +${pd.smeltedDelta} over ${pd.samples} samples - ${why}`)
    // (v0.452.0) THE DRAIN ATTRIBUTION - the residual's legs, the log's
    // own words. The ledger's 'unaccounted' named placement/loss/crafting;
    // the death-drop and climb-bridge emitters price the first two. The
    // 0.451.0 line above stays byte-identical - this row rides after it.
    const da = pocketDrainAttr(lines)
    const blocks = Object.entries(da.placedBlocks).map(([k, n]) => `${k} ${n}`).join(' ')
    const attrWhy = da.attr === 'none'
      ? 'the counters already cover the drop - nothing to attribute'
      : da.attr === 'covered'
        ? `the legs cover the residual (a bound read - line-order after the peak sample's line; the pulse cadence's own gap unseen)`
        : da.attr === 'partial'
          ? `the legs price ${da.legs}u of ${da.residual}u - the rest (crafting/the unseen) stays open`
          : 'no priced legs after the peak - crafting/the unseen holds the residual'
    console.log(`  drain attribution: deaths lost ${da.lossDelta}u (${da.lossCount} drop(s)), placements ${da.placedDelta}u (${da.placedDelta} line(s)${blocks ? `: ${blocks}` : ''}) - ${attrWhy}`)
    // (v0.454.0) THE POCKET KILLERS - the loss leg's kind split, the same
    // post-peak window. Each death drop pairs with the bot's most recent
    // died line's own [kind=X] token (the server kind stays the authority);
    // the top token names the cure lane (mob* -> the combat/night lane,
    // drown -> the water lane). Honest pairMisses when the died line never
    // showed for a drop's bot.
    const ranked = Object.entries(da.lossKinds).sort((x, y) => y[1].u - x[1].u)
    if (ranked.length) {
      const kinds = ranked.map(([k, v]) => `${k} ~${v.u}u/${v.n}`).join(', ')
      const miss = da.pairMisses > 0 ? `, ${da.pairMisses} unpaired` : ''
      console.log(`  pocket killers (v0.454.0): ${kinds}${miss} - the top killer names the drain's cure lane`)
    } else if (da.attr !== 'none') {
      console.log('  pocket killers (v0.454.0): none after the peak - the loss leg had no drops to name')
    }
    // (v0.453.0) THE MATERIAL BALANCE - the counter identity's whole-face
    // cross-check: does mined close the loop against the three sinks?
    // Independent of the event lens above (no death-drop/placement lines
    // read); the leaks share is the arithmetic bound the event split must
    // reconcile with.
    const mb = materialBalance(lines)
    if (mb) {
      const mbWhy = mb.verdict === 'no-flow'
        ? 'nothing mined - the identity has no subject'
        : mb.verdict === 'balanced'
          ? 'the counters close the loop (within 5% of mined)'
          : mb.verdict === 'leaky'
            ? `a NAMED whole-face share sits outside the sinks (placement/loss/crafting - the event lens splits it)`
            : `crafting's unit inflation outran the losses - the unit-count trap, seen from the counters' side`
      console.log(`  material balance: mined +${mb.mined} = pocket ${mb.pocket >= 0 ? '+' : ''}${mb.pocket} + banked +${mb.banked} + smelted +${mb.smelted} + leaks ${mb.leaks >= 0 ? '+' : ''}${mb.leaks} (${(mb.share * 100).toFixed(1)}% of mined) - ${mbWhy}`)
      // (v0.455.0) THE LENSES CONVERGE - the balance's leak meets the
      // event lens's whole-face legs (the same emitters' shapes, ALL
      // lines, not post-peak). covered = the emitters' words account for
      // the leak (the slack is the ~Nu pricing's inflation margin);
      // shortfall = a NAMED share they never priced - the honesty, not a
      // guess. (v0.458.0) THE RE-GATHER SHARE - on covered faces the row
      // names where the legs' value went: the counters' leak covers only
      // (1 - share) of the priced legs; >= 50% un-leaked = the drops
      // largely came home (the indirect pricing the pickup-less log
      // allows - no new emitter, arithmetic on the row's own numbers).
      // (v0.460.0) THE NO-LEAK'S OWN NAME - face 39 fired the no-leak
      // branch live for the first time and exposed the naming debt: the
      // slack print CONFLATES there (legs + the inflation surplus, not a
      // re-gather margin). The no-leak row drops the slack and names the
      // regime with the branch's own number (inflation = -leaks): the
      // legs absorbed whole + the sinks' surplus, two numbers, no
      // conflation.
      const rc = balanceReconcile(lines)
      if (rc) {
        const slackSeg = rc.verdict === 'covered' ? `, slack ${rc.slack >= 0 ? '+' : ''}${rc.slack}u` : ''
        const rcWhy = rc.verdict === 'no-leak'
          ? `the legs' ${rc.legs}u never leaked and the sinks outran mined by ${rc.inflation}u (the inflated side lands here honestly - the unit-count trap's surplus)`
          : rc.verdict === 'covered'
            ? `the emitters' own words account for the whole-face leak - the slack is the ~Nu pricing's inflation margin; the re-gather share ${(rc.recollection * 100).toFixed(0)}% (${rc.recollectionVerdict === 're-collected' ? 'the drops largely came home' : 'the drops stayed lost - the leak is their fate'} - the pickup-less log's indirect pricing)`
            : `a NAMED share the log's emitters never priced (unemitted loss - the lens's own blind spot, quantified)`
        console.log(`  balance reconcile: leaks ${rc.leaks >= 0 ? '+' : ''}${rc.leaks}u vs the event lens's whole-face legs ${rc.legs}u (deaths ${rc.lossDelta}u/${rc.lossCount} drop(s) + placed ${rc.placedDelta}u) - ${rc.verdict}${slackSeg} - ${rcWhy}`)
      }
      // (v0.472.0) THE LEAK CLOCK - the share's third split, the clock
      // candidate. Both prose splits are dead (the most violent face
      // re-collected 82%; a moderate face read 11%): the remaining
      // driver is WHEN the legs died - a drop at t-560s has ~9 minutes
      // to come home, a drop at t-40s has none. The row splits the
      // death drops' units across the face's real pulse window thirds
      // (the last sample's t at or before the line governs) and prints
      // the u-weighted clock center - the share's driver read rides
      // BESIDE it, never guessed from one face.
      const lc = leakClock(lines)
      if (lc && lc.samples >= 2) {
        const pb = `placed by third: early ${lc.placedByThird.early}, mid ${lc.placedByThird.mid}, late ${lc.placedByThird.late}${lc.placedUnpositioned ? ` (unpositioned ${lc.placedUnpositioned})` : ''}`
        const conc = lc.drops.n > 0
          ? ` - concentration: max ${lc.drops.maxU}u (${lc.drops.maxBot}) = ${(lc.drops.maxShare * 100).toFixed(0)}% of the dropped ${lc.drops.u}u (the sweep's reach candidate)`
          : ''
        console.log(`  the leak clock (v0.472.0): window t-${lc.tMax}s..t-${lc.tMin}s over ${lc.samples} sample(s) - death drops: early ${lc.legs.early.u}u/${lc.legs.early.n}, mid ${lc.legs.mid.u}u/${lc.legs.mid.n}, late ${lc.legs.late.u}u/${lc.legs.late.n}, unpositioned ${lc.unpositioned.u}u/${lc.unpositioned.n} - clock center ${lc.clockCenter} (0 = the face's start, 1 = its end); ${pb}${conc}`)
      }
    }
  }
  // (v0.461.0) THE SMELT LEDGER - the furnace lane's own words counted
  // (the standing furnace/smelt front's first read leg). The pulse
  // counters price the smelt sink but never name WHAT burned or where
  // the chain lost throughput; the log's smelt lines carry the
  // quantities verbatim. The row joins the words' side to the counter's
  // smelted delta - the gap named, not guessed (the re-smelt shadow is
  // the clips' own candidate: 'the rest re-smelts on the next chain',
  // and a next chain that never announces stays the counter's blind
  // spot). Idle faces read honestly: refusals by why, zero batches.
  const sl = smeltLedger(lines)
  if (sl && (sl.batches > 0 || sl.refusals > 0)) {
    const clipBits = []
    if (sl.fuelClips) clipBits.push(`fuel clips ${sl.fuelClips} (${sl.fuelClipCompleted} of ${sl.fuelClipAsked} completed)`)
    if (sl.clockClips) clipBits.push(`clock clips ${sl.clockClips} (${sl.clockClipCompleted} of ${sl.clockClipAsked})`)
    const topWhys = Object.entries(sl.refusalWhys).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([w, n]) => `${w} ${n}`).join(', ')
    const refusalBit = sl.refusals ? `, refusals ${sl.refusals}${topWhys ? ` (${topWhys})` : ''}` : ''
    const itemBits = Object.entries(sl.items).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(' ')
    const fuelBits = Object.entries(sl.fuelItems).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, n]) => `${k} ${n}`).join(' ')
    console.log(`  smelt ledger (v0.461.0): batches ${sl.batches} (announced ${sl.announced}u${itemBits ? `: ${itemBits}` : ''}, fuel ${sl.fuel}u${fuelBits ? `: ${fuelBits}` : ''})${clipBits.length ? ` - ${clipBits.join(', ')}` : ''}${refusalBit}`)
    // (v0.462.0) THE HARVEST LEG - the join's both halves on one row: the
    // took lines (the machine's own output collection, the smelted
    // counter's emitter twin) beside the counter's smelted delta. NO gap
    // formula is claimed - the fired batches complete off-screen and any
    // bot's collect reads the machine, so the counter's window vs the
    // words' window is the next read's subject; the row carries the two
    // numbers, the eyeball join, nothing invented.
    const mbJoin = materialBalance(lines)
    const collectedBits = Object.entries(sl.tookItems).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(' ')
    if (sl.tooks > 0) {
      const counterBit = mbJoin ? ` vs the counter's smelted +${mbJoin.smelted}u` : ''
      console.log(`  smelt harvest (v0.462.0): took ${sl.collected}u/${sl.tooks} line(s)${collectedBits ? ` (${collectedBits})` : ''}${counterBit}`)
    }
  }
  // (v0.664.0) THE FURNACE PUT'S OWN PAIR - the machine's diet counted.
  // smeltLedger reads the intent side ('smelting N x ...'), smeltVerdict
  // grades the yield - and the lane's own slot read-back (the v0.92.0
  // truth line) plus its no-walk opener had zero readers (the fire-1500
  // gap survey: 24 + 17 rows on face 37271081497). The pairing prints
  // whole - which smelt burns which fuel is the row's answer, never the
  // census's judgment. Zero opens and zero puts read nothing honestly.
  const fp = furnacePut(lines)
  if (fp && (fp.totals.opens > 0 || fp.totals.puts > 0)) {
    const parts = []
    if (fp.totals.opens) parts.push(`opens ${fp.totals.opens} (furnace ${fp.totals.opensFurnace} / blast_furnace ${fp.totals.opensBlast})`)
    if (fp.totals.puts) {
      const pairBits = Object.entries(fp.totals.pairs).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} x${n}`).join(', ')
      let bit = `puts ${fp.totals.puts}`
      if (pairBits) bit += ` (${pairBits})`
      if (fp.totals.pocketKeeps) bit += ` - pocket keeps ${fp.totals.pocketKept}u x${fp.totals.pocketKeeps}`
      if (fp.totals.emptyInputs || fp.totals.emptyFuels) bit += `, empty slots ${fp.totals.emptyInputs + fp.totals.emptyFuels}`
      parts.push(bit)
    }
    console.log(`  furnace put (v0.664.0): ${parts.join(' | ')}`)
  }
  // (v0.666.0) THE FUEL DIET'S OWN BILL - the intent side's fuel economics
  // split by the emitter's own window law (METAL_INPUTS verdict: metal
  // windows run coal-first, junk windows wood-first above the floor). The
  // smelt ledger counts the fuel whole and the furnace put prints the
  // pairing whole - the diet's COST is this row: the metal windows'
  // kindling bill (the fuel units vs the coal units that carry the same
  // capacity, the vanilla table's own 8:1 - arithmetic, not judgment) and
  // the junk windows' coal touch (the JUNK_COAL_FLOOR's own field read)
  // and the metal-in-a-plain-furnace mismatch (the blast lane's speed
  // lost). Zero starts print nothing (the byte-stable silence); an
  // unknown fuel never invents capacity.
  const fd = fuelDiet(lines)
  if (fd && fd.starts > 0) {
    const winBits = (win) => {
      const itemBits = Object.entries(win.items).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, n]) => `${k} ${n}`).join(' ')
      const fuelBits = Object.entries(win.fuelItems).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(' ')
      return `${win.batches} batch(es) ${itemBits}u on fuel ${win.fuel}u (${fuelBits}) - capacity ${Math.round(win.capacity * 10) / 10} smelts`
    }
    const parts = []
    if (fd.metal.batches) parts.push(`metal ${winBits(fd.metal)}, coal's ${fuelYieldOf('coal')}/u carries it on ${coalEquivalent(fd.metal.capacity)}u`)
    if (fd.junk.batches) {
      const coalTouch = fd.junk.fuelItems.coal || 0
      parts.push(`junk ${winBits(fd.junk)}${coalTouch ? `, the coal touch ${coalTouch}u` : ''}`)
    }
    if (fd.metalMismatch.count) {
      const mmBits = Object.entries(fd.metalMismatch.bots).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k}=${n}`).join(' ')
      parts.push(`the metal sat in a plain furnace x${fd.metalMismatch.count}${mmBits ? ` (${mmBits})` : ''}`)
    }
    console.log(`  fuel diet (v0.666.0): ${parts.join(' | ')}`)
  }
  // (v0.463.0) THE TIER DEFER CENSUS - the tool ladder's own voice
  // counted. The v0.252.0 steer prints one verdict line per NEW deferred
  // name per trip ('the pick cannot harvest the drops') - quantity-
  // bearing, unowned until now. The row names WHICH resources the
  // fleet's picks could not harvest (the upgrade rung's own work list)
  // and who deferred - the ladder's blind spot priced per face. Zero
  // lines read zero honestly (the picks harvested what they steered to,
  // or the steer never ran - the row does not guess which).
  const td = tierDeferCensus(lines)
  if (td) {
    const resBits = Object.entries(td.byResource).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(', ')
    const botBits = Object.entries(td.perBot).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([k, n]) => `${k}=${n}`).join(' ')
    console.log(`  tier defers (v0.463.0): ${td.defers}${resBits ? ` (${resBits})` : ''}${botBits ? ` per-bot: ${botBits}` : ''}`)
  }
  // (v0.465.0) THE UPGRADE CENSUS - the rung's other half. The tier-defer
  // row above names the ladder's work list; this row names its DELIVERY
  // ('[F9] [toolupgrade] [upgrade] upgraded: stone_pickaxe,...' - one line
  // = one bot's rung pass). The promise's test is the eyeball join: a bot
  // that deferred iron_ore and later reads 'upgraded: stone_pickaxe' took
  // the rung; a defer with no upgrade event kept its option (face 42's
  // F16). Zero events read zero honestly (the rung never ran - or nothing
  // was due; the row does not guess which).
  const uc = upgradeCensus(lines)
  if (uc) {
    const toolBits = Object.entries(uc.byTool).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(', ')
    const ubBits = Object.entries(uc.perBot).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([k, n]) => `${k}=${n}`).join(' ')
    console.log(`  tool upgrades (v0.465.0): ${uc.upgrades} event(s), ${uc.tools} tool(s)${toolBits ? ` (${toolBits})` : ''}${ubBits ? ` per-bot: ${ubBits}` : ''}`)
  }
  // (v0.467.0) THE DEFER PROMISE JOIN - the steer's tail promise put to an
  // order-aware test. The defer's own words: 'the tail keeps the option,
  // the upgrade rung restores the lead' - the bot's LAST defer line
  // governs; an upgrade event after it = took-after (the promise's live
  // pass), upgrades only before it = took-before-only (the defer outlived
  // the rung), none = kept (the option held). Co-existence reported,
  // causation never guessed (the row does not know WHY the rung ran).
  const dp = deferPromise(lines)
  if (dp && dp.deferringBots > 0) {
    const dpBits = Object.entries(dp.perBot).sort((x, y) => x[0].localeCompare(y[0])).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  the rung's promise (v0.467.0): ${dp.deferringBots} deferred bot(s) - took-after ${dp.tookAfter}, took-before-only ${dp.tookBeforeOnly}, kept ${dp.kept} (${dpBits})`)
  }
  // (v0.471.0) THE PROMISE PERSISTENCE - the promise's cross-face leg: the
  // kept bots of the PRIOR face (the optional second argument) are the roll
  // call, this face answers - reached / reached-after-defer (the strongest
  // form) / still-held. Zero kept in the prior face reads zero honestly
  // (the row stays silent); no prior face given -> no read (the row stays
  // silent too - one face cannot read persistence).
  if (prevLines) {
    const pp = promisePersistence(prevLines, lines)
    if (pp && pp.keptBots > 0) {
      const ppBits = Object.entries(pp.perBot).sort((x, y) => x[0].localeCompare(y[0])).map(([k, v]) => `${k}=${v}`).join(' ')
      console.log(`  the promise's persistence (v0.471.0): ${pp.keptBots} kept bot(s) from the prior face - reached ${pp.reached.length} (after-defer ${pp.reachedAfterDefer.length}), still-held ${pp.stillHeld.length}${ppBits ? ` (${ppBits})` : ''}`)
    }
  }
  const uv = upgradeVerdicts(lines)
  if (uv && (uv.ok + uv.failed + uv.commune) > 0) {
    console.log(`  upgrade verdicts (v0.468.0): ok ${uv.ok} (tier ${uv.tier}, worn ${uv.worn}${uv.maxWear !== null ? `, closest left=${uv.maxWear}` : ''}, noop ${uv.noop}), failed ${uv.failed}, commune ${uv.commune} - the counter-vs-words window: the words cover the tier class, the worn and noop crafts stay the counter's own`)
  }
  // (v0.469.0) THE COUNTER-WORDS GAP - the same window closed from the
  // tally side (SLOT COLLISION #5: the 0.468.0 verdict census named the
  // worn class live mid-fire; this lens was built from the same code-read
  // in the same hour - THE CONVERGENCE, cross-validated). The counter
  // counts up.ok at BOTH call sites; the words only land on the delegated
  // rung - the local path (the iron tier raise, the worn replacement)
  // returns ok and prints '<target>: crafted' but never the census words.
  // The lens owns the tally line (unowned until now) and joins: gap =
  // tally - words; the named windows subtract (the local verdicts'
  // crafted = the counter-only surplus, the '[upgrade] failed:' words =
  // the deficit); the residual is the honest unnamed remainder - read,
  // never guessed. No tally line reads gap null honestly (truncated log).
  const cg = counterGap(lines)
  if (cg && (cg.tally !== null || cg.words > 0 || cg.pathBCrafted > 0 || cg.pathBFailed > 0 || cg.pathAFailed > 0)) {
    console.log(`  counter vs words (v0.469.0): tally ${cg.tally ?? 'none'}, words ${cg.words}, gap ${cg.gap ?? 'none'} (local crafted ${cg.pathBCrafted}, local failed ${cg.pathBFailed}, rung failed-words ${cg.pathAFailed}, residual ${cg.residual ?? 'none'})`)
  }
  // (v0.474.0) THE WORDS-VERDICT JOIN - the residual's name. The 7 in-repo
  // logs read residual 0; the FIRST LIVE face (43) broke the law: tally 13,
  // words 14, residual -1 - the raw log names the units: F13's rung printed
  // the partial kit list on a storm-refused attempt (the word is an ATTEMPT
  // line, the verdict is the truth), F9's two no-table-material failures
  // printed no word at all (the silent class). The join pairs each bot's
  // words with its verdicts in file order and names every unit; the book:
  // gap = okSilent - wordedNotOk - unpairedWords.
  const uj = upgradeJoin(lines)
  if (uj && uj.attempts + uj.words > 0) {
    console.log(`  words-verdict join (v0.474.0): attempts ${uj.attempts} (ok ${uj.ok}, failed ${uj.failed}, commune ${uj.commune}) vs words ${uj.words} -> okWorded ${uj.okWorded}, wordedNotOk ${uj.wordedNotOk} (${uj.wordedFailedBots.join(',') || 'none'}), verdictNotWorded ${uj.verdictNotWorded} (${uj.silentBots.join(',') || 'none'}), unpaired ${uj.unpairedWords} - THE BOOK: gap = okSilent ${uj.ok - uj.okWorded} - wordedNotOk ${uj.wordedNotOk} - unpaired ${uj.unpairedWords}`)
  }
  // (v0.470.0) THE VERDICT SPREAD - the verdict census's per-bot half: does
  // the worn class ride ONE bot (a local hazard or a dig-style signature)
  // or spread across the lane? The closest call NAMES its bot (first
  // occurrence wins ties, the line-order law). Zero verdicts read zero
  // honestly (the row stays silent - no lane, no spread).
  const vs = verdictSpread(lines)
  if (vs && vs.bots > 0) {
    const wornBits = vs.wornBots.join(' ')
    console.log(`  verdict spread (v0.470.0): ${vs.bots} bot(s) on the lane, worn ${vs.wornBots.length}${wornBits ? ` (${wornBits})` : ''}${vs.maxWearBot ? `, the closest call ${vs.maxWearBot} at left=${vs.maxWear}` : ''}`)
  }
  // (v0.478.0) THE STORM LEDGER - the craft storm's transient/terminal
  // split: each refusal episode resolves by the bot's next verdict -
  // recovered (a craft landed later - the brake released), terminal (the
  // verdict read failed), commune, unanswered (the face ended inside the
  // window). The skins census rides it (the three caller skins, one
  // emitter - the v0.478.0 undercount fix's proof on live data).
  const stormLed = stormRefusalLedger(lines)
  if (stormLed && stormLed.refusals > 0) {
    const rows = stormLed.rows.map((r) => `${r.bot} ${r.items.join('+')} x${r.refusals} (max ${r.maxWaitMs}ms, c${r.maxConsecutive}) -> ${r.class}`).join('; ')
    console.log(`  storm ledger (v0.478.0): refusals ${stormLed.refusals} on ${stormLed.refusalBots.length} bot(s) (${stormLed.refusalBots.join(',')}), episodes ${stormLed.episodes} - recovered ${stormLed.byClass.recovered}, terminal ${stormLed.byClass.terminal}, commune ${stormLed.byClass.commune}, unanswered ${stormLed.byClass.unanswered}, max cooldown-left ${stormLed.maxWaitMs}ms at c${stormLed.maxConsecutive}, skins u${stormLed.skins.upgrade}/t${stormLed.skins.tagged}/p${stormLed.skins.plain}/o${stormLed.skins.other} - ${rows}`)
  }
}

// (v0.450.0) THE TRIP VOICE ROSTER - who launches, who refuses. The
// shaft-locked 8 stayed the SAME NUMBER across faces 31 -> 33 while the
// aggregate never named WHO the shaft gate held. The roster per bot (the
// census's own byBotWhy split): the voice class (launcher / mixed /
// skip-only), the skip reasons inline; the shaftRoster is the plan-side
// cure's fuel - a small stable cast prices the surface-only assignment,
// a rotating cast prices nothing.
{
  const v = tripVoice(mapTripCensus(lines))
  if (v) {
    console.log('--- TRIP VOICE ROSTER (v0.450.0: who launches, who refuses - the shaft-lock cast) ---')
    for (const r of v.roster) {
      const whys = r.skips ? Object.entries(r.byWhy).map(([k, n]) => `${k} ${n}`).join(', ') : ''
      console.log(`  ${r.bot}: launches ${r.launches}, skips ${r.skips}${whys ? ` (${whys})` : ''} - ${r.voice}`)
    }
    console.log(`  shaft-lock cast: ${v.shaftRoster.length ? `${v.shaftRoster.join(' ')} (${v.shaftRoster.length} bot(s) the shaft gate held)` : 'none - the underground economy took no trip tax this face'}`)
  }
}

// (v0.687.0) THE FAMINE CENSUS - the trip's own starvation anatomy. The
// fleet's famine byte rode every face; this lens prices WHICH SLOT
// starves: the wood line's own chain read (logs 0 = the gather leg,
// sticks 0 = the conversion leg) and the food line's plate read (hunger
// + plate 0 = the bot carried no food at all).
{
  const fc = famineCensus(lines)
  if (fc.wood.n > 0 || fc.food.n > 0) {
    console.log('--- FAMINE CENSUS (v0.687.0: the trip\'s own starvation anatomy) ---')
    if (fc.wood.n > 0) {
      const bots = Object.entries(fc.wood.byBot).map(([b, n]) => `${b}=${n}`).join(' ')
      console.log(`  wood famines: ${fc.wood.n} per-bot: ${bots} - the starved slot: logs ${fc.wood.slots.logsZero}/${fc.wood.n}${fc.wood.slots.logsZero === fc.wood.n ? ' (THE GATHER DROUGHT: the head starved every time)' : ''}, planks ${fc.wood.slots.planksZero}/${fc.wood.n}, sticks ${fc.wood.slots.sticksZero}/${fc.wood.n}`)
      // (v0.699.0) THE DOWNSTREAM SEAT - the unanimity break named: the
      // famine that held logs > 0 starved BELOW the head (the walk brought
      // wood home, the conversion leg starved). The head-unanimous face
      // rides the honest silence (the drought needs no name).
      if (fc.wood.slots.down.length > 0) {
        const ds = fc.wood.slots.down.map((d) => `${d.bot} (sticks ${d.sticks} planks ${d.planks} logs ${d.logs})`).join('; ')
        console.log(`  the downstream seat: ${ds} - the walk brought wood home, the starve sat below the head (the conversion leg, not the drought)`)
      }
      if (fc.wood.repeats.n > 0) {
        const rb = Object.entries(fc.wood.repeats.byBot).map(([b, n]) => `${b}=${n}`).join(' ')
        const sp = fc.wood.repeats.span
        console.log(`  wood repeats: ${fc.wood.repeats.n} (${rb}) - the gather walk between famines delivered nothing (span ${sp.min}..${sp.max} lines${sp.min === sp.max ? '' : `, median ${sp.median}`}) - THE DROUGHT'S PERSISTENCE`)
      }
    }
    if (fc.food.n > 0) {
      const bots = Object.entries(fc.food.byBot).map(([b, n]) => `${b}=${n}`).join(' ')
      const h = fc.food.hunger
      console.log(`  food famines: ${fc.food.n} per-bot: ${bots} - hunger at famine: min ${h.min} median ${h.median} max ${h.max} (plate 0: ${fc.food.plateZero}/${fc.food.n})`)
      if (fc.food.repeats.n > 0) {
        const rb = Object.entries(fc.food.repeats.byBot).map(([b, n]) => `${b}=${n}`).join(' ')
        const sp = fc.food.repeats.span
        console.log(`  food repeats: ${fc.food.repeats.n} (${rb}) - the commons walk between famines fed nothing (span ${sp.min}..${sp.max} lines${sp.min === sp.max ? '' : `, median ${sp.median}`})`)
      }
    }
  }
}

// (v0.690.0) THE WALK'S DELIVERY - the gather drought's cure input. The
// famine→gathered pairing prices the walk itself: cured = the walk brought
// wood home, flat = the pocket didn't move (THE DROUGHT'S SEAT rides the
// walk), negative = the trip ate its own cure. (v0.693.0) THE WALK'S COST
// rides the same block: the face-line span per paired trip (SLOT COLLISION
// #17: 0.692.0 taken by the lane's THE LOOP LEDGER mid-fire).
{
  const tc = woodTripCensus(lines)
  if (tc.gathered.n > 0 || tc.refused.n > 0 || tc.deferred.n > 0) {
    console.log(`  wood trip outcomes: gathered ${tc.gathered.n} refused ${tc.refused.n} deferred ${tc.deferred.n} orphans ${tc.orphans.n} (the famine's own answers)`)
    if (tc.deferred.n > 0) {
      // (v0.696.0) THE DAWN'S DEBT - the deferral's own anatomy: who deferred,
      // at what tod, and whether the same bot's next famine kept the promise
      const db = Object.entries(tc.deferred.byBot).map(([b, n]) => `${b}=${n}`).join(' ')
      const t = tc.deferred.tods
      console.log(`  the dawn's debt: ${tc.deferred.n} deferred night(s) (${db}) - tod ${t.min}..${t.max}${t.min === t.max ? '' : `, median ${t.median}`} - kept ${tc.deferred.debts.kept} open ${tc.deferred.debts.open} (the dawn's own promise)`)

    }
    if (tc.delivery.n > 0) {
      const g = tc.delivery.gain
      console.log(`  the gather walk's delivery: ${tc.delivery.cured}/${tc.delivery.n} trips cured (gain ${g.min}..${g.max}${g.min === g.max ? '' : `, median ${g.median}`}) flat ${tc.delivery.flat} negative ${tc.delivery.negative}${tc.delivery.flat > 0 ? ' - THE WALK CAME HOME EMPTY: the drought\'s seat rides the walk' : ''}`)
      const sp = tc.delivery.span
      const seg = []
      if (sp.cured) seg.push(`cured ${sp.cured.min}..${sp.cured.max}`)
      if (sp.flat) seg.push(`flat ${sp.flat.min}..${sp.flat.max}`)
      if (sp.negative) seg.push(`negative ${sp.negative.min}..${sp.negative.max}`)
      if (seg.length) console.log(`  the walk's cost: ${seg.join(', ')} lines per trip${sp.flat ? ' - THE FLAT WALK\'S TOLL: the walk that delivered nothing still burned its segment' : ''}`)
    }
  }
  // (v0.694.0) THE CLIMB'S PRICE - the flat walk's anatomy: the trip's
  // REAL rent (+levels/steps/dug/seconds from the climb-out OK line inside
  // the famine→gathered window), filed under the delivery class. If the
  // climb doesn't split the classes, the flat walk's toll is NOT the climb.
  const cc = woodClimbCost(lines)
  if (cc && (cc.climbed > 0 || cc.noClimb > 0)) {
    const seg = []
    for (const cls of ['cured', 'flat', 'negative']) {
      const c = cc.byClass[cls]
      // (v0.697.0) the stairs' tax rides the rent: seconds per level
      if (c) seg.push(`${cls} ${c.n}: ${c.seconds.min}..${c.seconds.max}s (median ${c.seconds.median}) +${c.levels.min}..${c.levels.max} lv (tax ${c.rate.min.toFixed(2)}..${c.rate.max.toFixed(2)} s/lv)`)
    }
    if (seg.length) {
      const f = cc.byClass.flat
      const c = cc.byClass.cured
      const fork = f && c && f.seconds.median > c.seconds.median
        ? ' - THE FLAT WALK\'S RENT IS THE CLIMB ITSELF'
        : (f && c ? ' - THE CLIMB DOESN\'T SPLIT THE CLASSES: the flat walk\'s toll is not the climb' : '')
      const nc = cc.noClimb > 0 ? ` (noClimb ${cc.noClimb}: the zero-rent walk${cc.byClass.cured ? ' - the cure that never paid the stairs' : ''})` : ''
      console.log(`  the climb's price: ${cc.trips} trip(s) closed, ${cc.climbed} climbed - ${seg.join(', ')}${fork}${nc}`)
    }
  }
}

// (v0.691.0) THE REFUSAL'S WHY - the climb-refusal seat's own anatomy.
// The refusal line names no cause; the cause rides the climb-fail line
// ONE line earlier (the 1:1 shape). The join prices WHY the walk's start
// is the seat (the face-28 read: 4 refusals, F1 owned 3).
{
  const rc = woodRefusalCensus(lines)
  if (rc.refused.n > 0) {
    const bots = Object.entries(rc.refused.byBot).map(([b, n]) => `${b}=${n}`).join(' ')
    const whys = Object.entries(rc.refused.reasons).map(([w, n]) => `${w} ${n}`).join(' / ')
    console.log(`  the climb-refusal seat: ${rc.refused.n} refusals (${bots}) - ${whys} (unexplained ${rc.refused.unexplained}) - THE WALK'S START IS THE SEAT`)
  } else if (rc.climbFails.n > 0) {
    const whys = Object.entries(rc.climbFails.reasons).map(([w, n]) => `${w} ${n}`).join(' / ')
    console.log(`  the climb-refusal seat: 0 refusals (${rc.climbFails.n} wood-trip climb fails: ${whys} - the log cut mid-pair or the refusal path skipped)`)
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
    // (v0.421.0) THE HOT-SPOT BAND - the neighbors merge: spots within
    // HOT_SPOT_BAND_RADIUS (manhattan, 4) collapse into strips. A cross-lane
    // BAND is the geometry problem's own shape: the same ground starving
    // multiple walkers across ADJACENT chests (face 27 read [-121,389]
    // hop-only beside cross-lane [-122,389] - the point rows split what the
    // strip unites).
    const bd = hotspotBands(hs.spots)
    if (bd.bands.length > 0) {
      console.log(`  bands (radius ${bd.radius} manhattan): ${bd.bands.length} band(s) holding ${bd.bandTotal} failure(s) across ${bd.bandSpots} spot(s), ${bd.singleSpots} single spot(s)`)
      for (const b of bd.bands.slice(0, 3)) {
        const lanes = Object.entries(b.byLane).map(([k, n]) => `${k}:${n}`).join(' ')
        const whys = Object.entries(b.byWhy).map(([k, n]) => `${k}:${n}`).join(' ')
        const bots = Object.keys(b.bots).join('+')
        console.log(`  band [${b.spots.join(' + ')}] x${b.total} (${lanes}) (${whys}) bots ${bots}${b.crossLane ? " - THE BAND SIGNATURE: the strip starves multiple walkers" : ""}`)
      }
      if (bd.bands.length > 3) console.log(`  ... ${bd.bands.length - 3} more band(s) - the tail stays in the lib's row`)
    }
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
// (v0.496.0) THE BRIDGE BOOK - the vertical walk's fill lane (the climb
// census read the climb-out verdicts; the bridge's own three skins rode
// unread: the plan's refusals - pocket vs floor, the WHY-FLIP between
// faces - the fills that landed, and the server's own veto with its
// stale world-read and the post-veto blind leg). The cobble signature:
// the fleet bridges on cobblestone - the surplus lane's biggest vertical
// consumer. Honest cap: the emitter speaks below diagLevels<3 only.
{
  const bb = bridgeBook(lines)
  if (bb && bb.events > 0) {
    console.log(`--- BRIDGE BOOK (v0.496.0: the vertical walk's fill lane) ---`)
    console.log(`  events: ${bb.events} - unavailable ${bb.unavailable} / placed ${bb.placed} / server-refused ${bb.serverRefused} - book ${bb.events}/${bb.events}`)
    const whys = Object.entries(bb.whyClasses).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ')
    if (whys) console.log(`  the refusals' why: ${whys}${bb.whyClasses.pocket && bb.whyClasses.floor ? ' - the why must be read on BOTH faces (the flip is real)' : ''}`)
    const mats = Object.entries(bb.placedBlocks).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ')
    if (mats) console.log(`  the material read: ${mats}${bb.placedBlocks.cobblestone && Math.round((bb.placedBlocks.cobblestone / bb.placed) * 100) >= 90 ? ' - THE COBBLE SIGNATURE: the surplus lane owns the vertical walk' : ''}`)
    if (bb.serverRefused > 0) {
      const kinds = Object.entries(bb.refusedKinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ')
      const refs = Object.entries(bb.refusedRefs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}:${n}`).join(' ')
      console.log(`  the server's own veto: ${bb.serverRefused} (kinds ${kinds}) - the stale world-read: ${refs}${bb.refusedRefs.crafting_table ? ' - THE TABLE VETO: the plan filled into its own table\'s cell' : ''}`)
      console.log(`  the blind leg: post-veto re-read failed ${bb.postReadFailed}/${bb.serverRefused}${bb.postReadFailed === bb.serverRefused ? ' - what the cell became is NEVER known at this n' : ''}`)
    }
    const top = bb.rows.slice(0, 3).map(r => `${r.bot} ${r.unavailable + r.placed + r.serverRefused} (un ${r.unavailable}/pl ${r.placed}/veto ${r.serverRefused})`).join(', ')
    if (top) console.log(`  the burners: ${top}`)
  }
}
// (v0.665.0) THE CLIMB BRIDGE'S FIELD READ - the refusal book's own grains the
// BRIDGE BOOK never saw: the underfoot gate's waited-grounded forms, the pit
// donor, the plant clear and the shadow gate's defers (the v0.621.0-0.628.0
// census rode complete with its row builder and ZERO importers - the
// fire-1530 survey: 140 bridge lines on face 37273689240, 64 invisible:
// gate x25 + plant-clear x20 + defers x19). The row is the module's own
// verdict shape (the always-print law inside its own block); a face with no
// bridge voice prints nothing here (the byte-stable silence).
{
  const brc = bridgeRefusalCensus(lines)
  if (brc && (brc.n > 0 || brc.places > 0 || brc.refused > 0 || brc.gates > 0 || brc.pitDonated > 0 || brc.pitDonorRefused > 0 || brc.plantCleared > 0 || brc.plantClearRefused > 0 || brc.defers > 0 || brc.unparsed > 0 || brc.refusedTorn > 0)) {
    console.log('--- CLIMB BRIDGE FIELD READ (v0.665.0: the refusal book\'s own grains) ---')
    console.log(`  ${bridgeRefusalRow(brc)}`)
  }
}

// (v0.422.0) THE SENTRY LENS - the drowning sentry's per-pass read: the
// water family was the largest unread block in the field (331 pass lines
// across face 26/27) while every walk/hop/bank/drop lane got its lens. The
// pass line carries the sentry's own sight: head, the shore scan, the map's
// land bearing, the air bar, the planar spot.
{
  const sc = sentryCensus(lines)
  if (sc.passes > 0 || sc.unparsed > 0) {
    console.log('--- SENTRY CENSUS (v0.422.0: the drowning sentry\'s per-pass read) ---')
    const bots = Object.entries(sc.byBot).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ')
    console.log(`  passes: ${sc.passes} (episodes ${sc.episodes}, passMax ${sc.passMax})${bots ? `, top bots: ${bots}` : ''}`)
    console.log(`  head: dry ${sc.byHead.dry} / wet ${sc.byHead.wet} - shore: hit ${sc.shore.hit}${sc.shore.r.n > 0 ? ` (r max ${sc.shore.r.max}, avg ${(sc.shore.r.sum / sc.shore.r.n).toFixed(1)})` : ''} / none ${sc.shore.none}`)
    const led = Object.entries(sc.land.byLand).map(([k, n]) => `${k}:${n}`).join(' ')
    console.log(`  sight: hit ${sc.sight.hit}, ledgered ${sc.sight.ledgered}${led ? ` (${led})` : ''}, blind ${sc.sight.blind}${sc.sight.blind > 0 ? ' - THE GROUND-TRUTH CLASS: the pass never saw shore or land' : ''}`)
    const o2avg = sc.o2.n > 0 ? (sc.o2.sum / sc.o2.n).toFixed(1) : 'n/a'
    console.log(`  o2: min ${sc.o2.min}, avg ${o2avg}, at20 ${sc.o2.at20}, at0 ${sc.o2.at0}, critical(<=4) ${sc.o2.critical}, rescueBand(<=10) ${sc.o2.rescueBand}${sc.o2.reset > 0 || sc.o2.unknown > 0 ? `, reset ${sc.o2.reset}, unknown ${sc.o2.unknown}` : ''}`)
    for (const sp of sc.spots.slice(0, 5)) {
      const botsRow = Object.keys(sp.bots).join('+')
      console.log(`  spot [${sp.key}]${sp.y !== null ? ` y=${sp.y}` : ''} x${sp.total} bots ${botsRow}`)
    }
    if (sc.spots.length > 5) console.log(`  ... ${sc.spots.length - 5} more spot(s) - the tail stays in the lib's row`)
    if (sc.unparsed > 0) console.log(`  unparsed: ${sc.unparsed} pass-shaped line(s) the grammar refused - the escape hatch`)
  }
}

// (v0.426.0) THE FROZEN CENSUS - the freeze family's own read (the F10
// frozen-while-head-wet class's measurement leg). The raw counters in the
// FROZEN-RELOG LOOP block above stay (they count); this census SPLITS:
// the wet/dry verdict split (the F10 class vs the bob/apex class), the o2
// arc at the freeze, the relog why split (the head-wet saver vs the legacy
// threshold), the holds vs the bypasses (the gate's promise met or voided),
// the loop breaks (the grace working), the apex-rest exemption's share.
{
  const fc = frozenCensus(lines)
  const any = fc.verdicts.n + fc.relogs.n + fc.loopBreaks.n + fc.freezeNamed.n + fc.gateHolds + fc.gateBypassed.n + fc.gateClears.n + fc.apexRests.n + fc.dupKicks.n + fc.unparsed
  if (any > 0) {
    console.log('--- FROZEN CENSUS (v0.426.0: the freeze family\'s field read) ---')
    const vb = Object.entries(fc.verdicts.byBot).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ')
    const vo2 = fc.verdicts.o2
    console.log(`  verdicts: ${fc.verdicts.n} (wet ${fc.verdicts.wet} / dry ${fc.verdicts.dry}${fc.verdicts.fastWindow > 0 ? `, fast-window ${fc.verdicts.fastWindow}` : ''})${vb ? `, top bots: ${vb}` : ''}`)
    console.log(`  freeze o2: ${vo2.n > 0 ? `min ${vo2.min}, avg ${vo2.avg.toFixed(1)} over ${vo2.n}` : 'no domain value'}${vo2.reset > 0 ? `, reset ${vo2.reset}` : ''}${vo2.unknown > 0 ? `, unknown ${vo2.unknown}` : ''}; y span ${fc.verdicts.yMin}..${fc.verdicts.yMax}`)
    const rl = fc.relogs
    const rlBots = Object.entries(rl.byBot).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ')
    console.log(`  relogs: ${rl.n} (head-wet saver ${rl.why.headWet}, legacy threshold ${rl.why.legacy}; era current ${rl.era.current} / legacy ${rl.era.legacy})${rl.streakMax !== null ? `, streak max #${rl.streakMax}` : ''}${rlBots ? `, top bots: ${rlBots}` : ''}`)
    if (rl.era.current > 0) {
      console.log(`  gate: holds ${rl.holds.n}${rl.holds.n > 0 ? ` (${rl.holds.min}..${rl.holds.max}s armed)` : ''}, bypasses ${rl.bypass.critical + rl.bypass.wetCycler} (critical ${rl.bypass.critical}, wet-cycler ${rl.bypass.wetCycler})${rl.holds.n > 0 && rl.bypass.critical + rl.bypass.wetCycler === 0 ? ' - the promise LIVES: a hold armed and no echo voided it' : ''}${rl.bypass.critical + rl.bypass.wetCycler > 0 ? ' - THE LOOP FUEL: every void is a relog that fed the column' : ''}`)
    }
    if (fc.loopBreaks.n > 0) console.log(`  loop breaks (the grace): ${fc.loopBreaks.n} (critical-lungs ${fc.loopBreaks.why.criticalLungs}, loop-cap ${fc.loopBreaks.why.loopCap})`)
    if (fc.freezeNamed.n > 0) {
      const cls = Object.entries(fc.freezeNamed.byCls).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ')
      console.log(`  freeze named: ${fc.freezeNamed.n} (${cls})`)
    }
    if (fc.gateHolds > 0) console.log(`  gate holds the page: ${fc.gateHolds}`)
    if (fc.gateBypassed.n > 0 || fc.gateClears.n > 0) {
      const gbLo = fc.gateBypassed.o2.min !== null ? String(fc.gateBypassed.o2.min) : '?'
      const gbHi = fc.gateBypassed.o2.max !== null ? String(fc.gateBypassed.o2.max) : '?'
      const gbTail = fc.gateBypassed.n > 0
        ? ` (o2 at arrival ${gbLo}..${gbHi}${fc.gateBypassed.o2.unknown > 0 ? `, unknown ${fc.gateBypassed.o2.unknown}` : ''}${fc.gateBypassed.streakMax !== null ? `, streak max #${fc.gateBypassed.streakMax}` : ''})`
        : ''
      console.log(`  gate endings: bypassed ${fc.gateBypassed.n}${gbTail}, clears ${fc.gateClears.n}${fc.gatePromise ? ` - the promise kept ${fc.gatePromise.kept}/${fc.gatePromise.total} (${fc.gatePromise.pct}%)` : ''} - the hold's promise priced at arrival`)
    }
    if (fc.apexRests.n > 0) {
      const ab = Object.entries(fc.apexRests.byBot).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ')
      console.log(`  apex rests (the exemption): ${fc.apexRests.n}${ab ? `, top bots: ${ab}` : ''}`)
    }
    if (fc.dupKicks.n > 0) {
      const kb = Object.entries(fc.dupKicks.byBot).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ')
      console.log(`  duplicate-login kicks (the relog churn): ${fc.dupKicks.n}${kb ? `, top bots: ${kb}` : ''}`)
    }
    if (fc.unparsed > 0) console.log(`  unparsed: ${fc.unparsed} freeze-lane line(s) the grammar refused - the escape hatch`)
  }
}

// (v0.427.0) THE TRANSIT CENSUS - the rescue swim's launch lane (the water
// family's next unread block). The launch names the map's shore, the
// planar target and the distance; the stall names the walls verdict. The
// pinned-seat read: a target hit by ONE bot many times is the walls class
// (the release lane's geometry), by MANY bots the map's concentration.
{
  const tc = transitCensus(lines)
  if (tc.launches.n > 0 || tc.stalls.n > 0 || tc.unparsed > 0) {
    console.log('--- TRANSIT CENSUS (v0.427.0: the rescue swim\'s launch lane) ---')
    const lb = Object.entries(tc.launches.byBot).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ')
    const ll = Object.entries(tc.launches.byLand).map(([k, n]) => `${k}:${n}`).join(' ')
    const d = tc.launches.dist
    console.log(`  launches: ${tc.launches.n}${ll ? `, land: ${ll}` : ''}${d.n > 0 ? `, d ${d.min}..${d.max} (avg ${(d.sum / d.n).toFixed(1)})` : ''}${lb ? `, top bots: ${lb}` : ''}`)
    for (const t of tc.targets.slice(0, 5)) {
      const botsRow = Object.entries(t.bots).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('+')
      // (v0.446.0) THE LAUNCH CADENCE VERDICT - the repeats alone say nothing:
      // face 32's F19 x32 at [-78,375] read d 46..16 (the honest APPROACH,
      // 65% closed) while face 30's F8 x26 at [-143,430] sat ALL at d=11
      // (the true WALLS). The label now carries the d-progression truth:
      // flat (closed < 50%) stays the pinned seat, a descending sequence is
      // named the approach it is. Thin evidence (multi-bot, short runs,
      // junk) reads no label - the legacy silence, never a fake verdict.
      const cad = targetCadence(t)
      const cadence = !cad
        ? ''
        : cad.verdict === 'approach'
          ? ` - THE APPROACH (d ${cad.max}..${cad.min}, closed ${cad.closed}% - the repeats earned their keep)`
          : ` - THE PINNED SEAT (the walls class - d flat ${cad.max}..${cad.min})`
      console.log(`  target [${t.x},${t.z}] (${t.land}) x${t.total} bots ${botsRow}${cadence}`)
    }
    if (tc.targets.length > 5) console.log(`  ... ${tc.targets.length - 5} more target(s) - the tail stays in the lib's row`)
    if (tc.stalls.n > 0) {
      const sb = Object.entries(tc.stalls.byBot).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ')
      console.log(`  stalls (the walls verdict): ${tc.stalls.n}${sb ? `, top bots: ${sb}` : ''}, d-at-stall max ${tc.stalls.distMax}, passes-to-stall max ${tc.stalls.passesMax}`)
      // (v0.435.0) THE STALL DEPTH SPLIT - where it died vs how far it swam.
      console.log(`  stall split: pocket(d<=${TRANSIT_POCKET_DEPTH}) ${tc.stalls.pocketN} vs route ${tc.stalls.routeN}${tc.stalls.unpairedN > 0 ? `, unpaired ${tc.stalls.unpairedN}` : ''}`)
      const pr = tc.stalls.pairs
      if (pr.n > 0) {
        console.log(`  ground gained (launch d - stall d): ${pr.n} paired, ${pr.gainedMin}..${pr.gainedMax} (avg ${(pr.gainedSum / pr.n).toFixed(1)}) - toTheLip ${pr.toTheLipN} vs early ${pr.earlyN}`)
      }
    }
    if (tc.unparsed > 0) console.log(`  unparsed: ${tc.unparsed} transit-lane line(s) the grammar refused - the escape hatch`)
  }
}

// (v0.443.0) THE RE-ARM BRAKE CENSUS - the zero-gain loop's cross-episode
// gate's own family row (the water-cure brief's stage (b) field verdict).
// The brake line speaks when the ledger refused a same-target re-arm (the
// loop the three held faces paid for: face 27's F1 x73, face 29's two
// pinned seats, face 30's F8 x26 at zero ground gained). n=0 on a face with
// launches+stalls = the brake never armed (no same-target re-arm happened);
// n>0 = the brake owns the loop (the ages are the cooldown's field window).
{
  const rc = rearmCensus(lines)
  if (rc.brakes.n > 0 || rc.unparsed > 0) {
    console.log(`  re-arm brakes (v0.443.0): ${rc.brakes.n} refused same-target re-arm(s)${rc.brakes.age.n > 0 ? `, age ${rc.brakes.age.min}..${rc.brakes.age.max}s (avg ${(rc.brakes.age.sum / rc.brakes.age.n).toFixed(1)}s)` : ''}`)
    for (const t of rc.targets.slice(0, 3)) {
      const botsRow = Object.entries(t.bots).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('+')
      console.log(`    braked target [${t.x},${t.z}] (${t.land}) x${t.total} bots ${botsRow}`)
    }
    if (rc.unparsed > 0) console.log(`    unparsed: ${rc.unparsed} re-arm-lane line(s) the grammar refused - the escape hatch`)
  }
}

// (v0.692.0) THE LOOP LEDGER - the per-bot swim loop's own account: the
// launches spent, the stalls paid, the brakes eaten, the ground gained
// across the paired stalls - and THE WHALE verdict for the zero-yield
// loop (>= 50 launches, every paired stall gained <= 0). The 24th's F12
// spent 152 launches across 4 targets while the cadence row said 'the
// repeats earned their keep' (d 6..3, closed 50%) and the gain row said
// 0..0 - both true, never reconciled; the ledger names the contradiction:
// the progress rode the re-arms, the swims bought nothing. The silence
// law: no whale, no row (the face's smaller loops stay data, never
// verdicts).
{
  const loop = transitLoopLedger(lines)
  if (loop && loop.whale) {
    const w = loop.whale
    const tt = w.topTarget ? ` (top ${w.topTarget.key} x${w.topTarget.n})` : ''
    const gg = w.gains ? `, stall gains ${w.gains.min}..${w.gains.max} (${w.gains.n} paired, avg ${(w.gains.sum / w.gains.n).toFixed(1)})` : ''
    console.log(`  loop ledger (v0.692.0): ${w.bot} spent ${w.launches} launch(es) across ${w.targets} target(s)${tt} - ${w.stalls} stall(s), ${w.brakes} brake(s)${gg} - THE WHALE'S LEDGER: the loop bought no ground`)
    // (v0.698.0) THE WHALE'S WATER BILL - the zero-gain loop's rescue-side
    // account: does the whale own the face's rescue lane too? Rank 1 = the
    // face's TOP rescue spender; null = the dry whale (the loop bought no
    // ground and never called the rescue). No whale, no row (inherited).
    const bill = whaleWaterBill(lines)
    if (bill && bill.bill) {
      const b = bill.bill
      if (b.rank !== null) {
        const top = b.rank === 1 ? 'TOP customer' : `rank-${b.rank} customer`
        console.log(`  the whale's water bill (v0.698.0): ${b.bot}'s ${b.launches}-launch loop rode ${b.starts} rescue start(s) (rank ${b.rank} of ${b.spenders} spender(s)) - the zero-gain loop and the rescue lane's ${top} are one bot`)
      } else {
        console.log(`  the whale's water bill (v0.698.0): ${b.bot}'s ${b.launches}-launch loop rode 0 rescue start(s) - THE DRY WHALE (the loop bought no ground and never called the rescue)`)
      }
    }
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
    // (v0.677.0) THE RSS JUMP - the storm between the gauges: the sharpest
    // gauge-to-gauge climb priced, the freeze-storm FATAL's own numbers
    // joined beside it. The 20th flight (37409860732) read flat gauges and
    // died between them - the gauges' honest flat PLUS the FATAL's +827M
    // IS the storm's shape (neither row alone convicts the face).
    const rj = mem.rssJump
    const rjRow = `  rss jump: max +${rj.max}M/gauge${rj.storms > 0 ? ` - STORM x${rj.storms} (>= ${RSS_JUMP_STORM_M}M/gauge)` : ''}`
    const fsNote = mem.freezeStorm
      ? `; the FATAL saw +${mem.freezeStorm.to - mem.freezeStorm.from}M while frozen ${mem.freezeStorm.frozenS}s (past the ${mem.freezeStorm.floor}M floor - the storm lived between the gauges)`
      : ''
    console.log(rjRow + fsNote)
    // (v0.683.0) THE STORM MARGIN - the near-miss read beside the storm
    // read: the headroom the face's sharpest climb left below the storm
    // line. The 24th flight (37421661533) read max +80M of the 100M line -
    // 20M of headroom - while the 20th flight's killer storm lived
    // ENTIRELY between the gauges. The margin is the cadence's own blind
    // spot, not safety; the near-miss class only prints (a storm face is
    // convicted by the STORM row; a climbless face has no margin story).
    if (rj.marginM !== null) {
      console.log(`  storm margin: ${rj.marginM}M of headroom (max +${rj.max}M of the ${RSS_JUMP_STORM_M}M storm line) - the gap is the cadence's own blind spot (the 20th's storm lived between the gauges)`)
    }
    // (v0.678.0) THE ENTITY CLIMB - the driver read beside the storm read:
    // the 20th flight's ents climbed 2023 -> 2691 (+30%) while rss stayed
    // flat - the mob storm's entities PRECEDED the memory storm the FATAL
    // named. The sharpest gauge-to-gauge climb prices the population
    // pressure on every face; the driver class is the >= threshold count.
    const ej = mem.entJump
    console.log(`  ents jump: max +${ej.max}/gauge${ej.storms > 0 ? ` - DRIVER x${ej.storms} (>= ${ENT_JUMP_STORM_N}/gauge) - the entity climb is the memory storm's candidate driver` : ''}`)
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

// (v0.490.0) THE SMELT VERDICT - the furnace's own report card. The
// smelt ledger (v0.461.0) counts the intent side (batches, clips,
// refusals); the verdict line - 'F17 smelted 2 (stone:2) rescued=0' /
// 'F4 smelted 0 () rescued=0 fired=2' - is the yield side nobody read.
// The verdict closes all of the bot's open batches; the batches' own
// clip lines price the FORECAST (the emitter fuels exactly min(fuel,
// clock) - its own arithmetic, verbatim in the start line) and the
// verdict grades it. The one miss class is the IN-FLIGHT batch: no
// clip lines (a clip prints only when something completed), the clock
// killed it after fueling, the fired tail is the only trace.
{
  const sv = smeltVerdict(lines)
  if (sv && (sv.verdicts > 0 || sv.batches > 0)) {
    console.log(`--- SMELT VERDICT (v0.490.0: the furnace's own report card) ---`)
    console.log(`  book: ${sv.verdicts} verdict(s) closing ${sv.batches} batch(es), open ${sv.openBatches}${sv.orphanClips ? `, orphan clips ${sv.orphanClips}` : ''}`)
    if (sv.verdicts > 0) {
      const forecastNote = sv.unforecast > 0 ? ` (+${sv.unforecast} unforecast - no seen start)` : ''
      console.log(`  forecast vs yield: forecast ${sv.forecastTotal} -> actual ${sv.actualTotal}${forecastNote}, exact ${sv.exact}/${sv.verdicts - sv.unforecast}`)
      console.log(`  binding (per batch): fuel ${sv.binding.fuel} / clock ${sv.binding.clock}${sv.binding.tie ? ` / tie ${sv.binding.tie}` : ''} / none ${sv.binding.none} - the min law held ${sv.minLaw.held}/${sv.minLaw.checked}`)
      for (const m of sv.misses) {
        const tail = m.fired != null ? ` - the IN-FLIGHT batch: the furnace fired ${m.fired} and the window ended first (its own fired tail)` : ''
        console.log(`    MISS ${m.bot}: forecast ${m.forecast} -> actual ${m.actual} (short ${m.miss})${tail}`)
      }
      const fuels = Object.entries(sv.fuelTable).map(([k, t]) => `${k} ${t.n}u -> ${t.completes} (${(t.completes / t.n).toFixed(2)}/u)`)
      if (fuels.length) console.log(`  fuel census (clips only): ${fuels.join(', ')}`)
      const outs = Object.entries(sv.outputs).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')
      if (outs) console.log(`  yield ledger: ${outs}, rescued ${sv.rescuedTotal}, fired tails ${sv.firedTails}`)
    }
  }
}

// (v0.491.0) THE SMELT HOLD LEDGER - the reserve decision's own fate.
// The hold line reserves a slice of the chain budget for the smelt
// leg; this row joins each hold to what the leg then did (fired with
// yield / fired-zero / refused at the furnace door / budget-died /
// unresolved) and reads the skips against the pocket coal (the floor
// doctrine's own field signature - JUNK_COAL_FLOOR imported, one
// truth).
{
  const sh = smeltHold(lines)
  if (sh && (sh.holds > 0 || sh.skips > 0 || sh.endBankStandalone > 0)) {
    console.log(`--- SMELT HOLD LEDGER (v0.491.0: the reserve decision's fate) ---`)
    console.log(`  book: ${sh.holds} hold(s) holding ${sh.holdSecs}s of ${sh.budgetSecs}s chain budget`)
    const fbits = []
    fbits.push(`fired+yield ${sh.fates.fired} (${sh.firedActualTotal}u)`)
    if (sh.fates.firedZero) fbits.push(`fired-ZERO ${sh.fates.firedZero} (the in-flight batch)`)
    fbits.push(`refused ${sh.fates.refused} (nothing ${sh.refusedWhy.nothing} / machine ${sh.refusedWhy.machine})`)
    if (sh.fates.budgetDied) fbits.push(`budget-died ${sh.fates.budgetDied}`)
    if (sh.fates.unresolved) fbits.push(`unresolved ${sh.fates.unresolved}`)
    if (sh.fallbacks) fbits.push(`fallback-noted ${sh.fallbacks} (prose never closes)`)
    console.log(`  fates: ${fbits.join(' | ')}`)
    const sbits = []
    if (sh.skipClasses['coal-0']) sbits.push(`coal-0 ${sh.skipClasses['coal-0']} (honest empty)`)
    if (sh.skipClasses['below-floor']) sbits.push(`below-floor ${sh.skipClasses['below-floor']} (the floor doctrine's signature, floor 6)`)
    if (sh.skipClasses['above-floor']) sbits.push(`ABOVE-FLOOR ${sh.skipClasses['above-floor']} (the anomaly bucket)`)
    if (sbits.length) console.log(`  skips: ${sh.skips} - ${sbits.join(' | ')}`)
    if (sh.endBankStandalone) console.log(`  end-bank deaths (no open hold): ${sh.endBankStandalone}`)
  }
}

// (v0.492.0) THE RECOVERY BOOK - the pick-less bootstrap's own report
// card. Each 'tool recovery: no pickaxe' open joins the bot's terminal
// (SPARE-OK / OK with the kit anatomy / FAILED with the why / the
// honest unresolved); the mid-fails ride between (the stick drought's
// own census - the same sticks the smelt verdict priced at 19x coal);
// the reboot chains price whether the bootstrap's re-asks ever
// recovered.
{
  const tr = toolRecovery(lines)
  if (tr && tr.episodes > 0) {
    console.log(`--- RECOVERY BOOK (v0.492.0: the pick-less bootstrap's own report card) ---`)
    const fbits = [`ok ${tr.fates.ok} (full kit ${tr.kitFull} / half kit ${tr.kitWoodenOnly})`, `failed ${tr.fates.failed} (none ${tr.failedWhy.none} / table ${tr.failedWhy.table})`]
    if (tr.fates['spare-ok']) fbits.push(`spare-ok ${tr.fates['spare-ok']} (the cheap lane landed)`)
    if (tr.fates.unresolved) fbits.push(`unresolved ${tr.fates.unresolved}`)
    console.log(`  book: ${tr.episodes} episode(s) - ${fbits.join(' | ')}`)
    const mbits = []
    if (tr.midFailClasses['stick-drought']) mbits.push(`stick-drought ${tr.midFailClasses['stick-drought']}`)
    if (tr.midFailClasses.table) mbits.push(`table ${tr.midFailClasses.table}`)
    if (tr.midFailClasses.materials) mbits.push(`materials ${tr.midFailClasses.materials}`)
    if (tr.midFailClasses.undefined) mbits.push(`UNDEFINED ${tr.midFailClasses.undefined} (the emitter's own honest gap)`)
    if (mbits.length) console.log(`  mid-fails: ${tr.midFails} - ${mbits.join(' | ')}`)
    if (tr.chains) console.log(`  reboot chains: ${tr.chains} (recovered ${tr.chainsRecovered}) - loop legs ${tr.loops} (recovered ${tr.loopRecovered} / still-failed ${tr.loopStillFailed})`)
    if (tr.prose.surfaced || tr.prose.climbRefused) console.log(`  prose legs (never close): surfaced ${tr.prose.surfaced} / climb-refused ${tr.prose.climbRefused}`)
  }
}

// (v0.711.0) THE STICK ECONOMY'S OWN BILL - one commodity, four lanes,
// one toll. The recovery's stick-drought mid-fails, the armory's
// stick-misses, the craft storm's stick refusals and the torch lane's
// stick-dry economy (the rungs + the floor skips) were each a SIDE
// cell in their own book; the gather drought kept the family hot
// three faces running. The fold names the self-rescued share (the
// rungs - the drought's answered skin) and leaves the hard core.
{
  const sb = stickBill(lines)
  if (sb) {
    const lbits = sb.lanes.map(l => `${l.lane} ${l.total}`).join(', ')
    console.log(`  the stick bill (v0.711.0): ${sb.total} stick voice(s) - ${lbits}; self-rescued ${sb.selfRescued} by the rungs (${sb.plankRungs} plank + ${sb.logsRungs} logs), the floor's skips ${sb.stickSkips}`)
  }
}

// (v0.494.0) THE ARMORY CENSUS - the weapon supply chain's own book.
// The sword + spare-pick lanes' craft verdicts and their failure
// anatomy (the table leg, the stick drought's third lane, the tier
// share) - the fight cost ledger's weapon fields rode exactly this
// supply.
{
  const ac = armoryCensus(lines)
  if (ac && ac.total > 0) {
    console.log(`--- ARMORY CENSUS (v0.494.0: the weapon supply chain's own book) ---`)
    const s = ac.sword
    const tbits = []
    for (const [tier, n] of Object.entries(s.okTiers)) tbits.push(`${tier} ${n}`)
    console.log(`  sword: armed ${s.ok} (${tbits.join(' / ')}) | failed ${s.failed} (craft-miss ${s.failedWhy['craft-miss']}${s.craftHolds ? ` (${s.craftHolds}u pocket at the misses)` : ''} / table ${s.failedWhy.table}) - stick-miss ${s.stickMisses}, table-refused ${s.tableRefusals}`)
    const sp = ac.spare
    const pbits = []
    for (const [tier, n] of Object.entries(sp.okTiers)) pbits.push(`${tier} ${n}`)
    console.log(`  spare pick: armed ${sp.ok} (${pbits.join(' / ')}) | craft-miss ${sp.craftMisses}${sp.craftHolds ? ` (${sp.craftHolds}u pocket at the misses)` : ''} - stick-miss ${sp.stickMisses}, table-refused ${sp.tableRefusals}, skips ${sp.skips} (stick-drought ${sp.skipClasses['stick-drought'] || 0} / materials ${sp.skipClasses.materials || 0} / other ${sp.skips - (sp.skipClasses['stick-drought'] || 0) - (sp.skipClasses.materials || 0)})`)
    if (s.stormRefusals || s.ingredientsRefusals || s.prose) console.log(`  legs: storm ${s.stormRefusals} / ingredients ${s.ingredientsRefusals} / prose ${s.prose}`)
  }
}

// (v0.495.0) THE TABLE GATE - the tool chain's zero-point: the
// spare-table bootstrap's own book (the droughts, the plank rung's
// rescues, the [upgrade] machinery's timeout tax). The recovery book's
// table whys and the armory's table refusals are this gate's downstream
// echoes - here is the cause side.
{
  const tg = tableGate(lines)
  if (tg && tg.totals.total > 0) {
    const t = tg.totals
    console.log(`--- TABLE GATE (v0.495.0: the tool chain's zero-point - the spare-table bootstrap's own book) ---`)
    console.log(`  gates: opened ${t.ok} / refused ${t.failed} | droughts ${t.droughts} - rescued by the plank rung ${t.rungs} (${t.rungPlanks} planks), sticks ${t.sticks} (holds ${t.stickHolds})`)
    console.log(`  timeout tax: ${t.attempts} attempts ${(t.timeoutMs / 1000).toFixed(0)}s (all-failed verdicts ${t.allFails}${t.otherAttempts ? `, other whys ${t.otherAttempts}` : ''})`)
    const refused = Object.entries(tg.bots).filter(([, b]) => b.failed > 0)
    if (refused.length) {
      console.log(`  refused: ${refused.map(([b, v]) => `${b} (rungs ${v.rungs}, sticks ${v.sticks})`).join(' / ')} - the woodless read: zero rungs, the flow terminal's 'cannot make a spare table' whys (the recovery book's table echoes)`)
    }
  }
}

// (v0.497.0) THE CAMP BUILD BOOK - where furnaces come from: the camp
// furnace ladder's own field fate (the builds vs the reuse, the
// resource floors, the plank-craft deaths). The smelt chain's yield
// side is priced - the furnace SUPPLY was the unread half.
{
  const cb = campBuild(lines)
  if (cb && cb.totals.total > 0) {
    const t = cb.totals
    console.log(`--- CAMP BUILD BOOK (v0.497.0: where furnaces come from - the camp ladder's field fate) ---`)
    console.log(`  supply: built ${t.built} (${t.buildSecs}s${t.tableFirst ? `, table-first orders ${t.tableFirst}` : ''}) vs reused ${t.reuse} - the foundry is already built`)
    console.log(`  refused: cobble-floor ${t.cobbleFloor} / plank-death ${t.plankDeath}${t.nothingToSmelt ? ` / nothing-to-smelt ${t.nothingToSmelt}` : ''}${t.otherRefusals ? ` / other ${t.otherRefusals}` : ''}${t.skipped ? ` / leg-clock-skipped ${t.skipped}` : ''}`)
    if (t.planksDecisions) console.log(`  plank death anatomy: ${t.planksDecisions} craft-planks decisions (${t.planksLogs} logs, same-type floor short ${t.sameTypeShort}) - ${t.attempts} attempts ${(t.timeoutMs / 1000).toFixed(0)}s, all-failed ${t.allFails}, craft storms ${t.storms} (${t.stormCooldownMs}ms), stale windows ${t.grid}`)
  }
}

// (v0.498.0) THE POUNCE BOOK - the well pounce's own field book: the
// decline probe's signature anatomy (the floating all-air class, the
// lawn, the canopy head-block) and the attempt verdicts (the guard's
// wet feet, the stalls). fire-0038's open window, taken.
{
  const pb = pounceBook(lines)
  if (pb && pb.totals.total > 0) {
    const t = pb.totals
    console.log(`--- POUNCE BOOK (v0.498.0: the well pounce's decline probe, the attempt verdicts) ---`)
    console.log(`  probe: signature declines ${t.signature} (floating all-air ${t.floating} / support-air ${t.supportAir} / lawn ${t.lawn} / stone ${t.stone} / head-blocked ${t.headBlocked} / other ${t.sigOther})`)
    const pairRows = Object.entries(t.pairs).sort((a, b) => b[1] - a[1]).slice(0, 5)
    if (pairRows.length) console.log(`  pairs: ${pairRows.map(([k, n]) => `${k} ${n}`).join(' / ')}`)
    console.log(`  guard: wet feet ${t.guardWet} / cap spent ${t.guardCap} - attempts: stalled ${t.stalls}, landed ${t.landed}${t.stallOtherTicks || t.landedOtherTicks ? `, off-plan ticks ${t.stallOtherTicks + t.landedOtherTicks}` : ''}`)
    const rows = Object.entries(pb.bots).sort((a, b) => b[1].total - a[1].total).slice(0, 6)
    if (rows.length) console.log(`  bots heaviest-first: ${rows.map(([b, r]) => `${b} ${r.total}`).join(' ')}`)
  }
}

// (v0.499.0) THE ASSIST LEDGER - the pounce handoff's aftermath: the
// v0.498.0 book's 'the assist ladder owns it' claim, joined forward
// to the bot's next climb-lane boundary and priced (the ringafter
// twin).
{
  const al = assistLedger(lines)
  if (al && al.totals.handoffs > 0) {
    const t = al.totals
    console.log(`--- ASSIST LEDGER (v0.499.0: the pounce handoff's aftermath - the ladder's ownership priced) ---`)
    console.log(`  handoffs: ${t.handoffs} (wet guards ${t.guardWet}${t.guardCap ? ` + cap-spent ${t.guardCap}` : ''}, stalls ${t.stalls}) - book ${t.handoffs}=${t.rose}+${t.attemptOk}+${t.died}+${t.open}`)
    console.log(`  the claim: ROSE ${t.rose} (${t.roseLevels} levels${t.rose ? `, avg ${(t.roseLevels / t.rose).toFixed(1)}` : ''}) vs DIED ${t.died} (${Object.entries(t.diedWhys).map(([w, n]) => `${w} ${n}`).join(', ') || '-'})${t.open ? `, open ${t.open}` : ''}${t.died > t.rose ? ' - THE OWNERSHIP DIED MORE THAN IT DELIVERED' : ' - the delivery holds'}`)
    const rows = al.rows.map(r => `${r.bot}/${r.kind === 'guard' ? 'g' : 's'}->${r.cls === 'rose' ? `rose+${r.levels}` : r.cls === 'died' ? r.why : r.cls}`)
    console.log(`  rows: ${rows.join(' | ')}`)
  }
}

// (v0.500.0) THE TORCH LEDGER - the light supply chain's own book:
// the coal floor, the stick floors, the two stick-drought rescue
// rungs, the resupply asks and the yield. The fire-0130 gap survey's
// biggest unowned lane (441 craft rows + 24 streak lines), taken.
{
  const tb = torchBook(lines)
  if (tb && tb.totals.total > 0) {
    const t = tb.totals
    console.log(`--- TORCH LEDGER (v0.500.0: the light supply's floors, rungs, asks and yield) ---`)
    console.log(`  floors: coal ${t.coalSkips} (sticks ${t.coalSkipSticks} coals ${t.coalSkipCoals}) / stick ${t.stickSkips} (sticks ${t.stickSkipSticks} coals ${t.stickSkipCoals}) / cap ${t.capDeclines} / metal-reserve ${t.reserveDeclines} (${t.reserveCoal} coal held)`)
    console.log(`  rescues: plank rungs ${t.plankRungs} (${t.plankRungPlanks} planks held) / logs rungs ${t.logsRungs} / resupply asks ${t.resupplyAsks} (${t.resupplyAskCoal} coal asked)`)
    console.log(`  yield: ${t.terminals} terminals, ${t.terminalBatches} batches -> ${t.terminalTorches} torches (the metal reserve kept ${t.terminalMetalKept}) - no-lands ${t.noLands}, errors ${t.errors}, streak lines ${t.streaks} (x${t.streakX})`)
    const rows = Object.entries(tb.bots).sort((a, b) => b[1].total - a[1].total).slice(0, 6)
    if (rows.length) console.log(`  bots heaviest-first: ${rows.map(([b, r]) => `${b} ${r.total}`).join(' ')}`)
  }
}

// (v0.501.0) THE VEIN LEDGER - the vein sweep's own book: the
// terminals, the walk yield, the gallery digs, the dig refusals,
// the spares and the tier guard. The fleet's core mining engine,
// priced at last (the drop-walk fail rows stay dropwalk's - one
// parser per shape, the boundary pinned both ways).
{
  const vl = veinLedger(lines)
  if (vl && vl.totals.total > 0) {
    const t = vl.totals
    console.log(`--- VEIN LEDGER (v0.501.0: the sweep's own book - terminals, walk yield, gallery, refusals, tier guard) ---`)
    console.log(`  harvest: ${t.terminals} terminals (${t.terminalDrops} drops in reach, ${t.terminalDug} dug), ${t.yields} walk yields (+${t.yieldU}u), gallery ${t.galleryOres} ores (floor lock ${t.galleryFloorLock} / ore detour ${t.galleryOreDetour})`)
    console.log(`  refusals: lip ${t.lipRefusals} / support ${t.supportRefusals} (seals kept ${t.supportSeal}) / ledge cut ${t.ledgeRefusals}; spares: deep ${t.deepSkips} (${t.deepSkippedDrops} drops), zero-disp ${t.spared} (${t.sparedDrops}), pre-goto ${t.goalRefusals} (${t.goalRefusedDrops})`)
    console.log(`  walk triage: above-plane ${t.aboveTimeouts} (${t.aboveWalks} walks) / below-plane ${t.belowFails} (${t.belowWalks}); picked-nothing ${t.pickedNothings} (delta ${t.pickedDelta}); dig-downs ${t.digDowns}; stance ${t.stanceArmed} armed / ${t.stanceLanded} landed (+${t.stanceWalked}u)`)
    const tg = Object.entries(t.tierGuardNames).map(([o, n]) => `${o} ${n}`).join(' + ') || 'none'
    console.log(`  tier guard: ${t.tierGuards} rows refusing ${t.tierGuardOres} ore units (${tg})`)
    const rows = Object.entries(vl.bots).sort((a, b) => b[1].total - a[1].total).slice(0, 6)
    if (rows.length) console.log(`  bots heaviest-first: ${rows.map(([b, r]) => `${b} ${r.total}`).join(' ')}`)
  }
}

// (v0.502.0) THE COMMONS LEDGER - the fuel commons sweep's own book:
// what the torch-coal resupply ask's machinery then ANSWERED - the
// ask's aftermath the v0.500.0 ledger's credit lent a delivery
// nobody had counted. The dead letter box law lives here.
{
  const cl = commonsLedger(lines)
  if (cl && cl.totals.sweeps > 0) {
    const t = cl.totals
    console.log(`--- COMMONS LEDGER (v0.502.0: the ask's answer - the sweeps, the walk, the deliveries) ---`)
    console.log(`  sweeps ${t.sweeps} (torch lane ${t.laneTorch} / smelt lane ${t.laneSmelt}): delivered ${t.delivered} (${t.units} units) / budget-spent ${t.budgetSpent} / silent-exhaust ${t.silentExhaust} / ghost ${t.ghost} / no-chest ${t.noChest}`)
    console.log(`  walk anatomy: nudges ${t.nudges} / re-segments ${t.resegments} / spent slices ${t.spentSlice} / walk fails ${t.walkFail} (${Object.entries(t.walkFailWhys).map(([w, n]) => `${w} ${n}`).join(', ')})`)
    console.log(`  chest anatomy: empty ${t.emptyChest} / open-fail ${t.openFail} / vertical doom ${t.verticalDoom} (${t.doomShapes.join(', ')}) / vanished ${t.blockVanished} / cover stand-downs ${t.coverStandDown}`)
    console.log(`  asks ${t.asks} (${t.askCoal} coal asked): re-plans ${t.rePlan} / still-dry ${t.stillDry} / cap ${t.cap} / reserve ${t.reserve} / error ${t.error} / open ${t.askOpen} - deaths on the walk ${t.deaths}`)
    const rows = Object.entries(cl.bots).sort((a, b) => b[1].sweeps - a[1].sweeps).slice(0, 6)
    if (rows.length) console.log(`  bots heaviest-first: ${rows.map(([b, r]) => `${b} ${r.sweeps}sw/${r.asks}ask`).join(' ')}`)
  }
}
