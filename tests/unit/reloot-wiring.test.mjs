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
  assert.ok(minerSrc.includes("lastDeath = { spot: { x: dp.x, y: dp.y, z: dp.z }, at: Date.now(), attempted: false, pocketU: dropPocketU }"),
    'the record rides the SAME guarded read the death-spot memory uses (spot + clock + un-attempted; v0.280.0 grows the pocket stake for the write-off line)')
  assert.ok(minerSrc.includes('lastDeath: () => lastDeath'),
    'the miner exposes the record to the runner (the runner decides, never the death handler)')
})

test('REGRESSION PIN: the fleet imports the pure plan, the retry classifier, the surface ladder and the rim dig', () => {
  assert.match(fleetSrc, /import \{ relootPlan, relootPileVerdict, relootRetry, relootSurfaceY, relootSurfaceWhy, relootSurfaceRetry, relootRimDig, relootUnarmedVerdict, relootWriteoffLine, relootCarry, RELOOT_SURFACE_RISE_MAX, RELOOT_RETRY_RANGE, RELOOT_DESPAWN_MS, RELOOT_SPOT_FLUID_RE \} from '\.\.\/src\/lib\/reloot\.mjs'/,
    'the census rides the import (the runner reads the plan, the v0.484.0 pile verdict, the classifier, the scanner, the census, the surface ladder, the rim dig, the v0.261.0 unarmed verdict, the v0.648.0 carry shape AND the v0.854.0 wet-spot fluid class from the module; the v0.207.0 precedent: the import line grows with the wiring, the intent pin moves with it)')
})

test('REGRESSION PIN: the re-loot call carries every scalar (the run195 dead-wire class)', () => {
  const call = fleetSrc.match(/relootPlan\(\{[\s\S]*?\}\)/)
  assert.ok(call, 'the call site exists in the work loop')
  assert.match(call[0], /spot:\s*relootDeath\.spot/, 'the spot rides the call')
  assert.match(call[0], /deathAt:\s*relootDeath\.at/, 'the death clock rides the call (the despawn window prices from it)')
  assert.match(call[0], /now:\s*Date\.now\(\)/, "the caller's clock rides the call (the plan never reads the wall clock)")
  assert.match(call[0], /botPos:\s*miner\.bot\.entity/, 'the respawned position rides the call (the distance needs it)')
  assert.match(call[0], /spotWet:\s*relootSpotWet/, 'the live wet read rides the call (the v0.854.0 fence is only as real as its wire)')
})

test('REGRESSION PIN: the wet-spot read is the LIVE world read (the v0.854.0 fence)', () => {
  // MEASURED (face 128 = 37867025314): the lane walked the respawned bot
  // back into the water that killed it and the retry leg drowned it again.
  // The fence is only as honest as its read: the spot's OWN cell at plan
  // time, the module's fluid class, junk never invents a refusal.
  const read = fleetSrc.match(/const relootSpotWet = \(\(\) => \{[\s\S]*?\}\)\(\)/)
  assert.ok(read, 'the wet read exists at the lane top (before the plan call)')
  assert.match(read[0], /miner\.bot\.blockAt\(new Vec3\(Math\.floor\(s\.x\), Math\.floor\(s\.y\), Math\.floor\(s\.z\)\)\)/, 'the read floors the spot and reads the LIVE cell (the world at plan time, not the death memory)')
  assert.match(read[0], /RELOOT_SPOT_FLUID_RE\.test\(b\.name\)/, 'the fluid class rides the module export (one read, two consumers, zero drift)')
  assert.match(read[0], /return false/, 'junk reads false - a junk world never invents a refusal')
  // the fence order: the read fires BEFORE the plan call (the plan consumes it)
  const readIdx = fleetSrc.indexOf('const relootSpotWet')
  const callIdx = fleetSrc.indexOf('relootPlan({')
  assert.ok(readIdx > -1 && callIdx > readIdx && callIdx - readIdx < 1200, 'the wet read precedes the plan call it feeds')
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
  const unarmed = lane[0].match(/else if \(!hasPickNow\(\) && relootUnarmedVerdict\(\{ deathAt: relootDeath\.at, now: Date\.now\(\) \}\)\.defer && !relootPileArm\) \{[\s\S]*?\n          \} else if/)
  assert.ok(unarmed, 'the unarmed arm exists (v0.261.0: the grace-bounded condition; v0.484.0: the pile-arm bypass rides the condition)')
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
  // (v0.649.0) the carry rides relootCarry - the ONE shape both hops share:
  // the un-attempted law, the junk battery and the pocket stake live in the
  // pure function (unit-pinned in reloot.test.mjs), the wiring stays a read.
  assert.ok(end[0].includes('deathCarry = relootCarry(prevDeath)'),
    'the carry rides relootCarry (the v0.648.0 shape: spot + clock + pocketU; no record -> no carry, never a fabricated death)')
})

test('v0.203.0: the miner seeds the record from the carry (guarded read)', () => {
  assert.match(minerSrc, /seedLastDeath = null,/, 'the seed rides the createMiner opts (the destructure names it)')
  assert.ok(minerSrc.includes('Number.isFinite(seedLastDeath.at)') && minerSrc.includes('Number.isFinite(seedLastDeath.spot.x)'),
    'a junk seed reads as no-record, never as a walk (the guarded-read law)')
  assert.ok(minerSrc.includes('attempted: !!seedLastDeath.attempted'),
    "the seed CLONES - the old closure's record object is never aliased across instances")
  // (v0.649.0) the seed keeps the pocket stake too - the v0.484.0 pile arm reads it
  assert.ok(minerSrc.includes('seedLastDeath.pocketU'),
    'the seed keeps the stake (the post-rebuild big pile arms as a pile, not as an empty pocket)')
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

// ---- v0.211.0 THE SURFACE WIRING ----
// run55 named the shape: the wide retry refused again ('No path to the
// goal!') and the drops FLOAT - the reachable goal is the water SURFACE
// above the dead cell, not a wider sphere. The pure ladder shipped in
// v0.208.0 (relootSurfaceY + relootSurfaceRetry); this fire wires the
// third leg inside the wide retry's own catch. Every scalar named (the
// run195 law).

test('v0.211.0: the surface lane lives INSIDE the wide retry catch (the strict leg ladder)', () => {
  const lane = fleetSrc.match(/catch \(e2\) \{[\s\S]*?reloot: surface failed/)
  assert.ok(lane, 'the surface lane exists inside the e2 catch (never beside it, never before the wide retry)')
  assert.ok(lane[0].includes('reloot: retry failed'), 'the wide retry refusal prints BEFORE the surface legs (the ladder reads in order)')
  assert.ok(lane[0].includes('retries: 1'), 'the gate reads retries exactly 1 - the wide retry spent its refusal (the v0.208.0 ladder law)')
})

test('v0.211.0: the column read is capped and junk-safe (the runner side of the scanner contract)', () => {
  const read = fleetSrc.match(/const column = \[\][\s\S]*?column\.push\(\{ y: rp\.goal\.y \+ i, name: blockName \}\)/)
  assert.ok(read, 'the bottom-up read exists')
  assert.match(read[0], /i <= RELOOT_SURFACE_RISE_MAX/, 'the read is capped to the scanner bound (never an open-ended climb)')
  assert.match(read[0], /miner\.bot\.blockAt\(new Vec3\(rp\.goal\.x, rp\.goal\.y \+ i, rp\.goal\.z\)\)/, 'the reads start AT the spot (the plan goal rides the column x/z/y)')
  assert.match(read[0], /blockName = b\?\.name \?\? null/, 'an unreadable block reads null (the scanner refuses junk honestly)')
  assert.match(fleetSrc, /catch \{ return \{ go: false, why: 'no-surface' \} \}/, 'a junk world read refuses as no-surface - the death stays terminal')
})

test('v0.211.0: the surface call carries every scalar (the run195 dead-wire class)', () => {
  const lane = fleetSrc.match(/const rs = \(\(\) => \{[\s\S]*?if \(!rs\.go\)/)
  assert.ok(lane, 'the surface gate lane exists (the IIFE read + the call + the verdict split)')
  assert.match(lane[0], /relootSurfaceRetry\(\{/, 'the gate is called at the retry-failure site')
  assert.match(lane[0], /message:\s*e2\?\.message/, "the WIDE RETRY's own error rides the call (the geometry class decides)")
  assert.match(lane[0], /retries:\s*1/, 'the ladder position rides the call (never before the cheap leg)')
  assert.match(lane[0], /surfaceY:\s*relootSurfaceY\(\{ column \}\)/, 'the scanner verdict rides the call (the runner never guesses a y)')
  assert.match(lane[0], /spot:\s*relootDeath\.spot/, 'the death spot rides the call (the goal x/z ride it)')
  assert.match(lane[0], /deathAt:\s*relootDeath\.at/, 'the death clock rides the call (the despawn window prices from it)')
  assert.match(lane[0], /now:\s*Date\.now\(\)/, "the caller's clock rides the call")
  assert.match(lane[0], /botPos:\s*miner\.bot\.entity/, 'the current stance rides the call (the distance needs it)')
})

test('v0.211.0: the surface walk rides doomedRearm and the plan pricing, never hardcoded', () => {
  const walk = fleetSrc.match(/gotoSafe\(miner\.bot, standGoalNear\(miner\.bot, goals, rs\.goal\.x, rs\.goal\.y, rs\.goal\.z, \{ range: rs\.range \}\), \{ timeoutMs: rs\.budgetMs, label: 'reloot surface', doomedRearm: true \}\)/)
  assert.ok(walk, 'the surface walk carries the gate goal, the gate range, the gate budget and the ledger re-arm (the wide retry LEDGERED the cell family too)')
})

test('v0.211.0: the honest surface terminal classes', () => {
  assert.match(fleetSrc, /reloot: surface retry at \[/, 'the surface arm prints loudly (the decode counts the arms)')
  assert.match(fleetSrc, /reloot: surface arrived in/, 'the surface arrival prints')
  assert.match(fleetSrc, /reloot: surface failed/, 'the surface failure prints (silence is never evidence)')
  assert.match(fleetSrc, /distanceTo\(me\) <= rs\.range/, 'the read rides the PLAN range (the v0.208.0 recipe: the read rides the plan range)')
  assert.match(fleetSrc, /\(no surface: \$\{rs\.subWhy \|\| rs\.why\}\)/, 'a refused surface names its why on the terminal line - the census class rides BESIDE the legacy why (the v0.213.0 census; the legacy shape survives as the fallback)')
  assert.ok(fleetSrc.includes('${name} reloot: retry failed (${e2.message}) - the drops stay lost'),
    'the legacy retry-failure prefix survives verbatim (the historical greps stay stable)')
})

test("v0.211.0: the surface lines reach the artifact (the v0.176.0 prefix law - the 'reloot' key owns the prefix)", () => {
  const filterMatch = fleetSrc.match(/if \(\/([^/]+)\/\.test\(m\)\) console\.log\(`\$\{name\} \$\{m\}`\)/)
  assert.ok(filterMatch, 'the bot-log filter regex found in fleet19.mjs')
  const filter = new RegExp(filterMatch[1])
  assert.ok(filter.test('[F17] reloot: surface retry at [-117,63,406] (budget 16s) - the floating stacks live at the water surface'),
    'the surface arm line reaches the artifact')
  assert.ok(filter.test('[F17] reloot: surface arrived in 12s - 3 item stack(s) within 2 - the magnet takes what it can'),
    'the surface arrival line reaches the artifact')
  assert.ok(filter.test('[F4] reloot: surface failed (No path to the goal!) - the drops stay lost'),
    'the surface failure line reaches the artifact')
  assert.ok(filter.test('[F10] reloot: retry failed (No path to the goal!) - the drops stay lost (no surface: no-surface)'),
    'the refused-surface terminal line reaches the artifact (the no-surface census rides the same filter)')
  assert.ok(filter.test('[F6] reloot: retry failed (No path to the goal!) - the drops stay lost (no surface: sealed)'),
    'the census class reaches the artifact (the run77 anatomy, now named)')
})

// ---- v0.213.0 THE NO-SURFACE CENSUS (the wiring) ----
// run77 ended '(no surface: no-surface)' - the gate refused honestly but the
// decode could not split sealed vs unloaded vs land. The census rides the
// SAME call (the runner never guesses a class either) and the terminal line
// prints the sub-class beside the legacy why.

test('v0.213.0: the census rides the surface call and the terminal line (the run195 law)', () => {
  const lane = fleetSrc.match(/const rs = \(\(\) => \{[\s\S]*?if \(!rs\.go\)/)
  assert.ok(lane, 'the surface gate lane exists')
  assert.match(lane[0], /surfaceWhy:\s*relootSurfaceWhy\(\{ column \}\)/,
    'the census verdict rides the call (the runner never guesses a class)')
  const term = fleetSrc.match(/reloot: retry failed \(\$\{e2\.message\}\)[\s\S]*?\(no surface: [^`]+\)/)
  assert.ok(term, 'the terminal line exists')
  assert.match(term[0], /rs\.subWhy \|\| rs\.why/, 'the census class prints FIRST, the legacy why is the fallback (never instead)')
})

test('v0.213.0: the census classes reach the decompose histogram (the watch list decodes itself)', () => {
  const dec = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(dec.includes('reloot: retry failed.*\\(no surface: ([^)]+)\\)'), 'the surfaceWhys histogram regex found')
  const filter = new RegExp('reloot: retry failed.*\\(no surface: ([^)]+)\\)')
  for (const line of [
    '[F6] reloot: retry failed (No path to the goal!) - the drops stay lost (no surface: sealed)',
    '[F17] reloot: retry failed (No path to the goal!) - the drops stay lost (no surface: junk-read)',
    '[F4] reloot: retry failed (No path to the goal!) - the drops stay lost (no surface: no-air)'
  ]) {
    const m = line.match(filter)
    assert.ok(m && ['sealed', 'junk-read', 'no-air'].includes(m[1].split(' ')[0]), `the census class parses: ${line}`)
  }
})

// ---- v0.221.0 THE RIM DIG WIRING ----
// v0.219.0 shipped the pure plan (relootCap + relootRimDig); this fire wires
// the ladder's FOURTH leg inside the surface gate's own refusal, gated on the
// census's 'sealed' class (run 36248025944 F13's anatomy: the drops FLOAT
// under a solid cap, untouchable by every walk the ladder owns). The stance
// guard is the law: the dig must never open the column the bot stands on.
// Every scalar named (the run195 law).

test('v0.221.0: the rim dig lane lives INSIDE the surface refusal, gated on sealed (the strict leg ladder)', () => {
  const lane = fleetSrc.match(/if \(!rs\.go\) \{[\s\S]*?\n                  \} else \{\n                    console\.log\(`\$\{name\} reloot: surface retry at/)
  assert.ok(lane, 'the refusal branch exists beside the surface walk (the ladder reads in order)')
  assert.ok(lane[0].includes("rs.why === 'no-surface' && rs.subWhy === 'sealed'"),
    'the dig fires ONLY on the sealed census class (the scanner and the walk legs own every other refusal)')
  assert.ok(lane[0].includes('reloot: retry failed'), 'the legacy terminal line prints BEFORE the dig legs (the ladder reads in order)')
})

test('v0.221.0: the rim dig call carries every scalar (the run195 dead-wire class)', () => {
  const call = fleetSrc.match(/relootRimDig\(\{[\s\S]*?\}\)/)
  assert.ok(call, 'the dig plan is called at the sealed-refusal site')
  assert.match(call[0], /column/, 'the SAME column read rides the call (the coherence law: one read, two consumers)')
  assert.match(call[0], /spot:\s*relootDeath\.spot/, 'the death spot rides the call (the goal x/z ride it)')
  assert.match(call[0], /deathAt:\s*relootDeath\.at/, 'the death clock rides the call (the despawn window prices from it)')
  assert.match(call[0], /now:\s*Date\.now\(\)/, "the caller's clock rides the call")
  assert.match(call[0], /botPos:\s*miner\.bot\.entity/, 'the current stance rides the call (the distance needs it)')
})

test('v0.221.0: the stance guard - verify, re-stance one block out, or hold (never dig under own feet)', () => {
  const guard = fleetSrc.match(/THE STANCE GUARD - verify, re-stance, or hold\.[\s\S]*?rim dig held/)
  assert.ok(guard, 'the guard block exists between the walk and the swing')
  assert.match(guard[0], /Math\.floor\(meDig\.x\) === rd\.digTarget\.x && Math\.floor\(meDig\.z\) === rd\.digTarget\.z/,
    'the guard reads the stance column against the dig column (floored - the entity position is a float)')
  assert.match(guard[0], /rd\.capY \+ 1[\s\S]*?rd\.capY \+ 2/, 'the neighbor read prices the feet AND the head (a two-air stance)')
  assert.match(guard[0], /rim dig held/, 'an un-resolvable stance HOLDS (no swing, an honest log - never a guess)')
  assert.match(guard[0], /label: 'reloot rim stance'/, 'the re-stance walk prints under its own label (the decode reads it)')
})

test('v0.221.0: the swing re-fences the window, the arm, and the cap block (each refusal named)', () => {
  const swing = fleetSrc.match(/const windowLeft = \(relootDeath\.at \+ RELOOT_DESPAWN_MS\) - Date\.now\(\)[\s\S]*?rim dig done in/)
  assert.ok(swing, 'the swing lane exists (from the window re-fence to the done line)')
  assert.match(swing[0], /RELOOT_DESPAWN_MS[\s\S]*?RELOOT_RIM_DIG_MIN_MS/,
    'the window re-fence prices the despawn against the dig+float floor at swing time (the walk spent its clock)')
  assert.match(swing[0], /!hasPickNow\(\)/, 'the arm gate reads the hands (the delay law does not re-enter here - honestly terminal)')
  assert.match(swing[0], /rim dig skipped \(unarmed/, 'the unarmed skip prints')
  assert.match(swing[0], /rim dig skipped \(the cap block read null/, 'a null cap block skips honestly (the unloaded-chunk class)')
  assert.match(swing[0], /rim dig refused \(no-time:/, 'a thin window refuses by name')
})

test('v0.221.0: the honest rim dig verdicts and the float wait', () => {
  assert.match(fleetSrc, /reloot: rim dig at \[/, 'the dig arm prints loudly (the decode counts the arms)')
  assert.match(fleetSrc, /reloot: rim dig opened the seal/, 'the opened seal prints (the cap block name rides it)')
  assert.match(fleetSrc, /reloot: rim dig done in/, 'the done verdict prints with the stack read')
  assert.match(fleetSrc, /reloot: rim dig failed/, 'the failure prints (silence is never evidence)')
  assert.match(fleetSrc, /reloot: rim dig refused/, 'the plan-level refusal prints')
  assert.match(fleetSrc, /await new Promise\(r => setTimeout\(r, RELOOT_RIM_FLOAT_MS\)\)/,
    'the float wait is a bounded sleep (the water rises and vanilla lifts the stacks)')
  assert.match(fleetSrc, /distanceTo\(me3\) <= RELOOT_RETRY_RANGE/, 'the evidence read rides the ladder read sphere (8 - the honest convention)')
})

test('v0.221.0: the rim dig walk rides doomedRearm and the plan pricing, never hardcoded', () => {
  const walk = fleetSrc.match(/gotoSafe\(miner\.bot, standGoalNear\(miner\.bot, goals, rd\.goal\.x, rd\.goal\.y, rd\.goal\.z, \{ range: rd\.range \}\), \{ timeoutMs: rd\.budgetMs, label: 'reloot rim dig', doomedRearm: true \}\)/)
  assert.ok(walk, 'the dig walk carries the plan goal, the plan range, the plan budget and the ledger re-arm (the wide retry LEDGERED the cell family too)')
})

test("v0.221.0: the rim dig lines reach the artifact (the v0.176.0 prefix law - the 'reloot' key owns the prefix)", () => {
  const filterMatch = fleetSrc.match(/if \(\/([^/]+)\/\.test\(m\)\) console\.log\(`\$\{name\} \$\{m\}`\)/)
  assert.ok(filterMatch, 'the bot-log filter regex found in fleet19.mjs')
  const filter = new RegExp(filterMatch[1])
  assert.ok(filter.test('[F13] reloot: rim dig at [-83,60,380] (cap y59, dig target [-83,59,380], budget 20s, window 280s) - the seal opens, the floats lift'),
    'the dig arm line reaches the artifact')
  assert.ok(filter.test('[F13] reloot: rim dig opened the seal (cap stone at [-83,59,380]) - the float wait 5s'),
    'the opened-seal line reaches the artifact')
  assert.ok(filter.test('[F13] reloot: rim dig done in 12s - 2 item stack(s) within 8 - the magnet takes what it can'),
    'the done line reaches the artifact')
  assert.ok(filter.test('[F13] reloot: rim dig held - the stance owns the dig column and no neighbor reads standable, no swing (the guard holds)'),
    'the guard-hold line reaches the artifact')
  assert.ok(filter.test('[F13] reloot: rim dig refused (no-time: 9s left, the dig+float needs 20s)'),
    'the no-time swing refusal reaches the artifact')
})

test('v0.221.0: the rim dig counters reach the decompose (the field debut decodes itself)', () => {
  const dec = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  for (const needle of ['rim dig arms:', 'rim dig seals opened:', 'rim dig guard holds:', 'rim dig refusals:']) {
    assert.ok(dec.includes(needle), `the ${needle} counter exists`)
  }
})

test('v0.261.0: the unarmed grace escalates the deadlock class into the walk lane', () => {
  // The measured deadlock (face 36359454749 attempt 1): F7 deferred x7 across
  // t+2s..t+76s while every recovery burned on the woodless pocket and the
  // death kit despawned unclaimed - the delay had no exit.
  assert.ok(fleetSrc.includes('relootUnarmedVerdict'), 'the fleet imports the pure verdict')
  assert.ok(fleetSrc.includes('the unarmed escalation'), 'the walking line carries the escalation marker for the census')
  assert.ok(fleetSrc.includes('reloot: no walk (unarmed)'), 'the defer shape survives byte for byte')
})

// ---- (v0.484.0) THE PILE ARM - the bypass wiring ----
// The stranded read (v0.476.0, faces 41..43) priced the unarmed deadlock:
// 20 piles ~2086u, the lane walked ZERO - the gate reads the bot's POCKET
// while the pile sits on the GROUND. The bypass arms the walk off the PILE
// (the death record's own pocketU stake) when it carries BIG_PILE_U; the
// delay law survives byte for byte for every pocket below the floor.
test('v0.484.0: the pile arm rides the delay condition and the walking line (the dead-wire class)', () => {
  // the verdict read sits at the block top (once per pass, before the plan)
  const block = fleetSrc.match(/const relootDeath = miner\.lastDeath\?\.\(\) \?\? null[\s\S]*?let rp = null/)
  assert.ok(block, 'the arm block exists')
  assert.match(block[0], /const relootPileArm = relootPileVerdict\(\{ pileU: relootDeath\.pocketU \}\)\.bypass/,
    'the bypass reads the death record\u0027s OWN pocket stake (the pile\u0027s mass stored AT the death event)')
  // the delay condition carries the bypass (the pile arm skips the delay, never the night fence)
  const delayCondition = fleetSrc.match(/else if \(!hasPickNow\(\) && relootUnarmedVerdict\(\{ deathAt: relootDeath\.at, now: Date\.now\(\) \}\)\.defer && !relootPileArm\) \{/)
  assert.ok(delayCondition, 'the delay condition gains the pile bypass (the night check below keeps its own branch)')
  // the walking line names the bypass for the census (only when it DID the work: unarmed)
  const walkLine = fleetSrc.match(/reloot: walking to the own death spot \[\$\{rp\.goal\.x\}[^\n]+\)/)
  assert.ok(walkLine, 'the walking line exists')
  assert.match(walkLine[0], /relootPileArm && relootUnarmedEscalation \? ', the pile arm' : ''/,
    'the pile-arm marker rides the walking line ONLY for the unarmed walk (an armed walker\u0027s bypass did no work - no marker)')
  // the delay line survives byte for byte (the sub-floor pockets keep the legacy law)
  assert.ok(fleetSrc.includes('reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)'),
    'the defer shape survives byte for byte')
  // the night fence keeps its branch and its flip (the bypass leads INTO the night check, never around it)
  const nightArm = fleetSrc.match(/else if \(walkForbidden[\s\S]*?\n          \} else \{/)
  assert.ok(nightArm && nightArm[0].includes('relootDeath.attempted = true'),
    'the night fence still owns the surface (the bypass never skips the night gate)')
})
