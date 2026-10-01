// THE TUNNEL STEP FENCE (v0.425.0): the raw one-block step was the fleet's
// LAST motion primitive without the dropAheadBelow fence - the shaft digger
// sidesteps 4+ drops (v0.86.0 stale-window law), the vein sweep fenced its
// cells (v0.98.0), the support/lip digs probe theirs (v0.267.0/v0.206.0),
// the wet-escape's traverseStep has the GAP GUARD - the tunnel dug the step
// cell ahead and held forward 'let gravity handle the drop' at ANY depth.
// THE FIELD WITNESS (face 27, 36870593766): F14 'fell from a high place'
// [kind=fall] at [-132,45,405] - the ONLY fall death across faces 26+27.
// Pure fence + the miner wiring pins (the v0.140.0 gravityroof pin shape).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { tunnelStepRefusal, VEIN_DROP_REFUSE } from '../../src/lib/surface.mjs'

test('the threshold is the fleet law: 4 (fall damage begins at 4 - the shaft digger rides the same number)', () => {
  assert.equal(VEIN_DROP_REFUSE, 4)
})

test('a floored step cell (airBelow 0-3) walks - the 1-3 dip is survivable terrain', () => {
  assert.equal(tunnelStepRefusal({ airBelow: 0 }), null)
  assert.equal(tunnelStepRefusal({ airBelow: 1 }), null)
  assert.equal(tunnelStepRefusal({ airBelow: 3 }), null)
})

test('a 4+ drop below the step cell refuses - the cave gap is never stepped into blind', () => {
  assert.match(tunnelStepRefusal({ airBelow: 4 }), /drop of 4 below the step cell/)
  assert.match(tunnelStepRefusal({ airBelow: 5 }), /drop of 5 below the step cell/)
  // the field witness's own geometry: a 19-level fall is the face-27 class
  assert.match(tunnelStepRefusal({ airBelow: 19 }), /drop of 19 below the step cell/)
})

test('a fluid strike under the step cell refuses (the lava pool under a broken floor)', () => {
  assert.match(tunnelStepRefusal({ airBelow: 0, fluidBelow: true }), /fluid below the step cell/)
  assert.equal(tunnelStepRefusal({ airBelow: 0, fluidBelow: false }), null)
})

test('a blind read refuses (the v0.86.0 stale-window law - zero real reads is BLIND, not safe)', () => {
  assert.match(tunnelStepRefusal({ blind: true }), /blind read \(stale window\)/)
})

test('junk drop reads refuse - a missing read never arms a step (the body-guard law)', () => {
  assert.match(tunnelStepRefusal({ airBelow: -1 }), /junk drop read/)
  assert.match(tunnelStepRefusal({ airBelow: NaN }), /junk drop read/)
  assert.match(tunnelStepRefusal({ airBelow: 'seven' }), /junk drop read/)
  // the missing probe reads the default 0 (a floored cell) - the same
  // default the vein fence ships with; the call site always probes
  assert.equal(tunnelStepRefusal({}), null)
})

test('WIRING: the miner probes the step cell BEFORE any dig and refuses the iteration (the fluidAhead break shape)', () => {
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const tunnelIdx = src.indexOf('async function tunnel (dir,')
  assert.ok(tunnelIdx > 0, 'the tunnel factory found')
  const body = src.slice(tunnelIdx, src.indexOf('async function veinSweep', tunnelIdx))
  // the fence consult precedes the gravity roof fence and every dig of the step cell
  const fenceIdx = body.indexOf('const stepFence = tunnelStepRefusal(')
  assert.ok(fenceIdx > 0, 'the step fence consult exists inside tunnel()')
  const roofIdx = body.indexOf('const roof = await gravityClearBefore(feetCell)')
  const digIdx = body.indexOf('if (await bot.fastDig(feetB))')
  assert.ok(fenceIdx < roofIdx, 'the fence precedes the gravity roof fence (before any dig)')
  assert.ok(fenceIdx < digIdx, 'the fence precedes the first dig of the step cell')
  assert.match(body, /tunnelStepRefusal\(\{ airBelow: stepAirBelow, fluidBelow: stepFluidBelow !== null \}\)/, 'the probe pair feeds the fence')
  assert.match(body, /const stepAirBelow = dropAheadBelow\(feetCell\)/, 'the drop probe reads the step cell')
  assert.match(body, /const stepFluidBelow = fluidStrikeBelow\(feetCell, \{ depth: 3 \}\)/, 'the fluid probe reads under the step cell')
})

test('WIRING: the fence break names itself - log, stats ledger, zeroWhy (the v0.35.0 + v0.240.0 laws)', () => {
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const tunnelIdx = src.indexOf('async function tunnel (dir,')
  const body = src.slice(tunnelIdx, src.indexOf('async function veinSweep', tunnelIdx))
  assert.match(body, /stats\.stepFenceRefused = \(stats\.stepFenceRefused \?\? 0\) \+ 1/, 'refusals count in the stats ledger (the gravityroof pin shape)')
  assert.match(body, /log\(`\$\{tag\} tunnel: step fence - \$\{stepFence\}/, 'the fence names itself in the log - a silent abort is the hole the guards close')
  assert.match(body, /zeroWhy = `step fence: \$\{stepFence\}`/, 'the verdict rides zeroWhy when the gallery reads zero')
  assert.match(body, /break/, 'the break hands the rotation to the caller (the fluidAhead shape)')
})

test('WIRING: the import rides the surface.mjs block (the tunnel helpers block)', () => {
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.match(src, /  tunnelStepRefusal, \/\/ \(v0\.420\.0\) THE TUNNEL STEP FENCE/, 'the import is named beside its siblings')
})
