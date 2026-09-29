// Tests for the climb's well pounce (v0.311.0).
//
// MEASURED (fleet 36566021862, the double-0.309.0 + 0.310.0 face, the FIRST
// full 600s survival since the OOM season: alive=19/19, mined=2361 @ 3.94 b/s,
// banked=1117): the climb chain is now THE banked killer - 9 of 19 bots ended
// 'still underground after N climb attempts' and the deadline write-off rode
// 1120u unbanked. The climb diag census splits the loss: 41 wet-wall lines
// (dug=0, the flooded levels) and 10 'did not rise' lines of which 8 read the
// SAME signature: feet=air support=stone step=air head=air - the v0.27.0 1x1
// WELL: the raw stepUp fails because pressed against the step face the
// collision zeroes horizontal velocity while the jump arc needs it, the
// assist goto needs the run-up the well cannot offer (NoPath), the gallery
// digs an L the guards often refuse, the rotate burns the fail budget.
// THE CURE: the pathfinder's own jump-edge trick by hand - back off the face
// press a few ticks, then forward+jump the long hold at the same bearing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CLIMB_POUNCE_BACK_TICKS, CLIMB_POUNCE_JUMP_TICKS, climbPouncePlan
} from '../../src/lib/surface.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('climbPouncePlan: the fleet datum - the 8/10 well signature plans the pounce at the pinned holds', () => {
  assert.deepEqual(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: true }), { back: 4, jump: 24 })
  assert.deepEqual(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: true }), { back: CLIMB_POUNCE_BACK_TICKS, jump: CLIMB_POUNCE_JUMP_TICKS })
})

test('climbPouncePlan: a partial signature stays with the existing ladder (null)', () => {
  assert.equal(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: false }), null, 'no head clearance - the arc has nowhere to go')
  assert.equal(climbPouncePlan({ supportSolid: true, stepOpen: false, headOpen: true }), null, 'a closed step is dig work, not jump work')
  assert.equal(climbPouncePlan({ supportSolid: false, stepOpen: true, headOpen: true }), null, 'no wall to climb - the bot can just walk')
  assert.equal(climbPouncePlan({ supportSolid: true, stepOpen: false, headOpen: false }), null)
  assert.equal(climbPouncePlan({ supportSolid: false, stepOpen: false, headOpen: false }), null)
  assert.equal(climbPouncePlan({}), null)
})

test('climbPouncePlan: only the strict true booleans arm the pounce (the junk battery)', () => {
  assert.equal(climbPouncePlan({ supportSolid: 1, stepOpen: true, headOpen: true }), null)
  assert.equal(climbPouncePlan({ supportSolid: 'true', stepOpen: true, headOpen: true }), null)
  assert.equal(climbPouncePlan({ supportSolid: true, stepOpen: 1, headOpen: true }), null)
  assert.equal(climbPouncePlan({ supportSolid: true, stepOpen: 'yes', headOpen: true }), null)
  assert.equal(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: null }), null)
  assert.equal(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: undefined }), null)
})

test('climbPouncePlan: the strict-false battery never throws and never arms (the Number(null) lesson, sixth strike)', () => {
  assert.equal(climbPouncePlan(null), null)
  assert.equal(climbPouncePlan(undefined), null)
  assert.equal(climbPouncePlan(false), null)
  assert.equal(climbPouncePlan(0), null)
  assert.equal(climbPouncePlan(''), null)
})

test('climbPouncePlan: the holds honour a caller override and junk falls to the pinned defaults', () => {
  assert.deepEqual(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: true, back: 6, jump: 30 }), { back: 6, jump: 30 })
  assert.deepEqual(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: true, back: NaN }), { back: 4, jump: 24 })
  assert.deepEqual(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: true, jump: 'junk' }), { back: 4, jump: 24 })
  assert.deepEqual(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: true, back: 0 }), { back: 4, jump: 24 }, 'a zero hold is junk - the back-off must actually move')
  assert.deepEqual(climbPouncePlan({ supportSolid: true, stepOpen: true, headOpen: true, jump: -5 }), { back: 4, jump: 24 })
})

test('the pounce constants stay pinned to the fleet-priced holds', () => {
  assert.equal(CLIMB_POUNCE_BACK_TICKS, 4)
  assert.equal(CLIMB_POUNCE_JUMP_TICKS, 24)
})

test('wiring: the pounce sits after the walkable-surface exit and BEFORE the rise-recovery ladder', () => {
  const surf = minerSrc.indexOf("reason: 'walkable surface'")
  const pounce = minerSrc.indexOf('climbPouncePlan({')
  const recovery = minerSrc.indexOf('riseRecoveryPlan({')
  assert.ok(surf > -1 && pounce > -1 && recovery > -1, 'all three markers exist')
  assert.ok(surf < pounce, 'the walkable-surface exit owns the already-out verdict first')
  assert.ok(pounce < recovery, 'the pounce is the cheap cure - the A* ladder only spends what the pounce could not break')
})

test('wiring: the pounce is dry-feet only, climb-scoped capped, and counts on the attempt', () => {
  assert.ok(minerSrc.includes('!rose && wellPounces < 2 && !isWetCell(readCell(feetNow))'), 'the wet levels keep the longHold lane, the cap keeps the climb bounded')
  assert.ok(minerSrc.includes('let wellPounces = 0'), 'the climb-scoped counter is declared')
  assert.ok(minerSrc.includes('wellPounces++'), 'the attempt counts before it runs - a throw still spends the try')
})

test('wiring: the pounce choreography releases the face press before the arc', () => {
  const start = minerSrc.indexOf('// (v0.311.0) THE WELL POUNCE')
  const end = minerSrc.indexOf('climb pounce: did not rise')
  const block = minerSrc.slice(start, end)
  const backOn = block.indexOf("bot.setControlState('backward', true)")
  const backOff = block.indexOf("bot.setControlState('backward', false)")
  const fwdOn = block.indexOf("bot.setControlState('forward', true)")
  const jumpOn = block.indexOf("bot.setControlState('jump', true)")
  assert.ok(backOn > -1 && backOff > -1 && fwdOn > -1 && jumpOn > -1, 'the whole choreography lives inside the pounce block')
  assert.ok(backOff > backOn, 'the backward state is released')
  assert.ok(fwdOn > backOff, 'the forward state follows the back-off')
  assert.ok(jumpOn > fwdOn, 'the jump arms with the forward drive')
})

test('wiring: the pounce names both outcomes and the landed path re-enters the loop as a rise', () => {
  assert.ok(minerSrc.includes('climb pounce: landed y='), 'the landed line names the new y and the holds')
  assert.ok(minerSrc.includes('climb pounce: did not rise'), 'the failed line hands the ladder its evidence')
  assert.ok(/feetPounce\.y > feetNow\.y\) \{\s*\n\s*steps\+\+; fails = 0[^\n]*\n\s*log\(\`\$\{tag\} climb pounce: landed/.test(minerSrc), 'a landed pounce books steps, clears fails and continues')
})

test('wiring: the pounce plan reads the same three cells the diag line names', () => {
  assert.ok(minerSrc.includes('readCell(feetNow.offset(d.x, 0, d.z))'), 'support = the feet-level block toward the bearing')
  assert.ok(minerSrc.includes('readCell(feetNow.offset(d.x, 1, d.z))'), 'step = the block above the support')
  assert.ok(minerSrc.includes('readCell(feetNow.offset(0, 2, 0))'), 'head = the clearance above the bot')
  assert.ok(minerSrc.includes("supportB.boundingBox === 'block'"), 'solid means a real collision box')
  assert.ok(minerSrc.includes("stepB.boundingBox === 'empty'"), 'open means an empty box')
  assert.ok(minerSrc.includes("headB.boundingBox === 'empty'"), 'clearance means an empty box')
})

test('wiring: the surface import carries the pounce trio', () => {
  assert.ok(minerSrc.includes('climbPouncePlan, CLIMB_POUNCE_BACK_TICKS, CLIMB_POUNCE_JUMP_TICKS'), 'the import names the plan and both holds')
})
