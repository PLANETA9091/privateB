// Torch policy - pure maths, verified by arithmetic (no bot, no server).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TORCH_SPACING, MIN_SHAFT_LIGHT, RESERVED_STICKS, TORCH_WALL_BASE_DIRS,
  torchesCraftable, torchCraftPlan, torchDue, countTorches, torchWallDirs
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
