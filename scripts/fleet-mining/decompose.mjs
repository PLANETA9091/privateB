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

console.log('=== PLAN / WORLDMAP ===')
console.log('  map trips:', count(/map trip/i), ' worldmap scans:', count(/worldmap|scan/i))
console.log('  plan lines:', count(/materials plan|plan progress/i))
