// (v0.327.0) THE WET-SHIFT FINAL CLIMB - the plan that turns the wet wall's
// life sentence into a navigation problem.
//
// THE DATUM (fleet 36631612575, the three-instrument face): the whale F12
// held 220u = 31.1% of the unbanked 707u and died UNDERGROUND - the final
// climb's single attempt hit the wet wall at y=60 ('climb wet-wall yield:
// 4 wet rotations vs 0 dry'), the no-retry gate ended the chain, and the
// write-off row's top line read 'F12 220u/17s'. The no-retry law is right
// about the COLUMN; the shift asks the NEIGHBOR. These tests pin the pure
// plan (the condemned set read, the cardinal order, the preferred bearing,
// the junk laws) and the fleet19 wiring (the branch order, the tunnel mover,
// the landed-column re-check, the route-latch counting).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { wetShiftPlan, wetColumnMemoCondemn, wetColumnMemoBlocked, WET_SHIFT_BLOCKS, WET_SHIFT_MIN_SLICE_MS, WET_SHIFT_TUNNEL_MAX_MS, WET_COLUMN_MEMO_TOLERANCE } from '../../src/lib/surface.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const surfaceSrc = readFileSync(join(here, '../../src/lib/surface.mjs'), 'utf8')
const fleetSrc = readFileSync(join(here, '../../testbed/fleet19.mjs'), 'utf8')

// the F12-shaped memo: the failed column condemned at its yield level
function f12Memo () {
  const memo = new Map()
  wetColumnMemoCondemn(memo, { x: 50, z: 100, y: 60, wetRotations: 4, dryRotations: 0 })
  return memo
}

test('the F12 datum: the condemned column shifts to the first clean cardinal neighbor', () => {
  const plan = wetShiftPlan(f12Memo(), { x: 50, z: 100, y: 59 })
  assert.equal(plan.shift, true)
  // the fixed order's first clean candidate: +x
  assert.deepEqual(plan.bearing, { x: 1, z: 0 })
  assert.equal(plan.tx, 52)
  assert.equal(plan.tz, 100)
  assert.match(plan.why, /shifting 2b to the fresh column 52,100/)
})

test('the yard-ward preferred bearing earns the first roll', () => {
  const memo = f12Memo()
  // +z is clean like the others; the yard stands to the -x: the shift plans -x first
  const plan = wetShiftPlan(memo, { x: 50, z: 100, y: 59, preferX: -30, preferZ: 0 })
  assert.equal(plan.shift, true)
  assert.deepEqual(plan.bearing, { x: -1, z: 0 })
  assert.equal(plan.tx, 48)
  assert.equal(plan.tz, 100)
})

test('a preferred bearing that maps to no cardinal keeps the fixed order', () => {
  // the yard is diagonal (+x,+z): no cardinal match -> the fixed order's +x wins
  const plan = wetShiftPlan(f12Memo(), { x: 50, z: 100, y: 59, preferX: 7, preferZ: 5 })
  assert.equal(plan.shift, true)
  assert.deepEqual(plan.bearing, { x: 1, z: 0 })
})

test('the first clean candidate wins in the fixed cardinal order', () => {
  const memo = f12Memo()
  wetColumnMemoCondemn(memo, { x: 52, z: 100, y: 60, wetRotations: 3, dryRotations: 0 }) // +x condemned too
  const plan = wetShiftPlan(memo, { x: 50, z: 100, y: 59 })
  assert.deepEqual(plan.bearing, { x: -1, z: 0 }) // -x is the next in order
  // and -x condemned -> +z
  wetColumnMemoCondemn(memo, { x: 48, z: 100, y: 60, wetRotations: 2, dryRotations: 0 })
  assert.deepEqual(wetShiftPlan(memo, { x: 50, z: 100, y: 59 }).bearing, { x: 0, z: 1 })
})

test('every neighbor condemned stays home (the verdict form)', () => {
  const memo = f12Memo()
  wetColumnMemoCondemn(memo, { x: 52, z: 100, y: 60, wetRotations: 3, dryRotations: 0 })
  wetColumnMemoCondemn(memo, { x: 48, z: 100, y: 60, wetRotations: 3, dryRotations: 0 })
  wetColumnMemoCondemn(memo, { x: 50, z: 102, y: 60, wetRotations: 3, dryRotations: 0 })
  wetColumnMemoCondemn(memo, { x: 50, z: 98, y: 60, wetRotations: 3, dryRotations: 0 })
  const plan = wetShiftPlan(memo, { x: 50, z: 100, y: 59 })
  assert.equal(plan.shift, false)
  assert.equal(plan.bearing, null)
  assert.match(plan.why, /every neighbor column is condemned too/)
})

test('the tolerance arithmetic rides wetColumnMemoBlocked itself: a shallow record still blocks, a deep one does not', () => {
  // a neighbor condemned at y=70: the feet at 59 must pass through it -> blocked
  const shallow = new Map()
  wetColumnMemoCondemn(shallow, { x: 52, z: 100, y: 70, wetRotations: 2, dryRotations: 0 })
  const blockedPlan = wetShiftPlan(shallow, { x: 50, z: 100, y: 59 })
  assert.deepEqual(blockedPlan.bearing, { x: -1, z: 0 }) // +x skipped, -x wins
  assert.equal(wetColumnMemoBlocked(shallow, { x: 52, z: 100, y: 59 }).blocked, true)
  // a neighbor condemned at y=20: the feet at 59 climb ABOVE its verdict -> free
  const deep = new Map()
  wetColumnMemoCondemn(deep, { x: 52, z: 100, y: 20, wetRotations: 2, dryRotations: 0 })
  assert.equal(wetColumnMemoBlocked(deep, { x: 52, z: 100, y: 59 }).blocked, false)
  const freePlan = wetShiftPlan(deep, { x: 50, z: 100, y: 59 })
  assert.deepEqual(freePlan.bearing, { x: 1, z: 0 })
})

test('junk never plans a shift (the body-guard law)', () => {
  // no memo
  assert.equal(wetShiftPlan(null, { x: 50, z: 100, y: 59 }).shift, false)
  assert.match(wetShiftPlan(null, { x: 50, z: 100, y: 59 }).why, /no wet memo/)
  assert.equal(wetShiftPlan('junk', { x: 50, z: 100, y: 59 }).shift, false)
  // junk feet
  assert.equal(wetShiftPlan(f12Memo(), { x: NaN, z: 100, y: 59 }).shift, false)
  assert.equal(wetShiftPlan(f12Memo(), { x: 50, z: undefined, y: 59 }).shift, false)
  assert.equal(wetShiftPlan(f12Memo(), {}).shift, false)
  assert.match(wetShiftPlan(f12Memo(), { x: 50, z: 100, y: 'junk' }).why, /junk feet/)
})

test('shiftBlocks junk reads the default; a custom distance floors in', () => {
  assert.equal(WET_SHIFT_BLOCKS, 2)
  const plan = wetShiftPlan(f12Memo(), { x: 50, z: 100, y: 59, shiftBlocks: NaN })
  assert.equal(plan.tx, 52) // the default 2
  const far = wetShiftPlan(f12Memo(), { x: 50, z: 100, y: 59, shiftBlocks: 3.9 })
  assert.equal(far.tx, 53) // floored 3
})

test('the fence constants ride the doctrine (the tunnel and a fenced climb must fit)', () => {
  assert.equal(WET_SHIFT_MIN_SLICE_MS, 90000)
  assert.equal(WET_SHIFT_TUNNEL_MAX_MS, 15000)
})

test('the wiring: the branch rides the wet-wall no-retry seam, the tunnel is the mover, the landed feet are the truth', () => {
  // the import rides the surface line (the v0.353.0 seal-cross tail rides beside its semantic siblings)
  assert.match(fleetSrc, /wetShiftPlan, wetColumnMemoBlocked, WET_SHIFT_BLOCKS, WET_SHIFT_MIN_SLICE_MS, WET_SHIFT_TUNNEL_MAX_MS, wetShiftCrossPlan, wetShiftCrossLanded, SEAL_CROSS_ROUNDS, SEAL_CROSS_SETTLE_TICKS \} from '\.\.\/src\/lib\/surface\.mjs'/, 'the shift imports ride the surface line')
  // the branch order: the escalated retry first, the wet-wall shift second, the legacy no-retry last
  const retryIdx = fleetSrc.indexOf('if (!cr.ok && retryPlan.retry) {')
  const shiftIdx = fleetSrc.indexOf("} else if (!cr.ok && cr.reason === 'wet wall') {")
  const legacyIdx = fleetSrc.lastIndexOf('console.log(`${name} final climb: no retry (${retryPlan.why})`)')
  assert.ok(retryIdx > 0 && shiftIdx > retryIdx && legacyIdx > shiftIdx, 'the shift sits between the retry and the legacy no-retry')
  // the mover is the tunnel under the shift fences
  assert.match(fleetSrc, /miner\.tunnel\(\{ x: shiftPlan\.bearing\.x, z: shiftPlan\.bearing\.z \}, \{ maxBlocks: WET_SHIFT_BLOCKS, maxMs: WET_SHIFT_TUNNEL_MAX_MS/, 'the tunnel moves the bot under the shift fences')
  // the landed column is re-checked against the memo (the one truth)
  assert.match(fleetSrc, /wetColumnMemoBlocked\(miner\.bot\._wetColumnMemo, \{ x: feet1\.x, z: feet1\.z, y: feet1\.y \}\)\.blocked/, 'the landed feet ride the memo check')
  // a shift that never left the column climbs nothing
  assert.match(fleetSrc, /wet shift stalled \(tunnel done=/, 'the stalled shift names its tunnel verdict')
  // (v0.338.0) THE SHIFT-TUNNEL PRICING - the tunnel's duration speaks at
  // every verdict: two slice-floor refusals (80s, 82s vs 90s) and zero
  // completed samples means the floor is unpriced - instrument, then price.
  const tunnelCallIdx = fleetSrc.indexOf('const tun = await miner.tunnel(')
  const startIdx = fleetSrc.indexOf('const shiftTunnelStart = Date.now()')
  const priceIdx = fleetSrc.indexOf("wet shift tunnel: ${tun?.done ?? '?'} blocks in")
  assert.ok(startIdx > 0 && startIdx < tunnelCallIdx, 'the tunnel clock opens before the mover')
  assert.ok(priceIdx > tunnelCallIdx, 'the duration speaks after the tunnel returns')
  assert.ok(fleetSrc.includes('const shiftTunnelMs = Date.now() - shiftTunnelStart'), 'the duration is measured, not asserted')
  // (v0.339.0) THE GATE NAMES ITSELF - the stall line carries the tunnel's
  // zeroWhy (the mover's first-cell verdict): three face-36679076372 attempts
  // stalled at done=0 with big slices, so the gate is the mover's, not the
  // clock's - the next pricing is aimed at the named gate.
  assert.match(fleetSrc, /wet shift stalled \(tunnel done=\$\{tun\?\.done \?\? '\?'\}\$\{tun\?\.stopped \? ` \$\{tun\.stopped\}` : ''\}\$\{tun\?\.zeroWhy \? ` - the gate: \$\{tun\.zeroWhy\}` : ''\}\)/, 'the stall line carries the mover\'s own gate verdict')
  // the shifted climb counts on the route latch (one truth per bot)
  const shiftClimbIdx = fleetSrc.indexOf('const shiftClimbFence = Math.min(PILLAR_MAX_MS, climbSliceLeft)')
  const latchIdx = fleetSrc.indexOf("(v0.321.0) the shifted climb counts too")
  assert.ok(shiftClimbIdx > 0 && latchIdx > shiftClimbIdx, 'the shifted climb feeds the route latch')
  // the min-slice fence speaks its refusal
  assert.match(fleetSrc, /s of slice cannot fund the tunnel and a fenced climb/, 'the thin-slice refusal names the economics')
})
