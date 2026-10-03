// v0.261.0 THE RECOVERY ASCENT - the pick-less bootstrap's wood leg gets the
// climb front the famine trip has run since v0.179.0. The face 36359454749
// census (both attempts) named the shape the top front: a bot that lost its
// picks stands in a shaft, its bootstrap's gatherWood reads zero trunks
// underground ('no planks' x11 / 'no sticks' x10 / 'no materials' x4 vs
// no-pickaxe x14 in attempt 1; attempt 2 split F13 dead underground vs F15 -
// already at the woods' edge - recovered), and the fleet cannot re-craft its
// picks. THE CURE, layer 1: the recovery's wood leg climbs FIRST
// (ensureSurface('tool recovery'), the 'wood trip' single-shot shape); a bot
// whose climb refuses keeps the byte-identical legacy underground attempt.
// THE CURE, layer 2: gatherWood's map-target walk priced a 256-block license
// with a 24s budget - the woodplan law ("45s spans the licensed range") now
// prices it with the SAME TRIP_WALK_MS constant mapTrip already runs; the
// face caught F13's famine trip climbing +4 and gathering ZERO (sticks 4 ->
// sticks 4) while the map held the forest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TRIP_WALK_MS } from '../../src/lib/woodplan.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fleetSrc = readFileSync(join(here, '../../testbed/fleet19.mjs'), 'utf8')
const minerSrc = readFileSync(join(here, '../../src/bots/miner.mjs'), 'utf8')
const woodplanSrc = readFileSync(join(here, '../../src/lib/woodplan.mjs'), 'utf8')

test('v0.261.0 wiring: the recovery wood leg climbs FIRST - the ensureSurface front sits between the spare-craft failure and the gather', () => {
  const failIdx = fleetSrc.indexOf("console.log(`${name} tool recovery: spare craft failed (${sp.reason}) - re-running the bootstrap`)")
  assert.ok(failIdx > -1, 'the spare-craft failure line exists')
  const climbIdx = fleetSrc.indexOf("if (await ensureSurface('tool recovery')) {", failIdx)
  assert.ok(climbIdx > failIdx, 'the climb front rides AFTER the spare-craft failure - the cheap recovery keeps its first shot')
  const gatherIdx = fleetSrc.indexOf('await miner.gatherWood({ want: 6, direction, shouldStop: () => Date.now() > deadline, maxSeconds: 40 })', climbIdx)
  assert.ok(gatherIdx > climbIdx, 'the wood leg gathers AFTER the climb attempt')
  assert.ok(gatherIdx - climbIdx < 2500, 'the climb front rides directly ahead of the gather - no other lane can move the bot between them')
})

test('v0.261.0 wiring: the gather runs in BOTH branches - a refused climb keeps the byte-identical legacy underground attempt', () => {
  const climbIdx = fleetSrc.indexOf("if (await ensureSurface('tool recovery')) {")
  assert.ok(climbIdx > -1)
  const elseEnd = fleetSrc.indexOf('try {\n              await miner.gatherWood({ want: 6, direction', climbIdx)
  assert.ok(elseEnd > climbIdx, 'the legacy gather call survives AFTER the if/else - never worse than legacy')
  // the if/else only LOGS the verdict - no gather call, no early return inside it
  const branch = fleetSrc.slice(climbIdx, elseEnd)
  assert.ok(!branch.includes('gatherWood'), 'the branch body never gathers or returns - both paths reach the same wood leg')
  assert.match(branch, /tool recovery: surfaced - the wood leg gathers where trees grow/, 'the surfaced verdict names itself (the census payload)')
  assert.match(branch, /tool recovery: climb refused - the underground attempt stands/, 'the refused verdict names itself (the census payload)')
})

test('v0.261.0 wiring: the legacy gather byte-shape + the ensureTools kit + the v0.52.0 brake survive untouched', () => {
  assert.match(fleetSrc, /try \{\n              await miner\.gatherWood\(\{ want: 6, direction, shouldStop: \(\) => Date\.now\(\) > deadline, maxSeconds: 40 \}\)\n            \} catch \{ \/\* craft with whatever we have \*\/ \}/, 'the wood leg is byte for byte the legacy call (fence, clock, catch)')
  assert.match(fleetSrc, /const res = await ensureTools\(miner\.bot, \{ miner, log: \(\) => \{\}, maxSeconds: 45 \}\)/, 'the kit build is unchanged')
  assert.match(fleetSrc, /recoveryFailStreak\+\+\n/, 'the brake still counts the consecutive failures')
  assert.match(fleetSrc, /recoveryCooldownMs\(recoveryFailStreak\) \/ 1000\)\}s`/, 'the brake still names its cooldown (the v0.52.0 shape)')
})

test('v0.261.0 wiring: ensureSurface caller census - the recovery is the FIFTH caller, the doom lift still keys on bank only', () => {
  const reasons = ['pre-position', 'bank', 'wood trip', 'trip', 'tool recovery']
  for (const r of reasons) {
    assert.ok(fleetSrc.includes(`ensureSurface('${r}'`), `the '${r}' caller exists`)
  }
  const doomIdx = fleetSrc.indexOf("if (reason === 'bank' && yardGoal && miner.bot?.entity) {")
  assert.ok(doomIdx > -1, 'the doom-lift branch still keys on the bank reason byte for byte')
  const trip = fleetSrc.indexOf("if (await ensureSurface('wood trip')) {")
  const famine = fleetSrc.indexOf('wood trip: famine (sticks ${woodPocket.sticks} planks ${woodPocket.planks} logs ${woodPocket.logs}) - gathering')
  assert.ok(trip > -1 && famine > -1 && trip > famine, 'the v0.179.0 famine trip block survives unchanged (no cross-contamination)')
})

test('v0.261.0 law: the gatherWood map-target walk prices with TRIP_WALK_MS - the 24s budget is gone', () => {
  assert.ok(!minerSrc.includes("timeoutMs: 24000, label: 'wood trip'"), 'the 24s license is revoked - a walkable-but-slow trunk must not die as unreachable')
  assert.match(minerSrc, /timeoutMs: TRIP_WALK_MS, label: 'wood trip'/, 'the walk runs the SAME proven constant mapTrip runs')
})

test('v0.261.0 law: TRIP_WALK_MS stays 45000 and mapTrip keeps it as its default - the woodplan fences are untouched', () => {
  assert.equal(TRIP_WALK_MS, 45000, 'the proven constant: 45s spans the licensed range with headroom for one detour')
  assert.match(minerSrc, /walkTimeoutMs = TRIP_WALK_MS/, "mapTrip's default stays the constant (no drift)")
})

test('v0.261.0 law: the walk stays junk-safe - the visited mark, the silent catch and the stall escape keep their shapes', () => {
  const lawIdx = minerSrc.indexOf('timeoutMs: TRIP_WALK_MS, label: \'wood trip\'')
  assert.ok(lawIdx > -1)
  const before = minerSrc.slice(lawIdx - 2200, lawIdx)
  assert.match(before, /visitedTrunks\.add\(`\$\{known\.pos\.x\},\$\{known\.pos\.z\}`\) \/\/ never loop on the same entry/, 'the visited mark still buries the target before the walk - no retry storm')
  const after = minerSrc.slice(lawIdx, lawIdx + 300)
  assert.match(after, /\} catch \{ \/\* chop whatever is in reach now \*\/ \}\n          continue/, 'the failed walk still falls through to the local chop - never throws into the loop')
  assert.match(before, /mapTargetFor\(LOG_NAMES, \{ maxDistance: 256, verify: false \}\)/, 'the map consult keeps its license and its verify=false contract')
})

test('v0.261.0 scope: the famine trip and the recovery lanes compose - the pick-less bot never enters famineDue, the tooled bot never enters recoveryDue', () => {
  assert.match(fleetSrc, /const woodVerdict = famineDue\(\{[\s\S]*?hasPick: woodPocket\.hasPick/, 'the famine trip still reads the live pick state')
  assert.match(fleetSrc, /const recoveryDueNow = \(\) => recoveryDue\(\{ hasPick: hasPickNow\(\)/, 'the recovery lane still gates on the pick state')
  assert.match(woodplanSrc, /export function famineDue[\s\S]*?if \(!hasPick\) return false/, 'famineDue refuses pick-less bots byte for byte')
  assert.match(woodplanSrc, /export function recoveryDue[\s\S]*?if \(hasPick\) return false/, 'recoveryDue refuses tooled bots byte for byte')
})

test('v0.529.0 THE UNREADABLE KIT: the pick read is junk-safe - a dead inventory reads tool-less, never reconnects the loop', () => {
  assert.ok(fleetSrc.includes("const hasPickNow = () => { try { return miner.bot.inventory.items().some(i => i.name.includes('pickaxe')) } catch { return false } }"), 'the helper carries the bankableNow byte - a dead read is the kit-gone shape the death economy already runs on, never a throw into the reconnect catch')
  assert.ok(fleetSrc.includes('const bankableNow = () => {'), 'the sibling helper stays the named pattern')
})
