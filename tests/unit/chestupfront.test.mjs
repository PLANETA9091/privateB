// v0.257.0 THE UPFRONT ASCENT - the funding lever for the chest ascent (face
// 36350568199: the doom-time hook fired 3 honest refusals - the doom arrived
// with 75s/29s of leftover chain clock and the 45s climb + the 30s walk floor
// cannot be funded from the LEFTOVER by design; the severance persisted with
// the arithmetic honest). The cure moves the money EARLIER: depositToChests
// consults an OPTIONAL preAscent executor ONCE per leg, AFTER the bankable
// early-return and BEFORE the hop loop; the harness's executor prices the
// climb with the SAME quarryAscentPlan arithmetic against the YARD level,
// funded by the leg's OWN clock at its fattest moment. The lib stays pure:
// a missing hook or a throwing hook reads no climb - the leg proceeds byte
// for byte. The per-doom hook (v0.256.0) stays as the second line of defense.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { quarryAscentPlan } from '../../src/lib/surface.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const depositSrc = readFileSync(join(here, '../../src/lib/deposit.mjs'), 'utf8')
const fleetSrc = readFileSync(join(here, '../../testbed/fleet19.mjs'), 'utf8')

test('v0.257.0 wiring: the OPTIONAL preAscent defaults to null - no caller change reads the legacy shape', () => {
  assert.match(depositSrc, /onVerticalDoom = null, preAscent = null/, 'the upfront hook rides the signature TAIL, behind the v0.256.0 doom hook')
})

test('v0.257.0 wiring: the consult rides AFTER the bankable early-return and BEFORE the hop loop - an empty pocket never pays for a climb', () => {
  const emptyIdx = depositSrc.indexOf("if (bankableItems() <= 0) return { deposited: 0, chestsUsed: 0, chestReport: ['nothing to deposit'] }")
  assert.ok(emptyIdx > -1, 'the bankable early-return exists')
  const consultIdx = depositSrc.indexOf('if (typeof preAscent === \'function\') {')
  assert.ok(consultIdx > emptyIdx, 'the consult sits after the empty-pocket exit - no loot, no climb, no spend')
  const loopIdx = depositSrc.indexOf('for (let n = 0; n < maxChests && bankableItems() > 0; n++) {')
  assert.ok(loopIdx > consultIdx, 'the consult sits before the hop loop - ONCE per leg, before the scan reads the world')
  assert.ok(loopIdx - consultIdx < 2500, 'the consult rides directly ahead of the loop - the funded altitude owns the scan')
})

test('v0.257.0 wiring: junk-safe - a throwing hook reads no climb, the leg proceeds', () => {
  const consultIdx = depositSrc.indexOf('if (typeof preAscent === \'function\') {')
  assert.ok(consultIdx > -1)
  const tryIdx = depositSrc.indexOf('try { await preAscent({ budgetMs }) } catch { /* the leg proceeds, unfunded */ }', consultIdx)
  assert.ok(tryIdx > consultIdx, 'the call is wrapped - a throwing executor never kills the leg')
})

test('v0.257.0 wiring: the harness executor prices the climb with the SAME quarryAscentPlan arithmetic against the YARD level', () => {
  assert.match(fleetSrc, /const chestAscentUpfront = clockFn => async \(\{ budgetMs \} = \{\}\) => \{/, 'the upfront factory takes this leg\'s own clock')
  assert.match(fleetSrc, /return quarryAscentPlan\(\{ botY: miner\.bot\?\.entity\?\.position\?\.y, yardY: yy, remainingMs: typeof clockFn === 'function' \? clockFn\(\) : null \}\)/, 'the SAME arithmetic (dy >= 8, the slice + the floor) against the yard level')
  assert.match(fleetSrc, /const yy = yardGoal && Number\.isFinite\(yardGoal\.y\) \? yardGoal\.y : null/, 'the yard level is the climb target - the chest cluster lives there')
})

test('v0.257.0 wiring: the refusal is SILENT - a shallow bot or a starved clock is the common shape, the filter must not drown', () => {
  const execIdx = fleetSrc.indexOf('const chestAscentUpfront = clockFn => async ({ budgetMs } = {}) => {')
  assert.ok(execIdx > -1, 'the executor exists')
  const refuseIdx = fleetSrc.indexOf('if (!plan.ascend) return false', execIdx)
  assert.ok(refuseIdx > execIdx, 'the unfunded exit returns false with NO line - no spam on the common shape')
  const lineIdx = fleetSrc.indexOf('chest ascent (upfront):', refuseIdx)
  assert.ok(lineIdx > refuseIdx, 'the first honest line rides only on a FUNDED climb')
})

test('v0.257.0 wiring: the honest lines carry the (upfront) tag and ride the existing chest ascent filter key (the tail doctrine - no new key)', () => {
  assert.match(fleetSrc, /chest ascent \(upfront\): \$\{plan\.why\} - funding the climb before the leg's walks/, 'the funded line names the lever')
  assert.match(fleetSrc, /chest ascent \(upfront\): climbed \+\$\{cr\.gained \?\? '\?'\} levels \(dug \$\{cr\.dug \?\? '\?'\}, \$\{cr\.steps \?\? '\?'\} steps\) - the hop ladder is pre-funded/, 'the climbed line matches the ascent family shape')
  assert.match(fleetSrc, /chest ascent \(upfront\): failed \(\$\{cr\?\.reason \?\? 'no read'\}\) - the leg walks from here/, 'a failed climb names itself')
  assert.match(fleetSrc, /chest ascent \(upfront\): failed \(\$\{e\?\.message \?\? 'error'\}\) - the leg walks from here/, 'a throwing executor names itself')
  // The filter key UNTOUCHED: 'chest ascent (upfront)' contains 'chest ascent'
  assert.match(fleetSrc, /cobble tithe\|quarry ascent\|chest ascent/, 'the filter key stays byte for byte - the tag rides the existing key')
})

test('v0.257.0 wiring: BOTH deposit legs ride the upfront hook - the pre-smelt chain on the reserve-aware clock, the final bank on the fleet clock', () => {
  assert.match(fleetSrc, /await miner\.depositLoot\(\{ \.\.\.lootOpts\(\), onVerticalDoom: chestAscentHook\(preSmeltRemaining\), preAscent: chestAscentUpfront\(preSmeltRemaining\) \}\)/, 'the pre-smelt pre-deposit funds the climb from the reserve-aware clock')
  assert.match(fleetSrc, /await miner\.depositLoot\(\{ keep: keep\(\), budgetMs: remaining\(\), yardCenter: yardGoal, yardRadius: YARD_CHEST_RADIUS, onVerticalDoom: chestAscentHook\(remaining\), preAscent: chestAscentUpfront\(remaining\) \}\)/, 'the final bank funds the climb from the fleet clock')
})

test('v0.257.0 wiring: the executor is the miner\'s own climbOut at the YARD level, bearing toward the yard, fenced by the priced slice', () => {
  assert.match(fleetSrc, /await miner\.climbOut\(\{ dir: dir \|\| undefined, targetY: yy, force: true, maxMs: plan\.climbMs, shouldStop: \(\) => Date\.now\(\) > fenceAt \}\)/, 'the same climbOut machinery the doom hook and the mid-run ascent own')
  assert.match(fleetSrc, /const fenceAt = Date\.now\(\) \+ plan\.climbMs/, 'the fence is the priced slice - the leg clock owns the spend')
})

test('v0.257.0 arithmetic: the F18 face shape under the per-level law - the 75s leftover refuses honestly, the wall\'s own price funds', () => {
  // F18's doom arrived with 75s of LEFTOVER chain clock and refused (the
  // one-ms boundary). (v0.606.0) THE PER-LEVEL LAW re-prices this wall:
  // 27 levels x 4.2s/level = 113.4s - the flat-era flip funded a 27-level
  // wall with 45s, the funded-but-doomed slice the field priced (face
  // 37183256337: timeout 4 of 7 ascents, 0 of 7 landed). The 75s leftover
  // refuses HONESTLY now (the why names the real price) and the funded
  // door opens at the wall's own number.
  const starvedLeftover = quarryAscentPlan({ botY: 52, yardY: 79, remainingMs: 75000 })
  assert.equal(starvedLeftover.ascend, false, '75s cannot fund the 113s climb + the 30s walk floor - the honest refusal')
  assert.match(starvedLeftover.why, /cannot fund the 113s climb \+ the 30s walk floor/, 'the refusal names the real price')
  const funded = quarryAscentPlan({ botY: 52, yardY: 79, remainingMs: 143400 })
  assert.equal(funded.ascend, true, 'the wall\'s own price funds the climb the flat era doomed')
  assert.equal(funded.climbMs, 113400, 'the slice scales with the wall (27 x 4200)')
  const thin = quarryAscentPlan({ botY: 52, yardY: 79, remainingMs: 29000 })
  assert.equal(thin.ascend, false, 'a 29s clock still refuses - the arithmetic is UNTOUCHED')
  assert.match(thin.why, /cannot fund/)
  // A shallow bot never climbs (the silent refusal's arithmetic floor).
  const shallow = quarryAscentPlan({ botY: 74, yardY: 79, remainingMs: 300000 })
  assert.equal(shallow.ascend, false, 'dy 5 below the ascent floor - the leg proceeds without a spend')
  // The junk family stays honest.
  assert.equal(quarryAscentPlan({}).ascend, false)
  assert.equal(quarryAscentPlan({ botY: 52, yardY: null, remainingMs: 90000 }).ascend, false)
  assert.equal(quarryAscentPlan({ botY: 52, yardY: 79, remainingMs: null }).ascend, false)
})

test('v0.257.0 composition: the doom-time hook stays whole - the upfront climb composes with the v0.256.0 second line of defense', () => {
  // The v0.256.0 pins read the SAME tree: the doom branch, the hook call and
  // the re-evaluation survive byte for byte above the upfront consult.
  assert.match(depositSrc, /if \(doom\.doom && typeof onVerticalDoom === 'function'\) \{/, 'the doom hook consult exists')
  assert.match(depositSrc, /try \{ climbed = await onVerticalDoom\(\{ chestPos: chest\.position, doom \}\) \} catch \{ climbed = false \}/, 'the doom-time executor rides inside the loop')
  assert.match(depositSrc, /if \(climbed\) doom = chestVerticalDoom\(\{ botPos: bot\?\.entity\?\.position \?\? null, chestPos: chest\.position \}\)/, 'the re-evaluation from the new altitude stays whole')
  assert.match(depositSrc, /chest skip \(vertical doom: \$\{doom\.why\} - the walk ladder cannot climb\)/, 'the legacy skip line stays byte for byte')
})
