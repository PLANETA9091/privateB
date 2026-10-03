// The seal place fence's wiring pins (v0.544.0).
//
// THE SEAM: the miner's seal machinery carried the repo's last NAKED
// placeBlock calls - sealWaitUnseal's per-face leg and the ring build's
// per-round leg. mineflayer's placeBlock waits for a block-update event that
// never comes (the PILLAR lesson, the SEAL_PLACE law in surface.mjs) - on a
// dead socket OR a stalled server (the v0.43.0 craft-storm class) the promise
// stays UNSETTLED inside the legs' QUIET per-face / per-round catches: a
// quiet catch only hears settled rejections, so the loop never advanced,
// sealWaitUnseal never returned, the shift iteration never ended - the
// 0.541.0 loop-top probe could not read again and the deadline exit never
// fired (the attempt rode to the run's end as a frozen book). The house had
// fenced every OTHER place: tools.mjs's PLACE_FENCE_MS (the camp build) and
// surface.mjs's SEAL_PLACE_TIMEOUT_MS (the anchor, the PILLAR probe's own
// cure) - the miner's seal legs were the naked exceptions.
//
// THE WIRE: both legs fenced with the seal's OWN constant (the same machine,
// the same 3s law) - a hung placement becomes a caught timeout, the next
// face/round walks, the loop returns, the 0.541.0 probe reads, the rebuild
// owns the rest. The equip and the verify waits stay OUTSIDE the fences (the
// tools.mjs shape): equip resolves or dies on its own, and waitForTicks
// self-times-out at ticks*50+5000ms (measured in physics.js - the physics
// death does NOT strand a waitForTicks).
//
// OUT OF SCOPE (priced, not wired): testbed/pillar-probe.mjs and
// testbed/smoke.mjs carry their own naked placeBlock calls - supervised
// one-off probes with their own outer supervision, never the shift loop's
// machinery.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const surfaceSrc = readFileSync(new URL('../../src/lib/surface.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the miner carries ZERO naked placeBlock calls (the frozen-book class is dead)', () => {
  const naked = minerSrc.match(/await bot\.placeBlock/g) || []
  assert.equal(naked.length, 0, `every placeBlock rides the fence (got ${naked.length} naked)`)
})

test('REGRESSION PIN: the two seal legs carry the fence, byte-exact (one site each)', () => {
  const face = minerSrc.match(/await withTimeout\(bot\.placeBlock\(ref, off\.scaled\(-1\)\), SEAL_PLACE_TIMEOUT_MS, 'seal face place'\)/g) || []
  const ring = minerSrc.match(/await withTimeout\(bot\.placeBlock\(ref, new Vec3\(0, 1, 0\)\), SEAL_PLACE_TIMEOUT_MS, 'seal ring place'\)/g) || []
  assert.equal(face.length, 1, `the sealWaitUnseal face leg fenced (got ${face.length})`)
  assert.equal(ring.length, 1, `the ring build round leg fenced (got ${ring.length})`)
})

test('REGRESSION PIN: the fence rides the seal\'s OWN constant (the same machine, the same law)', () => {
  assert.ok(surfaceSrc.includes('export const SEAL_PLACE_TIMEOUT_MS = 3000'), 'the SEAL_PLACE law stands in surface.mjs')
  const importLine = minerSrc.match(/SEAL_PLACE_TIMEOUT_MS[^\n]*\n\} from '\.\.\/lib\/surface\.mjs'/)
  assert.ok(importLine, 'the constant is imported from surface.mjs beside the bridge laws')
})

test('REGRESSION PIN: the equip and the verify waits stay OUTSIDE the fence (the tools.mjs shape)', () => {
  // the fence caps ONE placement - the equip resolves on its own and the
  // waitForTicks self-times-out (physics.js: ticks*50+5000ms) - wrapping the
  // whole leg would double-fence a self-timing wait
  const legShape = minerSrc.match(/await bot\.equip\(item, 'hand'\)\n\s*await bot\.waitForTicks\(5\)\n\s*\/\/ \(v0\.544\.0\) THE SEAL PLACE FENCE/)
  assert.ok(legShape, 'the face leg keeps the equip + wait before the fence')
  const ringShape = minerSrc.match(/await withTimeout\(bot\.placeBlock\(ref, new Vec3\(0, 1, 0\)\), SEAL_PLACE_TIMEOUT_MS, 'seal ring place'\)\n\s*await bot\.waitForTicks\(2\)/)
  assert.ok(ringShape, 'the ring leg keeps its verify wait after the fence')
})
