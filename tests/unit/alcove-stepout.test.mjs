// (v0.552.0) THE ALCOVE STEP-OUT - wiring pins on the integration placeMachine.
// CI 37122030094: the fall-in class (the bot drifting into its own fresh carve)
// made the ONE guaranteed-dry cell unscannable forever - the v0.406.0 anchor
// honor skipped the feet-occupied cell, the rings read all-skip on aquifer
// terrain (skipped=24 rejected=0 twice), and the assert fired on a placement
// the bot could have made by stepping out. The cure lives in the integration
// helper (module-local, not importable), so the pins ride the source bytes:
// the step-out seat exists, the jump control is held AND released (the control
// state never leaks), the dry-cell law guards the step-out BEFORE the jump,
// the rounds are capped (the step-out never spins), and the legacy anchor
// scan survives byte-identically (the rings stay the floor).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../integration/smelting.test.mjs', import.meta.url), 'utf8')

test('THE SEAT (v0.552.0): the anchor honor hands the fall-in class to the step-out', () => {
  assert.ok(src.includes('} else {'), 'the anchor honor carries the fall-in branch')
  assert.equal((src.match(/await stepOutPlace\(bot, itemName, preferredCell, attemptCell\)/g) || []).length, 1, 'exactly one step-out seat inside placeMachine')
  assert.equal((src.match(/async function stepOutPlace/g) || []).length, 1, 'exactly one helper definition')
})

test('THE PHYSICS: the jump is held and released - the control state never leaks', () => {
  assert.ok(src.includes("bot.setControlState('jump', true)"), 'the jump hold present (the hitbox vacates at apex)')
  assert.ok(/finally\s*\{\s*try \{ bot\.setControlState\('jump', false\) \} catch/.test(src), 'the release rides the finally (any failure un-jumps)')
})

test('THE DRY-CELL LAW COMPOSES: the step-out refuses a fluid cell before the jump', () => {
  const body = src.slice(src.indexOf('async function stepOutPlace'), src.indexOf('// GRAVITY-BLOCK GUARD'))
  assert.ok(/water\|lava/.test(body), 'the fluid-name guard lives INSIDE the helper (the placement never rides water)')
  assert.ok(body.includes("boundingBox !== 'block'"), 'the floor guard lives inside the helper (the placement rides a solid floor)')
})

test('THE BOUND: two jump rounds, then the rings take over', () => {
  const body = src.slice(src.indexOf('async function stepOutPlace'), src.indexOf('// GRAVITY-BLOCK GUARD'))
  assert.ok(body.includes('round < 2'), 'the round cap present (the step-out never spins)')
  assert.ok(body.includes('both jump rounds refused'), 'the honest refusal names itself (the legacy all-skip signature stays readable)')
})

test('THE LEGACY FLOOR: the anchor scan and the rings survive byte-identically', () => {
  assert.ok(src.includes('if (!feetB || !preferredCell.equals(feetB.position)) {'), 'the legacy honor condition unchanged')
  assert.ok(src.includes('const placed = await scanCell(preferredCell)'), 'the legacy anchor scan unchanged')
  assert.ok(src.includes('if (feetB && cell.equals(feetB.position)) continue'), 'the rings still refuse the feet cell (the fall-through path intact)')
})
