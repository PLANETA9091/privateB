// Torch policy - pure maths, verified by arithmetic (no bot, no server).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TORCH_SPACING, MIN_SHAFT_LIGHT, RESERVED_STICKS, TORCH_WALL_BASE_DIRS,
  torchesCraftable, torchCraftPlan, torchDue, countTorches, torchWallDirs,
  torchRestockWanted, metalFuelReserve, METAL_FUEL_CAP, TORCH_POCKET_CAP
} from '../../src/lib/torch.mjs'

test('torchesCraftable: vanilla yield is 4 torches per stick+coal pair', () => {
  assert.equal(torchesCraftable(0, 0), 0)
  assert.equal(torchesCraftable(1, 1), 4)
  assert.equal(torchesCraftable(5, 3), 12) // coal limits: 3 pairs
  assert.equal(torchesCraftable(3, 5), 12) // sticks limit: 3 pairs
  assert.equal(torchesCraftable(10, 10), 40)
})

test('torchesCraftable: junk telemetry counts as zero, never poisons the plan', () => {
  assert.equal(torchesCraftable(undefined, 3), 0)
  assert.equal(torchesCraftable(2, null), 0)
  assert.equal(torchesCraftable(NaN, 3), 0)
  assert.equal(torchesCraftable(2, Infinity), 0) // non-finite counts as zero, not as infinite coal
  assert.equal(torchesCraftable(-4, 3), 0)
  assert.equal(torchesCraftable(2.9, 3.9), 8) // floors before pairing: 2 sticks
})

test('torchCraftPlan: burns only the stick SURPLUS above the tool-tier reserve', () => {
  // 10 sticks, 4 coal, reserve 2 -> spare 8 -> 4 pairs -> 16 torches
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 4 }), { batches: 4, torches: 16, reason: 'ok' })
})

test('torchCraftPlan: no coal -> honest zero with reason', () => {
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 0 }), { batches: 0, torches: 0, reason: 'no coal' })
})

test('torchCraftPlan: sticks at or below reserve -> no torches, sticks survive for tools', () => {
  assert.deepEqual(torchCraftPlan({ sticks: 2, coals: 5 }), { batches: 0, torches: 0, reason: 'no spare sticks' })
  assert.deepEqual(torchCraftPlan({ sticks: 0, coals: 5 }), { batches: 0, torches: 0, reason: 'no spare sticks' })
})

test('torchCraftPlan: custom reserve widens or narrows the burn', () => {
  assert.equal(torchCraftPlan({ sticks: 6, coals: 4, reserveSticks: 0 }).batches, 4)
  assert.equal(torchCraftPlan({ sticks: 6, coals: 4, reserveSticks: 6 }).batches, 0)
})

test('torchCraftPlan: junk inputs take the honest zero path', () => {
  assert.deepEqual(torchCraftPlan({}), { batches: 0, torches: 0, reason: 'no spare sticks' })
  assert.equal(torchCraftPlan({ sticks: NaN, coals: 4 }).reason, 'no spare sticks')
  assert.equal(torchCraftPlan({ sticks: 10, coals: 'many' }).reason, 'no coal')
})

// --- (v0.165.0) THE METAL FUEL RESERVE - run562 (dispatch 36082849774, the
// v0.164.0 fleet): F3 held raw_copper:18 and F6 raw_copper:25 the WHOLE run
// while their smelt legs died 'raw_copper@-: no fuel' - the torch fire had
// eaten the coal (F10 crafted 19 torches = 19 coal), pickFuel's metal window
// burns coal FIRST, and the anchor/commons chests stayed empty ('chest holds
// no fuel' x35). The reserve keeps the smelt's coals out of the torch fire.

test('metalFuelReserve: 1 coal per 8 smelts, ceiled, capped (the F3/F6 arithmetic)', () => {
  assert.equal(metalFuelReserve(0), 0)
  assert.equal(metalFuelReserve(1), 1)
  assert.equal(metalFuelReserve(8), 1)
  assert.equal(metalFuelReserve(9), 2)
  assert.equal(metalFuelReserve(18), 3, 'the F3 shape: raw_copper 18 -> 3 coals held back')
  assert.equal(metalFuelReserve(25), 4, 'the F6 shape: raw_copper 25 -> 4 coals held back')
  assert.equal(metalFuelReserve(64), METAL_FUEL_CAP)
  assert.equal(metalFuelReserve(100), METAL_FUEL_CAP, 'the cap: the pocket never hordes more than a full stack of smelts')
  assert.equal(METAL_FUEL_CAP, 8)
})

test('metalFuelReserve: junk telemetry reads as zero - a junk read never hoards coal', () => {
  assert.equal(metalFuelReserve(undefined), 0)
  assert.equal(metalFuelReserve(NaN), 0)
  assert.equal(metalFuelReserve(null), 0)
  assert.equal(metalFuelReserve(-5), 0)
  assert.equal(metalFuelReserve(Infinity), 0)
  assert.equal(metalFuelReserve('many'), 0)
  assert.equal(metalFuelReserve(2.9), 1, 'floors the count first (2 raw metal), then ceils the division')
})

test('torchCraftPlan: the reserveCoals keeps the smelt coal out of the torch fire (the F3/F6 cure)', () => {
  // sticks 10, coals 9, reserve 3 -> spare 8, burnable 6 -> 6 batches (was 8)
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 9, reserveCoals: 3 }), { batches: 6, torches: 24, reason: 'ok' })
  // the full-hold shape: coals <= reserve -> the honest zero (the pocket keeps its smelt fuel)
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 3, reserveCoals: 3 }), { batches: 0, torches: 0, reason: 'no coal' })
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 4, reserveCoals: 8 }), { batches: 0, torches: 0, reason: 'no coal' })
})

test('torchCraftPlan: reserveCoals defaults to 0 - the legacy plan stays byte for byte', () => {
  const legacy = torchCraftPlan({ sticks: 10, coals: 9 })
  const explicit = torchCraftPlan({ sticks: 10, coals: 9, reserveCoals: 0 })
  assert.deepEqual(legacy, explicit, 'absent reserve == zero reserve')
  // (v0.190.0) the pocket torch cap trims the unbounded plan: held 0 reads
  // allowed = floor(24/4) = 6 batches, so the 8-batch raw arithmetic tops at
  // 6 (24 torches = one run's supply, TORCH_SPACING 8 x ~140 digs/run). The
  // junk-cap escape keeps the TRUE legacy shape read: a junk/absent cap is
  // no cap - pinned below in the cap family test.
  assert.deepEqual(legacy, { batches: 6, torches: 24, reason: 'ok' })
  // junk reserve reads as zero (the legacy plan, not a lockup)
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 9, reserveCoals: 'many' }), legacy)
  // the junk-coal keep still stands with a reserve in play
  assert.equal(torchCraftPlan({ sticks: 10, coals: NaN, reserveCoals: 3 }).reason, 'no coal')
  assert.equal(torchCraftPlan({ sticks: 2, coals: 9, reserveCoals: 3 }).reason, 'no spare sticks')
})

test('v0.190.0 THE POCKET TORCH CAP: the converter tops the pocket at one run\'s supply', () => {
  assert.equal(TORCH_POCKET_CAP, 24, 'the cap constant: TORCH_SPACING 8 x ~18 rhythm slots + margin')
  // F16's run35 shape: 95 torches held, sticks and coal funding - the honest
  // cap decline names itself (a plain 'no coal' would poison the decode).
  assert.deepEqual(
    torchCraftPlan({ sticks: 10, coals: 9, heldTorches: 95 }),
    { batches: 0, torches: 0, reason: 'the pocket torch cap' }
  )
  // held 24 exactly and held 21 (a batch would push past the cap) - both read
  // the cap decline; the batch alignment floors the allowance.
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 9, heldTorches: 24 }).reason, 'the pocket torch cap')
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 9, heldTorches: 21 }).reason, 'the pocket torch cap')
  // the PARTIAL trim: held 20 -> allowed floor(4/4) = 1 batch (4 torches)
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 9, heldTorches: 20 }), { batches: 1, torches: 4, reason: 'ok' })
  // the refusal family order survives: the spare verdict, then the coal
  // verdict, then the cap - a pocket that cannot fund both sides never reads
  // the cap name.
  assert.equal(torchCraftPlan({ sticks: 2, coals: 9, heldTorches: 95 }).reason, 'no spare sticks')
  assert.equal(torchCraftPlan({ sticks: 10, coals: 0, heldTorches: 95 }).reason, 'no coal')
  // junk safety: junk held reads 0 (a junk read never locks the craft - the
  // dry pocket keeps its full allowed budget), junk cap reads NO cap - the
  // true legacy arithmetic (8 batches / 32 torches) byte for byte.
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 9, heldTorches: 'many' }), { batches: 6, torches: 24, reason: 'ok' })
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 9, pocketCap: 'many' }), { batches: 8, torches: 32, reason: 'ok' })
  assert.deepEqual(torchCraftPlan({ sticks: 10, coals: 9, pocketCap: 0 }), { batches: 8, torches: 32, reason: 'ok' })
  // the zero-torch pocket (the restock trigger's only shape) keeps the full
  // allowed budget - the cap never blocks a dry pocket. (sticks 3 reads
  // spare 1 above the RESERVED_STICKS floor - the reserve keeps its byte.)
  assert.deepEqual(torchCraftPlan({ sticks: 3, coals: 2 }), { batches: 1, torches: 4, reason: 'ok' })
})

test('torchDue: rhythm - a torch every TORCH_SPACING digs', () => {
  assert.equal(torchDue({ digsSinceTorch: 0 }), false)
  assert.equal(torchDue({ digsSinceTorch: TORCH_SPACING - 1 }), false)
  assert.equal(torchDue({ digsSinceTorch: TORCH_SPACING }), true)
  assert.equal(torchDue({ digsSinceTorch: 100 }), true)
})

test('torchDue: readable darkness overrides the rhythm immediately', () => {
  assert.equal(torchDue({ digsSinceTorch: 0, lightLevel: MIN_SHAFT_LIGHT - 1 }), true)
  assert.equal(torchDue({ digsSinceTorch: 0, lightLevel: 0 }), true)
  // at or above the threshold the rhythm rules
  assert.equal(torchDue({ digsSinceTorch: 1, lightLevel: MIN_SHAFT_LIGHT }), false)
  assert.equal(torchDue({ digsSinceTorch: 1, lightLevel: 15 }), false)
})

test('torchDue: unreadable light (null/NaN) falls back to the rhythm', () => {
  assert.equal(torchDue({ digsSinceTorch: 3, lightLevel: null }), false)
  assert.equal(torchDue({ digsSinceTorch: 3, lightLevel: NaN }), false)
})

test('torchDue: junk counters and bad spacing do not crash the loop', () => {
  assert.equal(torchDue({ digsSinceTorch: -5 }), false) // clamped to 0
  assert.equal(torchDue({ digsSinceTorch: undefined }), false)
  assert.equal(torchDue({ digsSinceTorch: 8, spacing: 0 }), true) // 0 -> default spacing 8
  assert.equal(torchDue({ digsSinceTorch: 8, spacing: NaN }), true)
})

test('countTorches: sums torch stacks only, tolerates junk entries', () => {
  assert.equal(countTorches(null), 0)
  assert.equal(countTorches('nope'), 0)
  assert.equal(countTorches([]), 0)
  assert.equal(countTorches([
    { name: 'torch', count: 4 },
    { name: 'stick', count: 12 },
    { name: 'coal', count: 3 },
    { name: 'torch', count: 7 },
    null,
    { name: 'torch', count: NaN }
  ]), 11)
})

test('policy constants: spacing/light stay in the spawn-proof regime', () => {
  // a torch's light 14 spreads 7 blocks; spacing must be <= 8 so a shaft never
  // drops below MIN_SHAFT_LIGHT between torches, and the reserve must leave a
  // future tool tier alive
  assert.ok(TORCH_SPACING <= 8, `spacing ${TORCH_SPACING} would let the shaft go dark`)
  assert.equal(MIN_SHAFT_LIGHT, 7)
  assert.ok(RESERVED_STICKS >= 0 && RESERVED_STICKS <= 4)
})

// --- v0.107.0 the tunnel-torch rhythm: torchWallDirs ---

test('torchWallDirs: the tunnel travel face is EXCLUDED from the candidates', () => {
  // the run94 disease: the fleet dug TUNNELS in the dark while only the shaft
  // lane placed torches. The cure lights galleries - but a torch attached to
  // the wall the next cut eats pops the very next iteration, so the travel
  // face must never be a candidate.
  const d = { x: 1, z: 0 }
  const dirs = torchWallDirs({ d })
  assert.ok(!dirs.some(c => c[0] === 1 && c[1] === 0), `travel face [1,0] must be excluded, got ${JSON.stringify(dirs)}`)
  assert.deepEqual([...dirs].sort(), [[-1, 0], [0, -1], [0, 1]].sort())
})

test('torchWallDirs: every unit travel direction excludes exactly its own face', () => {
  for (const [tx, tz] of [[-1, 0], [0, 1], [0, -1], [1, 0]]) {
    const dirs = torchWallDirs({ d: { x: tx, z: tz } })
    assert.equal(dirs.length, 3, `d=(${tx},${tz}) must leave 3 candidates`)
    assert.ok(!dirs.some(c => c[0] === tx && c[1] === tz), `d=(${tx},${tz}) still offered its own face`)
  }
})

test('torchWallDirs: junk d judges nothing - the full v0.10.0 base set returns', () => {
  // the shaft lane calls the placement with NO dirs: the fallback must be the
  // exact historical base order, byte for byte (the digShaft compatibility pin)
  const base = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  assert.deepEqual(torchWallDirs({}), base)
  assert.deepEqual(torchWallDirs({ d: null }), base)
  assert.deepEqual(torchWallDirs({ d: 'junk' }), base)
  assert.deepEqual(torchWallDirs({ d: { x: NaN, z: 0 } }), base)
  assert.deepEqual(torchWallDirs({ d: { x: 1, z: Infinity } }), base)
  assert.equal(TORCH_WALL_BASE_DIRS.length, 4)
})

test('torchWallDirs: deterministic base order is preserved minus the excluded face', () => {
  // [1,0] excluded -> [-1,0],[0,1],[0,-1] survive IN ORDER (deterministic so a
  // field log can name the wall that took the torch)
  assert.deepEqual(torchWallDirs({ d: { x: 1, z: 0 } }), [[-1, 0], [0, 1], [0, -1]])
  assert.deepEqual(torchWallDirs({ d: { x: 0, z: -1 } }), [[1, 0], [-1, 0], [0, 1]])
  // fresh arrays every call - a caller mutating its list must not poison the base
  const a = torchWallDirs({ d: null })
  a[0][0] = 99
  assert.equal(TORCH_WALL_BASE_DIRS[0][0], 1)
})

test('torchWallDirs: the rhythm constants still pin the spawn-proof regime (v0.107.0 unchanged)', () => {
  // spacing 8 with wall torches at head level keeps a 1x2 gallery inside the
  // light-14 spread - the tunnel rhythm reuses the SAME TORCH_SPACING as the shaft
  assert.equal(TORCH_SPACING, 8)
  assert.equal(MIN_SHAFT_LIGHT, 7)
})

test('torchRestockWanted: a dry pocket with a funding snapshot re-arms the craft (the v0.137.0 famine cure)', () => {
  // the run551 famine shape: entry found 'no coal', the tunnel steered to
  // coal_ore mid-run - by the next torchDue the pocket funds a batch and the
  // restock must fire
  assert.equal(torchRestockWanted({ torches: 0, sticks: 3, coals: 4 }), true, 'dry pocket + funded snapshot: restock')
  assert.equal(torchRestockWanted({ torches: 0, sticks: 5, coals: 1 }), true, 'one coal is one batch (4 torches)')
  // the rhythm owns TOP-UPS: a pocket still holding torches never re-crafts
  assert.equal(torchRestockWanted({ torches: 1, sticks: 3, coals: 4 }), false, 'torches held: placement territory, not craft')
  assert.equal(torchRestockWanted({ torches: 4, sticks: 3, coals: 4 }), false)
  // the honest no-funds shapes stay silent (the entry lane owns the skip lines)
  assert.equal(torchRestockWanted({ torches: 0, sticks: 3, coals: 0 }), false, 'no coal: nothing to craft with')
  assert.equal(torchRestockWanted({ torches: 0, sticks: 2, coals: 4 }), false, 'sticks at the reserve: the tools keep them')
  assert.equal(torchRestockWanted({ torches: 0, sticks: 0, coals: 4 }), false, 'stick-dry: the sticks-for-torches cure in craftTorches owns the plank side')
  // junk-safe: a guessed read must never fire a craft
  assert.equal(torchRestockWanted({ torches: NaN, sticks: 3, coals: 4 }), false, 'a junk torch count is not a dry proof')
  assert.equal(torchRestockWanted({ torches: -2, sticks: 3, coals: 4 }), false, 'a negative count is junk, not dry')
  assert.equal(torchRestockWanted({ torches: 0, sticks: NaN, coals: 4 }), false, 'junk sticks read as none')
  assert.equal(torchRestockWanted({}), false, 'no snapshot: no craft')
})

test('REGRESSION PIN: the miner lanes wire the dry-pocket restock into the torch rhythm', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // the restock helper exists and asks the pure policy with a live snapshot
  assert.ok(/function restockTorchesHere/.test(minerSrc), 'the mid-lane restock helper exists')
  assert.ok(/torchRestockWanted\(\{ torches: countTorches\(inventoryItems\(bot\)\), sticks, coals \}\)/.test(minerSrc),
    'the restock consults the policy with the live torch/stick/coal snapshot')
  // BOTH rhythm call sites (tunnel + shaft) restock BEFORE the placement ask:
  // the coal arrives mid-run, the craft must re-attempt before the rhythm
  // gives up for this spacing round
  const sites = minerSrc.split('await restockTorchesHere()').length - 1
  assert.equal(sites, 2, 'the restock fires in both torch lanes (tunnel + shaft)')
  assert.ok(/await restockTorchesHere\(\)\n            if \(await placeTorchHere/.test(minerSrc),
    'the restock precedes the placement inside the torchDue branch')
  // the pure policy is imported (no local re-implementation)
  assert.ok(/torchRestockWanted, countTorches/.test(minerSrc), 'the policy imports ride the torch.mjs module boundary')
})

test('REGRESSION PIN: the placement ledger names its failure classes (the v0.137.0 run551 decode)', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // run551: ~16 torches crafted, stats.torched=5 - the v0.10.0 'bounded and
  // silent' contract left the starvation class invisible. The ledger counts
  // all four classes and names the first of each per streak.
  assert.ok(/torchDidNotLand\('dry'\)/.test(minerSrc), 'the pocket-dry class is named')
  assert.ok(/torchDidNotLand\('cell'\)/.test(minerSrc), 'the no-free-cell class is named')
  assert.ok(/torchDidNotLand\('wall'\)/.test(minerSrc), 'the no-valid-wall class is named')
  assert.ok(/torchDidNotLand\('place'\)/.test(minerSrc), 'the placeBlock-failure class is named')
  // one line per class per streak: the named flag gates the log, a landing re-arms
  assert.ok(/torchLedger\.named\[cls\]/.test(minerSrc), 'the naming is gated per streak (no per-dig spam)')
  assert.ok(/torchLedger\.named = \{\}/.test(minerSrc), 'a landing re-arms every class')
  // a failed face no longer aborts the remaining candidates (the old outer
  // catch ended the loop on the first timeout)
  assert.ok(/torchDidNotLand\('place'\)\s*\n\s*continue/.test(minerSrc),
    'a failed face continues to the next wall candidate')
})

test('REGRESSION PIN: craftTorches consults the metal fuel reserve (the v0.165.0 wire)', async () => {
  const fs = await import('node:fs')
  const toolsSrc = fs.readFileSync(new URL('../../src/bots/tools.mjs', import.meta.url), 'utf8')
  // the live reserve comes from the pocket's raw metal through the pure policy
  assert.ok(/metalFuelReserve\(metalHeld\)/.test(toolsSrc), 'the reserve is computed by the pure policy, not hand-rolled')
  assert.ok(/METAL_INPUTS\.has\(i\.name\)/.test(toolsSrc), 'the metal read mirrors the METAL_INPUTS set pickFuel itself judges with')
  assert.ok(/reserveCoals: fuelReserve/.test(toolsSrc), 'the plan is asked WITH the reserve (both the entry and the re-plan calls)')
  assert.ok(/the metal fuel reserve holds all /.test(toolsSrc), 'the reserve-decline shape is NAMED for the mine (the honest-decode doctrine)')
})
