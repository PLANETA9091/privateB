//
// smokeread.test.mjs - THE SMOKE VERDICT's pins (v0.505.0)
// The fixture is face 44's REAL smoke log (CI run 36987824149, the
// integration job's fleet-logs artifact, /tmp/fleet-test-7904/fleet.log,
// 49 lines) - the only fleet data CI delivered during the dispatch
// stall. Every count below was hand-traced from that artifact.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSmokeLog, parseSmokeLine, smokeGrade, smokeVerdict, stormFailLink, stripSmokeTs, SMOKE_STORM_REFUSAL_RE } from '../../src/lib/smokeread.mjs'
import { parseStormCooldown } from '../../src/lib/memhb.mjs'

// face 44's smoke log, verbatim (ts skins kept - the strip is part of the pin)
const FACE44 = [
  '2026-10-02T15:46:30.579Z [ProdTest1] flight disabled - ground mode (pathfinder + vanilla physics)',
  '2026-10-02T15:46:30.580Z [ProdTest1] rage fastbreak installed (STOP_DESTROY_BLOCK spam, destroyDelay 0)',
  '2026-10-02T15:46:30.639Z [ProdTest2] flight disabled - ground mode (pathfinder + vanilla physics)',
  '2026-10-02T15:46:30.639Z [ProdTest2] rage fastbreak installed (STOP_DESTROY_BLOCK spam, destroyDelay 0)',
  '2026-10-02T15:46:30.902Z ProdTest1 spawned at (-129, 69, 402)',
  '2026-10-02T15:46:30.904Z ProdTest2 spawned at (-134, 64, 408)',
  '2026-10-02T15:47:21.300Z [tools] planks 16 (oak:8 spruce:0 birch:2 jungle:0 acacia:0 cherry:0 dark_oak:0 pale_oak:0 mangrove:0 bamboo:0 crimson:0 warped:0) sticks 4 table 1',
  '2026-10-02T15:47:23.650Z [tools] [tools] closing stale craft window (minecraft:inventory) - grid recovery',
  '2026-10-02T15:47:25.299Z [tools] wooden: pickaxe=true shovel=true',
  '2026-10-02T15:47:25.305Z [ProdTest1] craft torches: stick-dry but 6 planks held - one stick batch first',
  '2026-10-02T15:47:25.399Z [ProdTest1] craft torches: skip (no coal: sticks 4 coals 0)',
  '2026-10-02T15:47:26.400Z [ProdTest1] digShaft: giving up this shaft (6 sidesteps, undiggable floor) - the caller rotates',
  '2026-10-02T15:47:26.401Z [tools] final: wooden_shovel, wooden_pickaxe',
  '2026-10-02T15:47:26.401Z ProdTest1 tools attempt 0: ok (wooden_pickaxe)',
  '2026-10-02T15:47:33.499Z [ProdTest2] sapling planted: oak_sapling at (-132, 64, 400) (ok)',
  '2026-10-02T15:47:33.499Z [tools] logs after gatherWood: 11 (oak:11)',
  '2026-10-02T15:47:34.201Z [tools] [tools] closing stale craft window (minecraft:inventory) - grid recovery',
  '2026-10-02T15:47:50.205Z [tools] craft stick: variant#2 attempt0 failed: craft stick: timeout after 7000ms',
  '2026-10-02T15:47:50.205Z [tools] [tools] closing stale craft window (minecraft:inventory) - grid recovery',
  '2026-10-02T15:47:50.249Z [tools] craft stick: swept 1 ghost grid slot(s) back into the inventory',
  '2026-10-02T15:47:58.251Z [tools] craft stick: variant#2 attempt1 failed: craft stick: timeout after 7000ms',
  '2026-10-02T15:47:58.251Z [tools] [tools] closing stale craft window (minecraft:inventory) - grid recovery',
  '2026-10-02T15:48:00.252Z [tools] craft stick: all 1 variant(s) failed, last: craft stick: timeout after 7000ms',
  '2026-10-02T15:48:07.253Z [tools] craft crafting_table: variant#2 attempt0 failed: craft crafting_table: timeout after 7000ms',
  '2026-10-02T15:48:07.253Z [tools] [tools] closing stale craft window (minecraft:inventory) - grid recovery',
  '2026-10-02T15:48:07.253Z [tools] craft storm: 3 consecutive craft timeouts - cooldown 4000ms (server stall?)',
  '2026-10-02T15:48:07.253Z [tools] craft crafting_table: all 1 variant(s) failed, last: craft crafting_table: timeout after 7000ms',
  '2026-10-02T15:48:07.253Z [tools] planks 8 (oak:7 spruce:0 birch:0 jungle:0 acacia:0 cherry:0 dark_oak:0 pale_oak:0 mangrove:0 bamboo:0 crimson:0 warped:0) sticks 2 table 0',
  '2026-10-02T15:48:07.254Z [tools] craft stick: storm cooldown 4000ms left (3 consecutive timeouts) - refusing',
  '2026-10-02T15:48:07.254Z [tools] sticks starved after the re-read (2/4 held, planks-best 7)',
  '2026-10-02T15:48:07.265Z [tools] [tools] closing stale craft window (minecraft:inventory) - grid recovery',
  '2026-10-02T15:48:07.275Z [tools] self-heal: table STILL missing',
  '2026-10-02T15:48:07.275Z ProdTest2 tools attempt 0: fail (no crafting table)',
  '2026-10-02T15:48:13.500Z [tools] planks 14 (oak:8 spruce:0 birch:0 jungle:0 acacia:0 cherry:0 dark_oak:0 pale_oak:0 mangrove:0 bamboo:0 crimson:0 warped:0) sticks 6 table 1',
  '2026-10-02T15:48:16.501Z [tools] wooden: pickaxe=true shovel=true',
  '2026-10-02T15:48:16.504Z [ProdTest2] craft torches: stick-dry with logs held - one plank conversion first',
  '2026-10-02T15:48:17.050Z [ProdTest2] plank rung: fell short 4->4 same-type planks (need 6, from oak_log)',
  '2026-10-02T15:48:17.050Z [ProdTest2] craft torches: stick-dry but 8 planks held - one stick batch first',
  '2026-10-02T15:48:17.200Z [ProdTest2] craft torches: skip (no coal: sticks 6 coals 0)',
  '2026-10-02T15:48:19.627Z [ProdTest2] digShaft: giving up this shaft (6 sidesteps, undiggable floor) - the caller rotates',
  '2026-10-02T15:48:19.627Z [tools] final: wooden_pickaxe, wooden_shovel',
  '2026-10-02T15:48:19.627Z ProdTest2 tools attempt 1: ok (wooden_pickaxe)',
  '2026-10-02T15:48:19.628Z mining phase: alive=2/2 window=45s pick=2',
  '2026-10-02T15:48:34.629Z window: +80 blocks (total 100)',
  '2026-10-02T15:48:49.630Z window: +33 blocks (total 133)',
  '2026-10-02T15:49:04.629Z RESULT: mined=185 failed=0 byName={"oak_log":19,"birch_log":1,"grass_block":76,"dirt":77,"stone":12}',
  '2026-10-02T15:49:04.629Z worldmap: 218 positions, 3 chunks',
  '2026-10-02T15:49:04.632Z [ProdTest1] disconnected (disconnect.quitting)',
  '2026-10-02T15:49:04.633Z [ProdTest2] disconnected (disconnect.quitting)'
]

test('face 44 mini: the named tier - two bot books, spawns, ladder, quits', () => {
  const v = smokeVerdict(FACE44)
  const names = Object.keys(v.bots).sort()
  assert.deepEqual(names, ['ProdTest1', 'ProdTest2'])
  const p1 = v.bots.ProdTest1
  const p2 = v.bots.ProdTest2
  assert.equal(p1.spawned && p2.spawned, true)
  assert.deepEqual(p1.spawn, { x: -129, y: 69, z: 402 })
  assert.deepEqual(p2.spawn, { x: -134, y: 64, z: 408 })
  assert.equal(p1.groundMode && p2.groundMode, true)
  assert.equal(p1.fastbreak && p2.fastbreak, true)
  // the ladder: P1 clean, P2 bled (attempt 0 fail -> attempt 1 ok)
  assert.deepEqual(p1.attempts, [{ attempt: 0, ok: true, kit: 'wooden_pickaxe' }])
  assert.deepEqual(p2.attempts, [
    { attempt: 0, ok: false, kit: 'no crafting table' },
    { attempt: 1, ok: true, kit: 'wooden_pickaxe' }
  ])
  assert.equal(p1.attemptFails, 0)
  assert.equal(p2.attemptFails, 1)
  // both quit clean
  assert.equal(p1.quit.clean && p2.quit.clean, true)
  // the rotations: one each, 6 sidesteps each
  assert.equal(p1.rotations, 1)
  assert.equal(p2.rotations, 1)
  assert.equal(p1.rotationSidesteps + p2.rotationSidesteps, 12)
  // P2's short plank rung and its sapling
  assert.equal(p2.plankRungShort, 1)
  assert.equal(p1.plankRungShort, 0)
  assert.equal(p2.saplings, 1)
})

test('face 44 mini: the lane tier - the craft storm anatomy, counted never attributed', () => {
  const v = smokeVerdict(FACE44)
  assert.equal(v.lane.gridRecoveries, 6)
  assert.deepEqual(v.lane.gridWindowTypes, { 'minecraft:inventory': 6 })
  assert.equal(v.lane.ghostSweeps, 1)
  assert.equal(v.lane.ghostSlots, 1)
  assert.equal(v.lane.variantFails, 3) // stick x2, crafting_table x1
  assert.equal(v.lane.variantExhausted, 2) // stick, crafting_table
  assert.equal(v.lane.stormDeclarations, 1)
  assert.equal(v.lane.stormRefusals, 1)
  assert.equal(v.lane.starvedReads, 1)
  assert.equal(v.lane.selfHealMisses, 1)
  assert.equal(v.lane.selfHealOk, 0)
  assert.equal(v.lane.finalToolLines, 2)
})

test('face 44 mini: the run book - mining, ticks, RESULT, the short worldmap tail', () => {
  const v = smokeVerdict(FACE44)
  assert.deepEqual(v.run.miningPhase, { alive: 2, total: 2, windowS: 45, picks: 2 })
  assert.deepEqual(v.run.windowTicks, [{ delta: 80, total: 100 }, { delta: 33, total: 133 }])
  assert.equal(v.run.result.mined, 185)
  assert.equal(v.run.result.failed, 0)
  assert.deepEqual(v.run.result.byName, { oak_log: 19, birch_log: 1, grass_block: 76, dirt: 77, stone: 12 })
  assert.deepEqual(v.run.worldmap, { positions: 218, chunks: 3 })
})

test('face 44 mini: the join fires (one fail, one storm) and the grade is annotated', () => {
  const v = smokeVerdict(FACE44)
  assert.equal(v.stormLinkedFails, true)
  assert.equal(v.grade, 'annotated')
})

test('the ts strip: both skins land on the same shape', () => {
  assert.equal(stripSmokeTs('2026-10-02T15:48:07.254Z [tools] craft stick: swept 1 ghost grid slot(s) back into the inventory'),
    '[tools] craft stick: swept 1 ghost grid slot(s) back into the inventory')
  assert.equal(stripSmokeTs('[tools] craft stick: swept 1 ghost grid slot(s) back into the inventory'),
    '[tools] craft stick: swept 1 ghost grid slot(s) back into the inventory')
  // a bare spawn line (no ts) parses identically
  assert.deepEqual(parseSmokeLine('ProdTest1 spawned at (1, 2, 3)'), parseSmokeLine('2026-10-02T15:00:00.000Z ProdTest1 spawned at (1, 2, 3)'))
})

test('the shape ownership split: memhb owns the F-skin, smokeread owns the smoke skin', () => {
  const bigFleet = 'F13 [tools] craft stick: storm cooldown 4000ms left (3 consecutive timeouts) - refusing'
  const smoke = '[tools] craft stick: storm cooldown 4000ms left (3 consecutive timeouts) - refusing'
  // the big-fleet skin is NOT this lib's
  assert.equal(parseSmokeLine(bigFleet), null)
  // the smoke skin is NOT memhb's
  assert.equal(parseStormCooldown(smoke), null)
  // each parser reads its own
  assert.ok(parseStormCooldown(bigFleet))
  assert.ok(SMOKE_STORM_REFUSAL_RE.test(smoke))
})

test('the worldmap short tail is owned here; fleet19\'s long tail is maptrip\'s', () => {
  assert.deepEqual(parseSmokeLine('worldmap: 218 positions, 3 chunks'), { kind: 'worldmap', positions: 218, chunks: 3 })
  assert.equal(parseSmokeLine('worldmap: 1130 positions, 17 chunks scanned, top: coal_ore=291 oak_log=244 sand=226 copper_ore=189 birch_log=78'), null)
})

test('the join law: false when nothing to blame, null when the interleaving refuses', () => {
  const one = smokeVerdict([
    'ProdTest1 spawned at (0, 64, 0)',
    'ProdTest1 tools attempt 0: fail (no crafting table)',
    'ProdTest1 tools attempt 1: ok (wooden_pickaxe)',
    '[ProdTest1] disconnected (disconnect.quitting)'
  ])
  assert.equal(one.lane.stormDeclarations, 0)
  assert.equal(stormFailLink(one), false)
  const two = smokeVerdict([
    'ProdTest1 spawned at (0, 64, 0)',
    'ProdTest2 spawned at (1, 64, 1)',
    'ProdTest1 tools attempt 0: fail (no crafting table)',
    'ProdTest2 tools attempt 0: fail (no crafting table)',
    'ProdTest1 tools attempt 1: ok (wooden_pickaxe)',
    'ProdTest2 tools attempt 1: ok (wooden_pickaxe)',
    '[tools] craft storm: 3 consecutive craft timeouts - cooldown 4000ms (server stall?)',
    '[ProdTest1] disconnected (disconnect.quitting)',
    '[ProdTest2] disconnected (disconnect.quitting)'
  ])
  assert.equal(stormFailLink(two), null) // two fails, one storm - unknowable
  assert.equal(stormFailLink(null), null)
})

test('the grade classes: clean exists, hurt has four doors', () => {
  const clean = smokeVerdict([
    'ProdTest1 spawned at (0, 64, 0)',
    'ProdTest1 tools attempt 0: ok (wooden_pickaxe)',
    'mining phase: alive=1/1 window=45s pick=1',
    'RESULT: mined=5 failed=0 byName={"dirt":5}',
    'worldmap: 10 positions, 1 chunks',
    '[ProdTest1] disconnected (disconnect.quitting)'
  ])
  assert.equal(clean.grade, 'clean')
  assert.equal(stormFailLink(clean), null) // zero fails - no fail exists to link, the join refuses

  // the failed>0 door
  const failed = smokeVerdict([
    'ProdTest1 spawned at (0, 64, 0)',
    'mining phase: alive=1/1 window=45s pick=1',
    'RESULT: mined=5 failed=2 byName={"dirt":5}',
    '[ProdTest1] disconnected (disconnect.quitting)'
  ])
  assert.equal(smokeGrade(failed), 'hurt')
  // the short-mining door
  const short = smokeVerdict([
    'ProdTest1 spawned at (0, 64, 0)',
    'ProdTest2 spawned at (1, 64, 1)',
    'mining phase: alive=1/2 window=45s pick=1',
    'RESULT: mined=5 failed=0 byName={"dirt":5}',
    '[ProdTest1] disconnected (disconnect.quitting)',
    '[ProdTest2] disconnected (disconnect.quitting)'
  ])
  assert.equal(smokeGrade(short), 'hurt')
  // the dirty-quit door
  const dirty = smokeVerdict([
    'ProdTest1 spawned at (0, 64, 0)',
    'mining phase: alive=1/1 window=45s pick=1',
    'RESULT: mined=5 failed=0 byName={"dirt":5}',
    '[ProdTest1] disconnected (connection reset)'
  ])
  assert.equal(smokeGrade(dirty), 'hurt')
  // the absent door - a spawned bot with no quit line at all
  const absent = smokeVerdict([
    'ProdTest1 spawned at (0, 64, 0)',
    'ProdTest2 spawned at (1, 64, 1)',
    'mining phase: alive=2/2 window=45s pick=2',
    'RESULT: mined=5 failed=0 byName={"dirt":5}',
    '[ProdTest1] disconnected (disconnect.quitting)'
  ])
  assert.equal(smokeGrade(absent), 'hurt')
})

test('the join law\'s zero-fail edge: fails=0 reads null (no fail exists to link)', () => {
  const zero = smokeVerdict([
    'ProdTest1 spawned at (0, 64, 0)',
    'ProdTest1 tools attempt 0: ok (wooden_pickaxe)',
    '[tools] craft storm: 3 consecutive craft timeouts - cooldown 4000ms (server stall?)',
    '[ProdTest1] disconnected (disconnect.quitting)'
  ])
  assert.equal(zero.bots.ProdTest1.attemptFails, 0)
  assert.equal(stormFailLink(zero), null)
})

test('the junk battery: garbage reads as nothing, never a throw', () => {
  const junk = [null, undefined, 42, {}, [], '', '   ', 'craft storm: 3 consecutive',
    'RESULT: mined=1 failed=0 byName={"broken', 'ProdTest1 spawned at (x, y, z)',
    '[tools] craft stick: swept MANY ghost grid slot(s) back into the inventory',
    '[tools] self-heal: table KINDA missing', 'worldmap: many positions, some chunks']
  const v = smokeVerdict(junk)
  assert.equal(Object.keys(v.bots).length, 0)
  assert.equal(v.lane.gridRecoveries + v.lane.stormDeclarations + v.lane.ghostSweeps, 0)
  assert.equal(v.run.result, null)
  assert.equal(v.run.worldmap, null)
  assert.equal(v.grade, 'clean') // nothing hurt, nothing bled - silence grades clean
  assert.equal(parseSmokeLog('not an array'), null)
  assert.ok(smokeVerdict([])) // empty array is a valid (silent) run - object returned
  assert.equal(smokeGrade(null), null)
})

test('empty input is a silent clean run, not an error', () => {
  const v = smokeVerdict([])
  assert.ok(v && typeof v === 'object')
  assert.equal(v.grade, 'clean')
  assert.deepEqual(v.run.windowTicks, [])
})
