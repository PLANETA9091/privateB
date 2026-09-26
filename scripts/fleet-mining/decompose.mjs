// Decompose a fleet19.log into the evidence classes the worklog tracks.
// Usage: node scripts/fleet-mining/decompose.mjs <path-to-fleet19.log>
import { readFileSync } from 'node:fs'

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
console.log('  per-bot glitch pages(air-bar ignored):', fmt(perBot(/air-bar glitch ignored/)))
console.log('  liar ladder ratchets:', count(/liar ladder ratchets/), 'per-bot:', fmt(perBot(/liar ladder ratchets/)))
console.log('  liar ladder resets:', count(/liar ladder resets/))
console.log('  overrides (believe the bar):', count(/air-bar glitch override/))
console.log('  wet-critical fast window:', count(/wet-critical fast window/))
console.log('  GRACE HOLD/VOID:', count(/GRACE (HOLD|VOID)/), ' STORM PROBE:', count(/STORM PROBE/), ' FATAL:', count(/FATAL/))

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

console.log('=== PLAN / WORLDMAP ===')
console.log('  map trips:', count(/map trip/i), ' worldmap scans:', count(/worldmap|scan/i))
console.log('  plan lines:', count(/materials plan|plan progress/i))
