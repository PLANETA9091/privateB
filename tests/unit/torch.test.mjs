// Torch policy - pure maths, verified by arithmetic (no bot, no server).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TORCH_SPACING, MIN_SHAFT_LIGHT, RESERVED_STICKS,
  torchesCraftable, torchCraftPlan, torchDue, countTorches
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
