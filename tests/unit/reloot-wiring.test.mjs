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

test('REGRESSION PIN: the fleet imports the pure plan and the retry classifier', () => {
  assert.ok(fleetSrc.includes("import { relootPlan, relootRetry } from '../src/lib/reloot.mjs'"),
    'the runner reads the plan and the classifier from the module (no fork of the fence arithmetic)')
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

// ---- v0.203.0 THE RE-LOOT RE-ARM ----
// run71-mined (fleet 36217424471, the v0.202.0 walk's FIELD DEBUT) measured
// the walk's first field day: 12 deaths, ~1443u of named death drops,
// unaccounted=647, conversion 75.6% - and 2 evaluations -> 0 WALKS. Both
// evaluations read unarmed (t+45s/t+61s: the respawn bootstrap owns the
// respawned bot's hands) and the one-shot attempted mark buried the walk
// forever; F2 (t=546s) and F7 (t=568s) never got ANY evaluation because
// their sessions hit the end-phase gates, the retry rebuilt the miner, and
// the record died with the old closure. Two gaps, two named cures.

test('v0.203.0: the unarmed refusal is a delay, not a verdict (the run71 starvation)', () => {
  const lane = fleetSrc.match(/const relootDeath = miner\.lastDeath\?\.\(\) \?\? null[\s\S]*?reloot: walk failed/)
  assert.ok(lane, 'the lane exists')
  const unarmed = lane[0].match(/else if \(!hasPickNow\(\)\) \{[\s\S]*?\n          \} else if/)
  assert.ok(unarmed, 'the unarmed arm exists')
  assert.ok(!unarmed[0].includes('attempted = true'),
    'the unarmed arm flips NOTHING - the plan read re-arms next pass (the bootstrap owns ~30-60s, the despawn window 300s)')
  const planArm = lane[0].match(/if \(!rp\.go\) \{[\s\S]*?\n          \} else if/)
  assert.ok(planArm && planArm[0].includes('relootDeath.attempted = true'),
    'a plan refusal is terminal (the flag flips before the honest why prints)')
  const nightArm = lane[0].match(/else if \(walkForbidden[\s\S]*?\n          \} else \{/)
  assert.ok(nightArm && nightArm[0].includes('relootDeath.attempted = true'),
    'the night hold stays terminal (the despawn window dies before dawn - the v0.202.0 read)')
  const walkArm = lane[0].match(/else \{\n            relootDeath\.attempted = true[\s\S]*?const relootT0/)
  assert.ok(walkArm,
    'the walk flips the flag BEFORE gotoSafe (one walk per death - the retry-storm law untouched by the re-arm)')
})

test('v0.203.0: the death record survives the attempt cycle (the carry-seed)', () => {
  assert.ok(fleetSrc.includes('let deathCarry = null'), 'the carry slot exists beside the v0.18.9 stats carry')
  assert.ok(fleetSrc.includes('seedLastDeath: deathCarry'), 'the seed rides the createMiner call (the fresh attempt inherits the plan)')
  const end = fleetSrc.match(/if \(miner\) \{\n      const prevDeath = miner\.lastDeath\?\.\(\) \?\? null[\s\S]*?\n    \}/)
  assert.ok(end, 'the attempt-end site reads the old miner\'s record')
  assert.ok(end[0].includes('!prevDeath.attempted'), 'only an UN-attempted record carries (a resolved death stays resolved)')
  assert.ok(end[0].includes('deathCarry = (prevDeath && !prevDeath.attempted) ? { spot: prevDeath.spot, at: prevDeath.at } : null'),
    'the carry is honest: no record -> no carry (never a fabricated death)')
})

test('v0.203.0: the miner seeds the record from the carry (guarded read)', () => {
  assert.match(minerSrc, /seedLastDeath = null,/, 'the seed rides the createMiner opts (the destructure names it)')
  assert.ok(minerSrc.includes('Number.isFinite(seedLastDeath.at)') && minerSrc.includes('Number.isFinite(seedLastDeath.spot.x)'),
    'a junk seed reads as no-record, never as a walk (the guarded-read law)')
  assert.ok(minerSrc.includes('attempted: !!seedLastDeath.attempted'),
    "the seed CLONES - the old closure's record object is never aliased across instances")
})

// ---- v0.207.0 THE WET-COLUMN RETRY ----
// run68-mined: both debut walks died 'No path to the goal!' - the flooded-
// quarry wet columns. The cure: ONE widened retry, granted by the pure
// classifier, riding doomedRearm (the no-path verdict LEDGERS the goal cell
// - without the re-arm the consult kills the retry for free) and a widened
// arrival read so the 0-stack verdict stays honest.

test('v0.207.0: the retry call site carries the classifier and every scalar (the run195 dead-wire class)', () => {
  const call = fleetSrc.match(/relootRetry\(\{[\s\S]*?\}\)/)
  assert.ok(call, 'the classifier is called at the walk-failure site (inside the catch, not beside the plan)')
  assert.match(call[0], /message:\s*e\?\.message/, "the walk's own error rides the call")
  assert.match(call[0], /retries:\s*0/, 'the retry never chains (the classifier owns the once-only law)')
  assert.match(call[0], /elapsedMs:\s*Date\.now\(\) - relootT0/, "the first walk's elapsed rides the call (the window prices from it)")
  assert.match(call[0], /budgetMs:\s*rp\.budgetMs/, 'the plan budget rides the call')
  assert.match(call[0], /windowMs:\s*rp\.windowMs/, 'the plan window rides the call')
})

test('v0.207.0: the retry walk rides doomedRearm and the widened range, never hardcoded', () => {
  const walk = fleetSrc.match(/gotoSafe\(miner\.bot, standGoalNear\(miner\.bot, goals, rp\.goal\.x, rp\.goal\.y, rp\.goal\.z, \{ range: rr\.range \}\), \{ timeoutMs: rr\.budgetMs, label: 'reloot retry', doomedRearm: true \}\)/)
  assert.ok(walk, 'the retry re-issues ONCE with the ledger re-arm (the no-path verdict owns the goal cell)')
})

test('v0.207.0: the widened arrival read and the honest terminal classes', () => {
  assert.match(fleetSrc, /reloot: no-path retry at range/, 'the retry arms loudly (the decode counts the arms)')
  assert.match(fleetSrc, /reloot: retry arrived in/, 'the retry arrival prints')
  assert.match(fleetSrc, /reloot: retry failed/, 'the retry failure prints (silence is never evidence)')
  assert.match(fleetSrc, /distanceTo\(me\) <= rr\.range/, 'the read widens WITH the range (a 0-stack verdict stays honest)')
  assert.match(fleetSrc, /\(no retry: \$\{rr\.why\}\)/, 'a refused retry names its why on the terminal line')
  assert.ok(fleetSrc.includes("${name} reloot: walk failed (${e.message}) - the drops stay lost"),
    'the legacy terminal line survives verbatim for the not-no-path class (the historical greps stay stable)')
})

test("v0.207.0: the new lines reach the artifact (the v0.176.0 prefix law - the 'reloot' key already owns the prefix)", () => {
  const filterMatch = fleetSrc.match(/if \(\/([^/]+)\/\.test\(m\)\) console\.log\(`\$\{name\} \$\{m\}`\)/)
  assert.ok(filterMatch, 'the bot-log filter regex found in fleet19.mjs')
  const filter = new RegExp(filterMatch[1])
  assert.ok(filter.test('[F4] reloot: no-path retry at range 8 (budget 15s) - the dry rim inside the sphere counts as arrival'),
    'the retry arm line reaches the artifact')
  assert.ok(filter.test('[F4] reloot: retry arrived in 9s - 3 item stack(s) within 8 (in read reach - the magnet takes what it can)'),
    'the retry arrival line reaches the artifact')
  assert.ok(filter.test('[F10] reloot: retry failed (No path to the goal!) - the drops stay lost'),
    'the retry failure line reaches the artifact')
  assert.ok(filter.test('[F10] reloot: walk failed (timeout after 8000ms) - the drops stay lost (no retry: not-no-path)'),
    'the refused-retry terminal line reaches the artifact')
})
