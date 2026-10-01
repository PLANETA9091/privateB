// v0.256.0 THE CHEST ASCENT - the deposit hop loop's climb-before-skip, the
// cure for the F12 chest-selection severance (face 36346860061: 11x
// 'chest skip (vertical doom: 27-29 levels up)' - the yard chest selection
// refused EVERY chest while the mid-run ascent (v0.255.0) wired only the
// 'bank:' walk form; F12's pocket rode the deadline and paid a 219u death
// drop). The lib stays pure: the doom branch consults an OPTIONAL
// onVerticalDoom hook, re-evaluates the strict gate from the climbed
// altitude, and keeps the legacy skip byte for byte when no hook rides, the
// hook refuses, or the hook throws. The executor lives in the harness
// (fleet19.mjs): the SAME quarryAscentPlan arithmetic + the miner's own
// climbOut, the same shape the v0.255.0 ascent runs for the 'bank:' walk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { quarryAscentPlan } from '../../src/lib/surface.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const depositSrc = readFileSync(join(here, '../../src/lib/deposit.mjs'), 'utf8')
const fleetSrc = readFileSync(join(here, '../../testbed/fleet19.mjs'), 'utf8')

test('v0.256.0 wiring: the doom branch consults the OPTIONAL hook BEFORE the legacy skip, the gate re-evaluates after a climb', () => {
  const gateIdx = depositSrc.indexOf("let doom = chestVerticalDoom({ botPos: bot?.entity?.position ?? null, chestPos: chest.position })")
  assert.ok(gateIdx > -1, 'the doom consult exists (let - the re-evaluation rebinds)')
  const hookGateIdx = depositSrc.indexOf("if (doom.doom && typeof onVerticalDoom === 'function') {")
  assert.ok(hookGateIdx > gateIdx, 'the hook is consulted ONLY on a live doom - a clean chest never pays the call')
  const hookCallIdx = depositSrc.indexOf('try { climbed = await onVerticalDoom({ chestPos: chest.position, doom }) } catch { climbed = false }')
  assert.ok(hookCallIdx > hookGateIdx, 'the hook call rides inside the doom branch, junk-safe (a throw reads no climb)')
  const reDoomIdx = depositSrc.indexOf('if (climbed) doom = chestVerticalDoom({ botPos: bot?.entity?.position ?? null, chestPos: chest.position })')
  assert.ok(reDoomIdx > hookCallIdx, 'after a climb the strict gate RE-EVALUATES from the new altitude')
  const skipIdx = depositSrc.indexOf("log(`[${bot.username ?? 'bot'}] chest skip (vertical doom: ${doom.why} - the walk ladder cannot climb)`)", reDoomIdx)
  assert.ok(skipIdx > reDoomIdx, 'the legacy skip line rides AFTER the hook block - the skip stays byte for byte')
  // (v0.303.0) the anchor restated on the post-yard-grace tree: the hop call
  // threads the chain's yardGraceHolder - the gate-before-walk ORDER the pin
  // owns is untouched.
  // (v0.416.0) the call rides the chain net now (res = await inside try) -
  // the mid-visit guard's arm 2; the gate-before-walk ORDER is untouched.
  const walkIdx = depositSrc.indexOf('res = await depositToChest(bot, { chestBlock: chest, keep, log, budgetMs: remaining(), noPathLedger, fullChestLedger, yardGraceHolder: yardGrace })')
  assert.ok(walkIdx > skipIdx, 'a cleared doom falls through to the legacy hop - the climb buys the ladder its route')
  assert.match(depositSrc, /onVerticalDoom = null/, 'the hook defaults to null - no caller change reads the legacy shape')
})

test('v0.256.0 wiring: the legacy skip shape stays whole for the no-hook callers', () => {
  // The v0.188.0 pin's anchors restated on the post-ascent tree: the skip
  // line, the tried-set and the continue survive byte for byte.
  assert.match(depositSrc, /chest skip \(vertical doom: \$\{doom\.why\} - the walk ladder cannot climb\)/, 'the skip line names the class in the family shape')
  const skipIdx = depositSrc.indexOf("log(`[${bot.username ?? 'bot'}] chest skip (vertical doom: ${doom.why} - the walk ladder cannot climb)`)")
  const triedIdx = depositSrc.indexOf('tried.push(typeof chest.position.floored', skipIdx)
  assert.ok(triedIdx > -1 && triedIdx - skipIdx < 200, 'the doomed chest joins the tried-set right after the line')
})

test('v0.256.0 wiring: the harness executor prices the climb with the SAME arithmetic and owns the honest lines', () => {
  assert.match(fleetSrc, /const chestAscentHook = clockFn => async \(\{ chestPos, doom \}\) => \{/, 'the hook factory takes this chain\'s own clock')
  assert.match(fleetSrc, /return quarryAscentPlan\(\{ botY: miner\.bot\?\.entity\?\.position\?\.y, yardY: cy, remainingMs: typeof clockFn === 'function' \? clockFn\(\) : null \}\)/, 'the SAME quarryAscentPlan arithmetic (dy >= 8, the slice + the floor)')
  assert.match(fleetSrc, /await miner\.climbOut\(\{ dir: dir \|\| undefined, targetY: cy, force: true, maxMs: plan\.climbMs, shouldStop: \(\) => Date\.now\(\) > fenceAt \}\)/, 'the executor is the miner\'s own climbOut at the CHEST\'s level, fenced by the priced slice')
  assert.match(fleetSrc, /chest ascent: \$\{doom\?\.why \?\? 'vertical doom'\} - climbing toward the chest before the hop/, 'the climb line names the doom it answers')
  assert.match(fleetSrc, /chest ascent: climbed \+\$\{cr\.gained \?\? '\?'\} levels \(dug \$\{cr\.dug \?\? '\?'\}, \$\{cr\.steps \?\? '\?'\} steps\) - the hop gets its route/, 'the climbed line matches the ascent family shape')
  assert.match(fleetSrc, /chest ascent: refused \(\$\{plan\.why\}\) - the skip stands/, 'a starved clock refuses honestly and keeps the skip')
  assert.match(fleetSrc, /chest ascent: failed \(\$\{cr\?\.reason \?\? 'no read'\}\) - the skip stands/, 'a failed climb names itself and keeps the skip')
  assert.match(fleetSrc, /chest ascent: failed \(\$\{e\?\.message \?\? 'error'\}\) - the skip stands/, 'a throwing executor reads no climb')
})

test('v0.256.0 wiring: BOTH deposit legs ride the hook - the pre-smelt chain on its own clock, the final bank on the fleet clock', () => {
  // (v0.257.0) the anchor update: both legs ALSO ride the upfront executor
  // (preAscent) - the doom hook's presence per leg is the pin's intent, the
  // upfront rider is the funding lever's wiring (chestupfront.test.mjs owns
  // its own pins).
  assert.match(fleetSrc, /await miner\.depositLoot\(\{ \.\.\.lootOpts\(\), onVerticalDoom: chestAscentHook\(preSmeltRemaining\), preAscent: chestAscentUpfront\(preSmeltRemaining\) \}\)/, 'the pre-smelt pre-deposit rides the hook on the reserve-aware clock')
  assert.match(fleetSrc, /await miner\.depositLoot\(\{ keep: keep\(\), budgetMs: remaining\(\), yardCenter: yardGoal, yardRadius: YARD_CHEST_RADIUS, onVerticalDoom: chestAscentHook\(remaining\), preAscent: chestAscentUpfront\(remaining\) \}\)/, 'the final bank rides the hook on the fleet clock')
})

test('v0.256.0 wiring: the filter key carries the chest ascent at the TAIL band (the sequence pins read the head verbatim)', () => {
  // The v0.249.0 tail doctrine: a new key rides BEHIND the last key
  // ('quarry ascent') - the drops/hop-doom pins read the head band verbatim
  // and stay whole.
  assert.match(fleetSrc, /cobble tithe\|quarry ascent\|chest ascent/, "chest ascent rides the tail, behind quarry ascent")
})

test('v0.256.0 arithmetic: the F12 face shape is the funded ascent, the starved clock and the junk shapes stay honest refusals', () => {
  // F12's own shape: the dig floor y~52, the yard chests y~79 (27 levels up).
  const funded = quarryAscentPlan({ botY: 52, yardY: 79, remainingMs: 90000 })
  assert.equal(funded.ascend, true, 'a 27-level chest with 90s of chain clock ascends')
  assert.equal(funded.dy, 27)
  assert.equal(funded.climbMs, 45000, 'the climb slice is the calibration constant')
  // The starved chain: the same wall with 60s left cannot fund 45+30.
  const starved = quarryAscentPlan({ botY: 52, yardY: 79, remainingMs: 60000 })
  assert.equal(starved.ascend, false, 'the starved clock refuses - the legacy skip stands')
  assert.match(starved.why, /cannot fund/)
  // The one-ms-short boundary: 74999ms < 75000ms needed.
  const boundary = quarryAscentPlan({ botY: 52, yardY: 79, remainingMs: 74999 })
  assert.equal(boundary.ascend, false, 'one ms short of the slice+floor refuses')
  const fundedB = quarryAscentPlan({ botY: 52, yardY: 79, remainingMs: 75000 })
  assert.equal(fundedB.ascend, true, 'exactly funded ascends')
  // The junk family: no read, no climb, no crash.
  assert.equal(quarryAscentPlan({}).ascend, false)
  assert.equal(quarryAscentPlan({ botY: NaN, yardY: 79, remainingMs: 90000 }).ascend, false)
  assert.equal(quarryAscentPlan({ botY: 52, yardY: null, remainingMs: 90000 }).ascend, false)
  assert.equal(quarryAscentPlan({ botY: 52, yardY: 79, remainingMs: null }).ascend, false)
  // The below-floor dy: a 7-level chest stays legacy (the doom gate itself
  // would not have fired at dy < 20 for the hop form anyway).
  const shallow = quarryAscentPlan({ botY: 72, yardY: 79, remainingMs: 90000 })
  assert.equal(shallow.ascend, false, 'dy 7 is below the ascent floor')
})
