// The re-loot walk's wiring pins (v0.201.0).
//
// run63-mined (fleet 36212235363) measured ~227u of NAMED death drops
// (the v0.199.0 line) surviving past the run's end - nobody walked back.
// The pure plan (src/lib/reloot.mjs) shipped in v0.200.0; this fire wires
// it: the miner records the death (spot + clock), the runner's work loop
// turns the record into ONE planned walk. These pins read the SOURCE of
// both sides - the dusk wire's dead-wire class (run195: the pure family
// passed, the field wiring omitted an arg, the fence default 0 refused
// EVERY arm for its whole field life) is only catchable at the call site,
// so the pins name every scalar the call must carry.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the miner death handler records the re-loot state', () => {
  assert.ok(minerSrc.includes('let lastDeath = null'), 'the state exists (per-instance, junk-safe)')
  assert.ok(minerSrc.includes("lastDeath = { spot: { x: dp.x, y: dp.y, z: dp.z }, at: Date.now(), attempted: false }"),
    'the record rides the SAME guarded read the death-spot memory uses (spot + clock + un-attempted)')
  assert.ok(minerSrc.includes('lastDeath: () => lastDeath'),
    'the miner exposes the record to the runner (the runner decides, never the death handler)')
})

test('REGRESSION PIN: the fleet imports the pure plan', () => {
  assert.ok(fleetSrc.includes("import { relootPlan } from '../src/lib/reloot.mjs'"),
    'the runner reads the plan from the module (no fork of the fence arithmetic)')
})

test('REGRESSION PIN: the re-loot call carries every scalar (the run195 dead-wire class)', () => {
  const call = fleetSrc.match(/relootPlan\(\{[\s\S]*?\}\)/)
  assert.ok(call, 'the call site exists in the work loop')
  assert.match(call[0], /spot:\s*relootDeath\.spot/, 'the spot rides the call')
  assert.match(call[0], /deathAt:\s*relootDeath\.at/, 'the death clock rides the call (the despawn window prices from it)')
  assert.match(call[0], /now:\s*Date\.now\(\)/, "the caller's clock rides the call (the plan never reads the wall clock)")
  assert.match(call[0], /botPos:\s*miner\.bot\.entity/, 'the respawned position rides the call (the distance needs it)')
})

test('REGRESSION PIN: one evaluation per death, marked BEFORE the walk', () => {
  const lane = fleetSrc.match(/const relootDeath = miner\.lastDeath\?\.\(\) \?\? null[\s\S]*?const relootT0/)
  assert.ok(lane, 'the lane exists at the loop top')
  assert.ok(lane[0].includes('relootDeath.attempted = true'),
    'the attempted flag flips before the walk fires (the retry-storm fence owns the lane)')
  assert.ok(lane[0].includes('!relootDeath.attempted'),
    'the gate reads the flag (a second loop pass never re-evaluates the same death)')
})

test('REGRESSION PIN: the walk rides the plan budget and range, never hardcoded', () => {
  const walk = fleetSrc.match(/gotoSafe\(miner\.bot, standGoalNear\(miner\.bot, goals, rp\.goal\.x, rp\.goal\.y, rp\.goal\.z, \{ range: rp\.range \}\), \{ timeoutMs: rp\.budgetMs, label: 'reloot' \}\)/)
  assert.ok(walk, 'the walk carries the plan goal, the plan range (the below-plane lesson) and the plan budget')
})

test('REGRESSION PIN: the runner-side fences - armed and daylight', () => {
  assert.match(fleetSrc, /reloot: no walk \(unarmed\)/, 'the v0.140.1 hold: an unarmed pocket bootstraps first')
  assert.match(fleetSrc, /walkForbidden\(miner\.bot\.time\?\.timeOfDay\)/, 'the v0.185.0 night-hold shape gates the surface walk')
  assert.match(fleetSrc, /reloot: no walk \(night\)/, 'the held walk names its why (silence is never evidence)')
})

test('REGRESSION PIN: the honest arrival read', () => {
  assert.match(fleetSrc, /item stack\(s\) in reach/, 'the arrival names the stacks it found')
  assert.match(fleetSrc, /nothing left \(picked up or despawned\)/, 'the empty read prints - zero is a verdict, not silence')
  assert.match(fleetSrc, /e\.name !== 'item'/, 'the entity read uses the house item-entity idiom')
})

test("REGRESSION PIN: the fleet filter carries the 'reloot' key", () => {
  const filterMatch = fleetSrc.match(/if \(\/([^/]+)\/\.test\(m\)\) console\.log\(`\$\{name\} \$\{m\}`\)/)
  assert.ok(filterMatch, 'the bot-log filter regex found in fleet19.mjs')
  const filter = new RegExp(filterMatch[1])
  assert.ok(filter.test('[F7] reloot: walking to the own death spot [-138,52,420] (62b, budget 21s, window 290s)'),
    'the arm line reaches the artifact (the v0.176.0 prefix law)')
  assert.ok(filter.test('[F7] reloot: arrived in 18s - 0 item stack(s) in reach - nothing left (picked up or despawned)'),
    'the arrival read reaches the artifact')
  assert.ok(filter.test('[F7] reloot: no walk (night) - the walk-forbidden window owns the surface, the drops ride out their clock'),
    'a refusal line passes even WITHOUT a filter keyword inside the why (the v0.56.0 filter-blind lesson)')
})
