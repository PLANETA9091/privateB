// Tests for the climb's wet-wall yield (v0.312.0).
//
// MEASURED (fleet 36566021862, the first full-survival face): 47 wet-blocked
// rotations on just 8 distinct bot-levels - F6 y=48 x12, F4 y=51 x12, F12
// y=57 x9, F7 y=51 x8 - each level re-probing the SAME water cell 8-12 times
// until the 89s/90s fence killed the attempt ('F12 final climb: failed -
// timeout [stage 2]' right after three consecutive identical wet diags on
// the same bearing). The wet machinery (gallery, ladder, ascend) runs first
// and owns the crossing, but once its budgets are spent the rotate ladder
// grinds a column where every bearing reads water - and water is
// rotation-independent, so rotation can provably change nothing.
// THE CURE: yield the climb honestly (the v0.85.0 low-o2 shape) once a full
// bearing sweep has read wet with zero dry walls at the level; a single dry
// bearing keeps the rotate ladder working.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { WET_WALL_YIELD_ROTATIONS, wetWallYield } from '../../src/lib/surface.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const surfaceSrc = readFileSync(new URL('../../src/lib/surface.mjs', import.meta.url), 'utf8')

test('wetWallYield: the fleet datum - a full wet sweep with no dry bearing yields the climb', () => {
  assert.deepEqual(wetWallYield({ wetRotations: 4, dryRotations: 0 }), { yield: true, reason: 'wet wall' })
  assert.deepEqual(wetWallYield({ wetRotations: 9, dryRotations: 0 }), { yield: true, reason: 'wet wall' }, 'the F12 y=57 shape: nine wet rotations, nothing else')
})

test('wetWallYield: below the sweep threshold the rotate ladder keeps the level', () => {
  assert.deepEqual(wetWallYield({ wetRotations: 3, dryRotations: 0 }).yield, false)
  assert.deepEqual(wetWallYield({ wetRotations: 0, dryRotations: 0 }).yield, false)
})

test('wetWallYield: one dry bearing keeps the ladder working (dry walls are diggable material)', () => {
  assert.deepEqual(wetWallYield({ wetRotations: 4, dryRotations: 1 }).yield, false)
  assert.deepEqual(wetWallYield({ wetRotations: 12, dryRotations: 2 }).yield, false, 'even the F6/F4 x12 counts yield nothing while a dry wall exists')
})

test('wetWallYield: the strict-false battery never throws and never yields (the Number(null) lesson, seventh strike)', () => {
  assert.deepEqual(wetWallYield(null).yield, false)
  assert.deepEqual(wetWallYield(undefined).yield, false)
  assert.deepEqual(wetWallYield(false).yield, false)
  assert.deepEqual(wetWallYield(0).yield, false)
  assert.deepEqual(wetWallYield('').yield, false)
  assert.deepEqual(wetWallYield({}).yield, false)
})

test('wetWallYield: junk counts never yield (the conservative honest price is the status-quo ladder)', () => {
  assert.deepEqual(wetWallYield({ wetRotations: NaN, dryRotations: 0 }).yield, false)
  assert.deepEqual(wetWallYield({ wetRotations: '4', dryRotations: 0 }).yield, false)
  assert.deepEqual(wetWallYield({ wetRotations: 9, dryRotations: NaN }).yield, false, 'junk dry evidence reads as UNKNOWN, not as zero')
  assert.deepEqual(wetWallYield({ wetRotations: 9, dryRotations: null }).yield, false)
  assert.deepEqual(wetWallYield({ wetRotations: -1, dryRotations: 0 }).yield, false)
  assert.deepEqual(wetWallYield({ wetRotations: 4, dryRotations: -2 }).yield, false)
})

test('wetWallYield: the threshold honours a caller override and junk falls to the pinned default', () => {
  assert.deepEqual(wetWallYield({ wetRotations: 2, dryRotations: 0, threshold: 2 }).yield, true)
  assert.deepEqual(wetWallYield({ wetRotations: 2, dryRotations: 0, threshold: 3 }).yield, false)
  assert.deepEqual(wetWallYield({ wetRotations: 2, dryRotations: 0, threshold: NaN }).yield, false, 'junk threshold falls to 4 - two wet rotations do not sweep')
  assert.deepEqual(wetWallYield({ wetRotations: 2, dryRotations: 0, threshold: 0 }).yield, false, 'a zero/negative threshold is junk, not a trigger')
})

test('the sweep constant stays pinned to one full bearing rotation cycle', () => {
  assert.equal(WET_WALL_YIELD_ROTATIONS, 4)
})

test('wiring: the counters are climb-scoped, incremented in the blocked path, reset on every rise', () => {
  assert.ok(minerSrc.includes('let wetRotLevel = 0'), 'the wet counter is declared at climb scope')
  assert.ok(minerSrc.includes('let dryRotLevel = 0'), 'the dry counter is declared at climb scope')
  assert.ok(minerSrc.includes('if (blockedWet) wetRotLevel++; else dryRotLevel++'), 'the blocked path books each rotation into its own bucket')
  const resets = minerSrc.match(/steps\+\+; fails = 0; wetRotLevel = 0; dryRotLevel = 0/g) || []
  assert.ok(resets.length >= 4, `every real rise resets both counters (found ${resets.length}, need >= 4: rose, pounce, assist, gallery)`)
})

test('wiring: the yield check sits after the blocked diag and BEFORE the rotate ladder spend', () => {
  const diag = minerSrc.indexOf('blocked toward ${d.x},${d.z} (dug=')
  const book = minerSrc.indexOf('if (blockedWet) wetRotLevel++')
  const check = minerSrc.indexOf('wetWallYield({ wetRotations: wetRotLevel, dryRotations: dryRotLevel })')
  const rotateSpend = minerSrc.indexOf("await settleTicks(4, 'climb rotate settle')")
  assert.ok(diag > -1 && book > diag, 'the diag line prints its evidence first')
  assert.ok(check > book, 'the verdict reads the just-booked counters')
  assert.ok(rotateSpend > check, 'the rotate spend only happens when the verdict said keep going')
})

test('wiring: the yield returns the low-o2 shape and names both the line and the reason', () => {
  assert.ok(minerSrc.includes('climb wet-wall yield:'), 'the yield line names the counts and the level')
  assert.ok(/return \{ ok: false, reason: wallYield\.reason, gained: 0, dug, steps, traversed \}/.test(minerSrc), 'the return is the ok=false reason shape every caller already handles')
  assert.ok(minerSrc.includes("reason: wallYield.reason"), 'the return rides the pure function\'s verdict')
  assert.ok(surfaceSrc.includes("reason: 'wet wall'"), 'the pure function names the reason the stage ladder prints')
})

test('wiring: the surface import carries the yield pair', () => {
  assert.ok(minerSrc.includes('wetWallYield, WET_WALL_YIELD_ROTATIONS'), 'the import names the verdict and the sweep constant')
})
