import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { unreachableBatchVerdict, UNREACHABLE_FENCE_BATCHES } from '../../src/lib/jobqueue.mjs'

// (v0.352.0) THE UNREACHABLE-SPIN GUARD - face 36721007616's integration
// failure taught two silences at once: collectArea re-filled the SAME
// unreachable targets at ~30ms cadence until the phase deadline spoke
// (~4700 cycles of pure CPU burn, zero progress), and carveAlcove refused
// 3 times from a wet column with ZERO log lines before the assert fired on
// a world. The verdict is pure arithmetic; the wiring pins ride the source.

test('the spin verdict counts zero-yield all-unreachable batches toward the fence', () => {
  assert.equal(unreachableBatchVerdict({ done: 0, unreachable: 24 }, 0), 'count')
  assert.equal(unreachableBatchVerdict({ done: 0, unreachable: 24 }, 1), 'count')
  assert.equal(unreachableBatchVerdict({ done: 0, unreachable: 1 }, 2), 'fenced')
})

test('the fence sits exactly at the third consecutive zero-yield batch', () => {
  assert.equal(UNREACHABLE_FENCE_BATCHES, 3)
  assert.equal(unreachableBatchVerdict({ done: 0, unreachable: 5 }, 2), 'fenced')
  assert.notEqual(unreachableBatchVerdict({ done: 0, unreachable: 5 }, 1), 'fenced')
})

test('a yield resets the streak - a working area never fences', () => {
  assert.equal(unreachableBatchVerdict({ done: 3, unreachable: 7 }, 2), 'reset')
  assert.equal(unreachableBatchVerdict({ done: 1, unreachable: 0 }, 2), 'reset')
})

test('done=0 with NO unreachable probes is a different class (executed and failed) - reset', () => {
  // the blacklist owns the failed-position rotation; the spin's atom is the
  // batch where the pathfinder refused EVERY probe without one execution
  assert.equal(unreachableBatchVerdict({ done: 0, unreachable: 0 }, 2), 'reset')
})

test('junk stats and a junk streak read honestly (reset / floor at 0)', () => {
  assert.equal(unreachableBatchVerdict(null, 2), 'reset')
  assert.equal(unreachableBatchVerdict({ done: NaN, unreachable: 5 }, 2), 'reset')
  assert.equal(unreachableBatchVerdict({ done: 0, unreachable: NaN }, 2), 'reset')
  assert.equal(unreachableBatchVerdict({ done: 0, unreachable: 5 }, NaN), 'count')
  assert.equal(unreachableBatchVerdict({ done: 0, unreachable: 5 }, -3), 'count')
  assert.equal(unreachableBatchVerdict({ done: 0, unreachable: 5 }, 2.9), 'fenced')
})

test('wiring pin: collectArea feeds its stats into the verdict and names the fence', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.match(minerSrc, /const spinVerdict = unreachableBatchVerdict\(queue\.stats, unreachableBatches\)/)
  assert.match(minerSrc, /unreachable batches in a row - the area is fenced/)
  assert.match(minerSrc, /spinVerdict === 'count' \? unreachableBatches \+ 1 : 0/)
})

test('wiring pin: carveAlcove names its refusals and the wet column hands off to relocate', () => {
  const testSrc = readFileSync(new URL('../integration/smelting.test.mjs', import.meta.url), 'utf8')
  assert.match(testSrc, /no diggable wall at \$\{feet\} \(air \$\{refusals\.air\}, fluid \$\{refusals\.fluid\}, floor-gap \$\{refusals\.floor\}\)/)
  assert.match(testSrc, /return \{ cell: null, wet: refusals\.fluid > 0 \}/)
  // both ladders (table + furnace) walk out of the wet column instead of
  // re-probing the same water three times
  const relocateHands = testSrc.match(/the column is wet - relocating to solid ground/g) || []
  assert.equal(relocateHands.length, 2, 'both carve ladders must carry the wet handoff')
  assert.match(testSrc, /no budget left for the table phase/)
})
