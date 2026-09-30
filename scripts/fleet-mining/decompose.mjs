// Decompose a fleet19.log into the evidence classes the worklog tracks.
// Usage: node scripts/fleet-mining/decompose.mjs <path-to-fleet19.log>
import { readFileSync } from 'node:fs'
import { rescueLedger, rescueEndSeconds, RESCUE_END_CLASSES } from '../../src/lib/rescue-ledger.mjs'

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
for (const l of lines) if (/died|death|slain|drowned|suffocat|fell from|hit the ground|blew up|magic/i.test(l) && !/drowning rescue|water:/.test(l)) console.log(' ', l.slice(0, 160))

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
console.log('  drowned-kill per-bot:', fmt(perBot(/death: drowned-kill context/)))
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
