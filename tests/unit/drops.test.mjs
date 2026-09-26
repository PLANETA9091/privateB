// Drop-collection targets (v0.173.0): dropTargets' contract + the vein sweep
// wiring. The measured reason - run74's F13 vein sweep dug 9 ores and its pocket
// read ZERO coal at every snapshot: an ore's drop lands inside the freed cell,
// 2-4 blocks away, beyond the ~1.5-block auto-pickup radius, and the sweep was
// the fleet's only digger that never walked its drops (sweep() and chopReachable
// both do). coal_ore=175 mined fleet-wide, ~23 in pockets - the fuel front
// starved between the dig and the pocket.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { dropTargets, SWEEP_DROP_REACH, SWEEP_DROP_CAP, SWEEP_DROP_TIMEOUT_MS, SWEEP_DROP_TOTAL_MS } from '../../src/lib/drops.mjs'

const pos = (x, y, z) => ({ x, y, z })
const item = (x, y, z, name = 'item') => ({ name, position: pos(x, y, z) })
const FROM = pos(100, 50, 100)

test('dropTargets: the plain-object entity index (bot.entities IS a plain object - the v0.172.0 lesson)', () => {
  const entities = { // mineflayer's index shape: numeric string keys, values are entities
    12: item(101, 50, 100), // 1.0 away
    13: item(100, 50, 103), // 3.0 away
    14: item(104, 50, 100) // 4.0 away
  }
  const t = dropTargets(entities, FROM)
  assert.equal(t.length, 3)
  assert.deepEqual(t[0], pos(101, 50, 100), 'nearest first - the walk the bot is already facing')
  assert.deepEqual(t[1], pos(100, 50, 103))
  assert.deepEqual(t[2], pos(104, 50, 100))
})

test('dropTargets: an array of entities works the same', () => {
  const t = dropTargets([item(102, 50, 100), item(101, 50, 100)], FROM)
  assert.equal(t.length, 2)
  assert.deepEqual(t[0], pos(101, 50, 100))
})

test('dropTargets: maxDistance filters, cap truncates the nearest', () => {
  const entities = [item(103, 50, 100), item(102, 50, 100), item(101, 50, 100), item(100, 50, 104)]
  assert.equal(dropTargets(entities, FROM, { maxDistance: 2.5 }).length, 2, 'only the <=2.5 family')
  const capped = dropTargets(entities, FROM, { cap: 2 })
  assert.equal(capped.length, 2)
  assert.deepEqual(capped[0], pos(101, 50, 100), 'the cap keeps the NEAREST')
  assert.deepEqual(capped[1], pos(102, 50, 100))
  assert.equal(dropTargets(entities, FROM).length, 4, 'defaults keep everything within reach')
  assert.ok(SWEEP_DROP_REACH === 8 && SWEEP_DROP_CAP === 8, 'the sweep constants pin')
  // (v0.186.0) the probe half-step: the 4s walk budget covers the worst honest
  // walk (reach 8 blocks x the 2x detour x 500ms/block = 4s, the CHEST_WALK
  // arithmetic) and lets the 24s fence fit 6 probes; the total stays 24s
  assert.ok(SWEEP_DROP_TIMEOUT_MS === 4000 && SWEEP_DROP_TOTAL_MS === 24000, 'the walk budgets pin (the v0.186.0 probe half-step)')
  assert.ok(SWEEP_DROP_TIMEOUT_MS * 2 === 8000, 'the probe is HALF the legacy 8s - the doom class burns half')
  assert.ok(SWEEP_DROP_TOTAL_MS / SWEEP_DROP_TIMEOUT_MS === 6, 'the fence fits 6 probes (was 3)')
  assert.ok(SWEEP_DROP_REACH * 500 === SWEEP_DROP_TIMEOUT_MS, 'the probe covers the reach-8 walk at the house 500ms/block (the 2x detour is inside the 500ms, the CHEST_WALK arithmetic)')
})

test('dropTargets: non-item entities are skipped (mob, arrow, xp orb classes)', () => {
  const entities = [
    { name: 'zombie', position: pos(101, 50, 100) },
    { name: 'experience_orb', position: pos(101, 50, 101) },
    item(100, 50, 102)
  ]
  const t = dropTargets(entities, FROM)
  assert.equal(t.length, 1)
  assert.deepEqual(t[0], pos(100, 50, 102))
})

test('dropTargets: the junk battery never throws, never claims a drop', () => {
  assert.deepEqual(dropTargets(null, FROM), [])
  assert.deepEqual(dropTargets(undefined, FROM), [])
  assert.deepEqual(dropTargets(42, FROM), [])
  assert.deepEqual(dropTargets('items', FROM), [])
  assert.deepEqual(dropTargets([null, 3, 'x', {}, { name: 'item' }, { name: 'item', position: { x: 'a', y: 1, z: 1 } }], FROM), [],
    'junk entries and nameless/positionless items are skipped')
  assert.deepEqual(dropTargets([item(101, 50, 100)], null), [], 'a junk collector position yields []')
  assert.deepEqual(dropTargets([item(101, 50, 100)], { x: NaN, y: 1, z: 1 }), [], 'a NaN position yields []')
  assert.deepEqual(dropTargets([item(NaN, 50, 100), item(Infinity, 50, 100), item(101, 50, 100)], FROM).length, 1,
    'non-finite drop coordinates are skipped, the finite one stays')
})

// ---- THE WIRING PINS: the sweep must WALK what it digs ----

test('REGRESSION PIN: the vein sweep harvests its drops (the v0.173.0 cure)', async () => {
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const sweepAt = minerSrc.indexOf('async function veinSweep')
  assert.ok(sweepAt > 0, 'veinSweep found in miner.mjs')
  const boreAt = minerSrc.indexOf('async function bore (')
  assert.ok(boreAt > sweepAt, 'the sweep body region is bracketed')
  const sweepBody = minerSrc.slice(sweepAt, boreAt)
  assert.ok(sweepBody.includes('dropTargets(bot.entities'), 'the sweep reads the plain-object entity index through the pure pick')
  assert.ok(sweepBody.includes("'sweep drops'"), 'the drop walk labels itself for the run logs')
  assert.ok(sweepBody.includes('SWEEP_DROP_TOTAL_MS'), 'the drop walk is fenced by a total budget')
  assert.ok(sweepBody.includes('SWEEP_DROP_TIMEOUT_MS'), 'each drop walk has its own short timeout')
  assert.ok(sweepBody.includes('inventoryLoad(bot).units'), 'the pickup read is the honest pocket delta')
  assert.ok(sweepBody.includes('walked from the drops'), 'the harvest names itself for the run logs')
  assert.ok(sweepBody.includes('map?.take(blk.name, pos)'), 'a swept ore leaves the shared map (no re-steer at a mined-out cell)')
})

test('REGRESSION PIN: the tunnel keeps the same map hygiene (the steer eats its own records)', async () => {
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const tunnelAt = minerSrc.indexOf('async function tunnel (')
  assert.ok(tunnelAt > 0, 'tunnel found in miner.mjs')
  const sweepAt = minerSrc.indexOf('async function veinSweep')
  const tunnelBody = minerSrc.slice(tunnelAt, sweepAt)
  assert.ok(tunnelBody.includes("map?.take(feetB.name, feetCell)"), 'the feet cell leaves the map')
  assert.ok(tunnelBody.includes('map?.take(headB.name, feetCell.offset(0, 1, 0))'), 'the head cell leaves the map')
  // the import rides along - a missing import would throw the whole miner at boot
  assert.ok(minerSrc.includes("from '../lib/drops.mjs'"), 'the drops import is present in miner.mjs')
})

// ---- (v0.175.0) THE SWEEP DROP INSTRUMENT ----
// run64 (36118883464): the v0.173.0 drop walk fired ZERO '+Nu walked' lines
// across 29 sweeps (2-14 ores dug each) - and the walk is silent BOTH when
// dropTargets sees nothing AND when every gotoSafe refuses into the silent
// catch. The diag on the live testbed (testbed/diag-item-entities.mjs)
// proved the item entities ARE tracked and named ('item', type=other), so
// the pick filter is fine - the missing piece is the VERDICT.

test('REGRESSION PIN: the sweep names its drop verdicts (the v0.175.0 instrument)', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(/vein sweep: \$\{targets\.length\} drop\(s\) in reach/.test(minerSrc),
    'the sweep names the drop-target count once per sweep (the [] vs refused split)')
  assert.ok(/the drop walk to \[\$\{Math\.round\(d\.x\)\}/.test(minerSrc),
    'the walk failures name the cell and the refusal message (the doomed-goal / governor / water-rescue gate becomes readable)')
  assert.ok(/the drop walks picked nothing \(pocket delta 0, \$\{dropFails\} failed walk\(s\)\)/.test(minerSrc),
    'the zero-pickup end names itself with the failure count')
  assert.ok(/if \(dropFails < 2\)/.test(minerSrc), 'the failure log is bounded (2 per sweep)')
  assert.ok(/const targets = dropTargets\(bot\.entities, bot\.entity\?\.position, \{ maxDistance: SWEEP_DROP_REACH, cap: SWEEP_DROP_CAP \}\)/.test(minerSrc),
    'the pick call shape unchanged (the read runs once per sweep, not per drop)')
})

test('diag-item-entities: the diag script exists for the next blind-run question', async () => {
  const fs = await import('node:fs')
  const diag = fs.readFileSync(new URL('../../testbed/diag-item-entities.mjs', import.meta.url), 'utf8')
  assert.ok(/entitySpawn/.test(diag), 'the diag hooks the spawn events')
  assert.ok(/name !.*== .player.|e\.name/.test(diag.replace(/\s/g, ' ')) || /e\.name/.test(diag), 'the diag dumps the entity names')
})

test('REGRESSION PIN: the fleet log filter carries the sweep key (the v0.176.0 filter-blind lesson)', async () => {
  const fs = await import('node:fs')
  const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // (v0.188.0) the chest skip key joined the filter (the hop vertical doom
  // gate's line + the three ledger skips the filter had kept invisible) - the
  // pin tolerates its presence beside hop while still pinning the sweep key.
  // (v0.199.0) 'death drop' joins between died and KICKED - the pin carries it.
  assert.ok(/combat\|died\|(death drop\|)?KICKED\|error\|climb\|water\|scan:\|hop\|(chest skip\|)?approach\|swallowed\|bank \|deposit\|torch\|craft\|smelt\|fuel\|vein sweep/.test(fleetSrc),
    'the miner log filter includes the vein sweep prefix - the instrument lines must reach the artifact (the v0.56.0 hop-failed lesson, struck again by the v0.175.0 instrument: the count line matched NOTHING and the failure lines only rode the luck of water inside one refusal message)')
  // the instrument line shapes all start with the key
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  for (const shape of ['vein sweep: ${targets.length} drop(s) in reach', 'vein sweep: the drop walk to', 'vein sweep: +${picked}u walked from the drops', 'vein sweep: the drop walks picked nothing']) {
    assert.ok(minerSrc.includes(shape), `the instrument line rides the filter key: ${shape}`)
  }
})

// ---- (v0.176.0) THE FILTER PIN ----
// fleet 36125422448 (the v0.175.0 instrument's first field run): 3 of the 4
// instrument line classes matched NONE of the harness log filter's keywords
// and never reached the artifact - only the fail lines that happened to say
// 'water' survived (5 visible), every count/success/zero-pickup line was
// eaten. The v0.41.1 filter-blind class, measured twice now. The pin reads
// the harness's filter regex out of the source and tests the FOUR instrument
// shapes against it - a future keyword rename that re-blinds the instrument
// fails here, not in another blind fleet run.
test("REGRESSION PIN: the harness log filter passes the sweep instrument (the v0.176.0 un-blinding, this lane's pin beside the other lane's)", async () => {
  const fs = await import('node:fs')
  const harnessSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const filterMatch = harnessSrc.match(/if \(\/([^/]+)\/\.test\(m\)\) console\.log\(`\$\{name\} \$\{m\}`\)/)
  assert.ok(filterMatch, 'the bot-log filter regex found in fleet19.mjs')
  const filter = new RegExp(filterMatch[1])
  assert.ok(filter.test('[F14] vein sweep: 3 drop(s) in reach (2 dug)'),
    'the count line reaches the artifact (the [] vs refused split is readable)')
  assert.ok(filter.test('[F14] vein sweep: the drop walk to [-136,47,415] failed - doomed goal (ledgered 5s ago) - sweep drops refused'),
    'a fail line passes even WITHOUT a filter keyword inside the refusal message')
  assert.ok(filter.test('[F14] vein sweep: +7u walked from the drops (5 dug)'),
    'the success line reaches the artifact (the conversion read)')
  assert.ok(filter.test('[F14] vein sweep: the drop walks picked nothing (pocket delta 0, 2 failed walk(s))'),
    'the zero-pickup end reaches the artifact')
})

// ---- (v0.178.0) THE DROP GOAL RANGE ----
// MEASURED (fleet 36131508220, the v0.177.0 run): the v0.173.0 harvest CONVERTS
// (32 '+Nu walked', 267 ores swept) but x33 of the 52 failed walks were
// 'sweep drops: timeout after 8000ms' - an 8s budget for a 2-8 block walk means
// GoalNear range 1's 3D sphere (dx^2+dy^2+dz^2 <= 1) held NO standable cell:
// the drop rested 1-2 BELOW the walk plane (in the freed cell / down the fresh
// shaft), the only standable cells were the gallery lip above, and every
// recompute spiraled into the timeout. The below-plane drops walk range 2.
import { dropGoalRange, lipDigWanted, LIP_DIG_MAX_AIR, DROP_GOAL_PLANE, DROP_GOAL_BELOW, DROP_GOAL_BELOW_DY, DROP_GOAL_ABOVE, DROP_GOAL_ABOVE_DY, DROP_GOAL_DEEP_DY, DROP_GOAL_SKIP } from '../../src/lib/drops.mjs'

test('dropGoalRange: at/above the walk plane keeps the legacy tight goal (the walk INTO the magnet)', () => {
  assert.equal(dropGoalRange({ dy: 0 }), DROP_GOAL_PLANE, 'a level drop - the flat gallery converges into the magnet')
  assert.equal(dropGoalRange({ dy: 0.5 }), DROP_GOAL_ABOVE, 'RE-PINNED v0.189.0: half a block up is the measured ledge family (the +0.2 field class) - the flat legacy only holds AT the plane')
  assert.equal(dropGoalRange({ dy: 1 }), DROP_GOAL_ABOVE, 'RE-PINNED v0.189.0: the measured head-height ledge class walks the wide goal')
  assert.equal(dropGoalRange({ dy: 2.5 }), DROP_GOAL_ABOVE, 'RE-PINNED v0.189.0: the above-plane ledge class is MEASURED now (fleet 36191851635: dy +1.0 x6, +2.0 x3, +4.0) - the mirror cure ships')
  assert.equal(dropGoalRange({ dy: -1 }), DROP_GOAL_BELOW, 'RE-PINNED v0.191.0: exactly -1 is the measured one-below class (run190: x9 timeouts + the No-path + the doomed on SEVEN bots) - it joins the lip sphere')
})

test('dropGoalRange: a drop resting BELOW the walk plane gets the wide goal (the lip counts as arrival)', () => {
  assert.equal(dropGoalRange({ dy: -1.01 }), DROP_GOAL_BELOW, 'just below the fence widens')
  assert.equal(dropGoalRange({ dy: -1.5 }), DROP_GOAL_BELOW, 'the freed-cell class (3D dist ~1.8 from the lip <= 2)')
  assert.equal(dropGoalRange({ dy: -1.99 }), DROP_GOAL_BELOW, 'the lip sphere still reaches (sqrt(1.99^2 + h^2) <= 2 for h <= ~0.4)')
  assert.equal(dropGoalRange({ dy: -2 }), DROP_GOAL_BELOW, 'exactly -2.0 stays BELOW (the sphere edge: sqrt(4+0) = 2.0 <= 2.0)')
})

// ---- (v0.182.0) THE DEEP SKIP ----
// MEASURED (fleet 36161088876, the v0.181.0 run): the below-plane residue line
// named x10 'the drop rests deeper than the lip' - the range-2 walks for those
// drops NEVER converged once (3D dist > 2.0 from every standable lip cell),
// x41 timeouts across 43 sweeps. The deep class now walks NOTHING.
test('dropGoalRange: a drop DEEPER than the lip sphere reaches skips the walk (the guaranteed spiral class)', () => {
  assert.equal(dropGoalRange({ dy: -2.01 }), DROP_GOAL_SKIP, 'past the sphere edge: sqrt(2.01^2 + 0) > 2')
  assert.equal(dropGoalRange({ dy: -2.5 }), DROP_GOAL_SKIP, 'the v0.178.0-era BELOW case re-measured: the x10 residue never converged once')
  assert.equal(dropGoalRange({ dy: -3 }), DROP_GOAL_SKIP, 'down the shaft')
  assert.equal(DROP_GOAL_SKIP, 0, 'the skip verdict is 0 - a range the GoalNear must never see')
})

test('dropGoalRange: junk input returns the legacy 1 - a missing read never widens a goal, never skips a walk', () => {
  for (const junk of [NaN, Infinity, -Infinity, 'x', null, undefined, {}, []]) {
    assert.equal(dropGoalRange({ dy: junk }), DROP_GOAL_PLANE, `dy=${String(junk)} -> the legacy tight goal`)
  }
  assert.equal(dropGoalRange(), DROP_GOAL_PLANE, 'no argument at all -> the legacy tight goal')
})

test('dropGoalRange: the constants pin (the planner is the ONLY range source)', () => {
  assert.equal(DROP_GOAL_PLANE, 1, 'the tight goal is the byte-identical legacy range')
  assert.equal(DROP_GOAL_BELOW, 2, 'the wide goal - the lip sphere (dy -1.5 + horizontal 1.0 = 1.8) converges')
  assert.equal(DROP_GOAL_ABOVE, 2, 'the above goal shares the same wide sphere (the ledge floor is a legal arrival - the v0.189.0 mirror)')
  assert.equal(DROP_GOAL_ABOVE_DY, 0, 'the ledge fence: strictly above the walk plane')
  assert.equal(DROP_GOAL_BELOW_DY, -0.5, 'RE-PINNED v0.191.0: the fence edge sits in the measured gap (the flat family reads >= 0, the one-below cell reads -0.7..-1.0) - was -1, the run190 class sat exactly at that edge')
  assert.equal(DROP_GOAL_DEEP_DY, -2, 'the deep fence: strictly below -2 the lip sphere cannot reach')
})

test("REGRESSION PIN: the miner's drop walk reads the planner and names the below-plane verdict", async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const dyWalk = d.y - bot.entity.position.y'),
    'the walk reads the per-drop dy once (the v0.187.0 dy instrument rides the same read)')
  assert.ok(src.includes('dropGoalRange({ dy: dyWalk })'),
    'the walk goal range comes from the planner (per-drop dy, not a constant)')
  assert.ok(src.includes('new goals.GoalNear(d.x, d.y, d.z, range)'),
    'the GoalNear rides the planned range')
  assert.ok(src.includes('if (range === DROP_GOAL_SKIP) { skipDeep++; continue }'),
    'the deep verdict skips the walk before gotoSafe (no 8s spiral, no GoalNear with range 0)')
  assert.ok(src.includes('if (range === DROP_GOAL_BELOW) belowFails++'),
    'a failed wide-goal walk joins the below-plane verdict, not the generic fail count')
  assert.ok(src.includes('below-plane walk(s) still failed on the wide goal (range 2)'),
    'the verdict names itself under the instrument prefix (rides the v0.176.0 filter)')
  assert.ok(src.includes('deep drop(s) skipped (dy < -2'),
    'the skip verdict names itself under the instrument prefix too')
})

// ---- v0.187.0 (renumbered 0.186.0 -> 0.187.0 on collision #14 - the 04:30 lane's c4c6abc THE SWEEP DROP PROBE HALF-STEP landed first and owns 0.186.0): THE LIP DIG-DOWN - the range-2 arrival's last mile.
// MEASURED (fleet 36181152847, the triple-union run): 11 sweeps ended 'the
// drop walks picked nothing (pocket delta 0)' and x8 of them logged ZERO
// failed walks - the BELOW-class walks CONVERGED on the lip (the v0.178.0
// legal arrival, 3D dist ~1.8-2.0) but the pickup magnet reaches ~1.5, so
// the drop rode the despawn outside reach. The cure: after a converged
// BELOW walk, dig the ONE solid block under the lip stance - the bot drops
// into the hole, the drop is at its feet. Every guard is a measured fence;
// every input must be MEASURED (a missing read never arms an action).

test('lipDigWanted: a converged BELOW-class lip arrival with a measured dry 1-2 fall digs (the last mile)', () => {
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: -1.5 }), true)
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 2, fluidBelow: false, dy: -1.7 }), true)
})

test('lipDigWanted: the plane class never digs (it converges INTO the magnet already)', () => {
  assert.equal(lipDigWanted({ range: DROP_GOAL_PLANE, airBelow: 1, fluidBelow: false, dy: 0 }), false)
  assert.equal(lipDigWanted({ range: DROP_GOAL_SKIP, airBelow: 1, fluidBelow: false, dy: -3 }), false)
  assert.equal(lipDigWanted({ airBelow: 1, fluidBelow: false, dy: -1.5 }), false, 'a missing range refuses')
})

test('lipDigWanted: the ABOVE family never digs (the v0.189.0 family fence - ABOVE shares the wide 2, the drop is UP)', () => {
  assert.equal(lipDigWanted({ range: DROP_GOAL_ABOVE, airBelow: 1, fluidBelow: false, dy: 1.5 }), false,
    'a ledge arrival must not open the gallery floor')
  assert.equal(lipDigWanted({ range: DROP_GOAL_ABOVE, airBelow: 2, fluidBelow: false, dy: 4.0 }), false,
    'the far-ledge class never digs')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: 0.5 }), false,
    'a below-range walk with an at/above-plane dy is the family fence refusing - the dy is the family, not the range number')
})

test('lipDigWanted: the fall fence - a sealed floor and a deep shaft refuse, the 1/2 window digs', () => {
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 0, fluidBelow: false, dy: -1.5 }), false,
    'air 0 = a sealed floor - nothing to fall into')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 3, fluidBelow: false, dy: -1.5 }), false,
    'air 3+ = the deep class the walk already refuses - no blind descent')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 2.9, fluidBelow: false, dy: -1.5 }), true,
    'a fractional air read floors to 2 - the fence edge stays inside')
})

test('lipDigWanted: the wet guard - a fluid strike refuses, and an UNMEASURED guard refuses too (the v0.86.0 lesson)', () => {
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: true, dy: -1.5 }), false,
    'a measured strike refuses the dig-under')
  for (const junk of [undefined, null, 0, 1, 'dry', NaN]) {
    assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: junk, dy: -1.5 }), false,
      `fluidBelow=${String(junk)} is not the explicit false a dig requires`)
  }
})

test('lipDigWanted: the junk battery - a missing read never arms an action (the doctrine inverted for an actuator)', () => {
  for (const junk of [NaN, Infinity, -Infinity, 'x', null, {}, []]) {
    assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: junk, fluidBelow: false, dy: -1.5 }), false,
      `airBelow=${String(junk)} refuses the dig`)
  }
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: NaN }), false,
    'a junk dy refuses - the drop is not measured inside the lip sphere')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false }), false,
    'a missing dy refuses')
})

test('lipDigWanted: the deep fence holds - a drop outside the lip sphere never buys a dig', () => {
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: -2.1 }), false)
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: -2.0 }), true,
    'dy exactly -2.0 stays inside (the sphere edge, the v0.182.0 boundary)')
})

test('lipDigWanted: the constants pin', () => {
  assert.equal(LIP_DIG_MAX_AIR, 2, 'the dig-under buys a 1-2 fall - the below class IS a 1-2 deep freed cell')
})

test("REGRESSION PIN: the miner's lip dig-down reads the verdict and names itself (the v0.187.0 wiring)", async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes("lipDigWanted, DROP_GOAL_BELOW"), 'the dig-down verdict is imported with the walk family')
  const landedAt = src.indexOf('let landed = false')
  const digAt = src.indexOf('if (landed && dyWalk < DROP_GOAL_BELOW_DY && dyWalk >= DROP_GOAL_DEEP_DY) {')
  assert.ok(landedAt > 0 && digAt > landedAt, 'the dig-under gates on the CONVERGED below-family walk only (the dy family, not the range number - the v0.189.0 ABOVE shares the wide 2)')
  const gateAt = src.indexOf('lipDigWanted({ range, airBelow, fluidBelow: strike !== null, dy: dyLip })')
  assert.ok(gateAt > digAt, 'the verdict gates the dig (the probes feed it, nothing is hardcoded)')
  assert.ok(src.includes('dropAheadBelow(feet, { depth: 3 })'), 'the fall column is the measured probe (zero reads report the worst)')
  assert.ok(src.includes('fluidStrikeBelow(feet, { depth: 3 })'), 'the wet read is its own guard (fluids count as empty to the air probe)')
  assert.ok(src.includes('await bot.fastDig(cover); lipDigs++'), 'the dig-under digs the cover block and counts')
  assert.ok(src.includes('lip dig-down(s) - the range-2 arrival left the drop outside the magnet'),
    'the verdict names itself under the instrument prefix (rides the v0.176.0 filter)')
  assert.ok(/failed - \$\{e\.message\} \(dy \$\{dyWalk\.toFixed\(1\)\}, range \$\{range\}\)/.test(src),
    'the failed-walk line carries the (dy, range) instrument - the next decode splits the timeout class')
})

// ---- v0.189.0 (renumber-free - the next free patch after the 05:00 lane's
// v0.188.0 hop gate): THE ABOVE-PLANE LEDGE GOAL - the v0.178.0 sphere
// arithmetic mirrored up, now measured by the (dy, range) instrument's own
// field debut (fleet 36191851635): 47 failed walks split x42 plane-range vs
// x5 below, and the plane family's dy values are OVERWHELMINGLY ABOVE the
// walk plane (+1.0 x6, +1.2, +2.0 x3, +2.1, +4.0 - the head-height ledge
// drops the bot cannot stand on). A drop 1+ above the plane at range 1 is
// the SAME no-standable-cell-in-the-sphere shape v0.178.0 cured below: the
// drop's own cell is at head height against the gallery ceiling, the
// adjacent floor lip reads 3D dist ~1.6 > 1.0 - the walk spirals. THE CURE:
// dy > 0 walks range 2 (the floor beside/below the ledge is a legal arrival
// AND the drop at torso/head height overlaps the bot's body column, so the
// ~1.5 pickup magnet covers it on arrival - the above class needs no
// dig-down; its last mile is the bot's own bbox). The dig-under gate in the
// miner re-fences to the BELOW dy family (ABOVE shares the wide 2 - a
// range-only check would arm the dig for ledges).

test('dropGoalRange: a drop resting ABOVE the walk plane gets the wide goal (the ledge floor counts as arrival)', () => {
  assert.equal(dropGoalRange({ dy: 0.1 }), DROP_GOAL_ABOVE, 'just above the plane - the measured +0.2 class')
  assert.equal(dropGoalRange({ dy: 1.0 }), DROP_GOAL_ABOVE, 'the measured head-height ledge class (x6 in the field)')
  assert.equal(dropGoalRange({ dy: 2.0 }), DROP_GOAL_ABOVE, 'the measured 2-up class (x3)')
  assert.equal(dropGoalRange({ dy: 4.0 }), DROP_GOAL_ABOVE, 'the measured far-ledge class - the wide goal costs no more than the doomed range-1 spiral')
  assert.equal(dropGoalRange({ dy: 0 }), DROP_GOAL_PLANE, 'dy exactly 0.0 stays the legacy tight goal (the flat family converges INTO the magnet)')
})

test('dropGoalRange: the fence-edge below family walks the wide goal (the v0.191.0 measured class)', () => {
  // run190 (fleet 36195869446): dy -1.0 x9 timeouts + x1 'No path' + x1 doomed,
  // dy -0.7 x3 - the drop rests in the cell ONE BELOW the walk plane, sealed
  // from above by the gallery floor: the range-1 ball holds no standable cell
  // (every plane stance reads sqrt(lateral^2 + 1^2) >= sqrt(2) > 1.0) - the
  // v0.178.0 spiral shape one fence-row lower than the -1 sample.
  assert.equal(dropGoalRange({ dy: -0.7 }), DROP_GOAL_BELOW, 'the one-below cell with the entity lift joins the lip sphere')
  assert.equal(dropGoalRange({ dy: -1.0 }), DROP_GOAL_BELOW, 'the one-below cell at the old fence edge joins the lip sphere')
  assert.equal(dropGoalRange({ dy: -0.4 }), DROP_GOAL_PLANE, 'between the flat family and the new edge stays tight - nothing measured rides it')
})

test('lipDigWanted: the fence-edge below class arms the dig once it converges (the v0.187.0 window opens)', () => {
  // the dig-down's family fence reads the SAME constant: a converged -0.7/-1.0
  // lip arrival is the BELOW family now - the last mile digs.
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: -0.7 }), true,
    'the measured one-below cell: converge on the lip, then dig the last mile')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: -1.0 }), true,
    'the old fence edge: the family fence follows the constant')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: -0.5 }), false,
    'the new edge itself stays the plane family (converges into the magnet - no dig)')
})

test('dropGoalRange: the fence boundaries hold across all four verdicts (the plane/below/deep/above map)', () => {
  assert.equal(dropGoalRange({ dy: -0.1 }), DROP_GOAL_PLANE, 'just below zero is still the flat family')
  assert.equal(dropGoalRange({ dy: -0.5 }), DROP_GOAL_PLANE, 'the new fence edge itself reads plane (the fence is strict: dy < -0.5 widens)')
  assert.equal(dropGoalRange({ dy: -0.7 }), DROP_GOAL_BELOW, 'the measured one-below cell with the entity lift (run190 x3)')
  assert.equal(dropGoalRange({ dy: -1.0 }), DROP_GOAL_BELOW, 'RE-PINNED v0.191.0: dy exactly -1.0 is the measured fence-edge class (run190 x12 walks) - the old v0.178.0 edge row retired by measurement')
  assert.equal(dropGoalRange({ dy: -1.1 }), DROP_GOAL_BELOW, 'the below family keeps its wide goal')
  assert.equal(dropGoalRange({ dy: -2.0 }), DROP_GOAL_BELOW, 'the sphere edge stays BELOW (the v0.182.0 boundary)')
  assert.equal(dropGoalRange({ dy: -2.1 }), DROP_GOAL_SKIP, 'the deep class still skips')
  assert.equal(dropGoalRange({ dy: 0.0 }), DROP_GOAL_PLANE, 'the flat edge stays the legacy')
})
