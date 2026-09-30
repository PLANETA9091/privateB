// (v0.367.0) THE SHORE-STALL YIELD pins - the bearing branch joins the latch.
// Face 36750791170's F10/F14 paid the gap the v0.82.0 latch left open: the
// land branch got the progress latch (run76's F9 steered at d=7 that never
// shrank), but the SHORE-BEARING branch kept swimming a bearing the walls
// owned for the WHOLE budget - 'rescue blind live' then 'rescue timeout
// (still wet, 14/44 passes, 0 probes, tail dry/dry/dry)' - while the release
// sat one branch below, unreachable while a bearing existed (the chain only
// reached it when dir AND land both missed). The cure mirrors the land
// branch byte for byte: the same transitStalled patience, the same rescue-
// wide flag, one log line to name the yield.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transitStalled, TRANSIT_STALL_PASSES, TRANSIT_STALL_MARGIN } from '../../src/lib/drowning.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('shore-yield wiring: the dir branch gates on the rescue-wide stall flag', () => {
  assert.ok(minerSrc.includes('if (dir && !transitStalledFlag) {'),
    'the shore-bearing branch must respect the stall latch (the land branch shape)')
  assert.ok(minerSrc.includes("} else if (land && !transitStalledFlag) {"),
    'the land branch keeps its own latch gate - the mirror must not erase it')
})

test('shore-yield wiring: the dir branch runs the same transitStalled patience', () => {
  const dirIdx = minerSrc.indexOf('if (dir && !transitStalledFlag) {')
  const landIdx = minerSrc.indexOf("} else if (land && !transitStalledFlag) {")
  assert.ok(dirIdx > 0 && landIdx > dirIdx, 'the dir branch precedes the land branch')
  const dirBranch = minerSrc.slice(dirIdx, landIdx)
  assert.ok(dirBranch.includes('transitStalled({'), 'the dir branch condemns via transitStalled (the shared pure gate)')
  assert.ok(dirBranch.includes('dirPlan.d0'), 'the latch tracks the ring radius from first sight (d0)')
  assert.ok(dirBranch.includes('passNo - dirPlan.atPass'), 'the patience counts the passes on THIS bearing')
  assert.ok(dirBranch.includes('transitStalledFlag = true'),
    'the yield sets the SAME rescue-wide flag the land branch sets - one flag, one policy')
})

test('shore-yield wiring: the stall names itself once, on the water filter key', () => {
  const dirIdx = minerSrc.indexOf('if (dir && !transitStalledFlag) {')
  const landIdx = minerSrc.indexOf("} else if (land && !transitStalledFlag) {")
  const dirBranch = minerSrc.slice(dirIdx, landIdx)
  assert.ok(minerSrc.includes('shore transit stalled (r='),
    'the yield log line exists (the land branch twin says "transit stalled", the bearing branch says "shore transit stalled")')
  const lineIdx = minerSrc.indexOf('shore transit stalled (r=')
  const lineEnd = minerSrc.indexOf('\n', lineIdx)
  const logCall = minerSrc.slice(minerSrc.lastIndexOf('log(', lineIdx), lineEnd)
  assert.ok(logCall.includes('water:'), 'the line rides the existing water filter key - no new filter wiring')
  assert.ok(dirBranch.includes('if (!dirPlan.logged) {'), 'the line speaks once per rescue (the logged latch guards the call)')
  assert.ok(dirBranch.includes('dirPlan.logged = true'), 'the latch stamps after speaking')
  assert.ok(logCall.includes('the release takes over'), 'the line names the takeover (the land branch doctrine)')
})

test('shore-yield wiring: the dirPlan latch is declared beside the land latch', () => {
  assert.ok(minerSrc.includes('let dirPlan = null'),
    'the bearing latch has its own state (the land latch must not carry it)')
  assert.ok(minerSrc.includes('let transitPlan = null'),
    'the land latch keeps its own state - the latches stay separate, the flag is shared')
})

test('shore-yield wiring: the yield falls through to the release branch', () => {
  const releaseIdx = minerSrc.indexOf('} else if (openWaterRelease({')
  const landIdx = minerSrc.indexOf("} else if (land && !transitStalledFlag) {")
  assert.ok(releaseIdx > landIdx, 'the open-water release still follows the land branch - the stall flag makes it reachable while a bearing exists')
})

test('shore-yield wiring: the stalled pass swims NOTHING (the else keeps the swim)', () => {
  const dirIdx = minerSrc.indexOf('if (dir && !transitStalledFlag) {')
  const landIdx = minerSrc.indexOf("} else if (land && !transitStalledFlag) {")
  const dirBranch = minerSrc.slice(dirIdx, landIdx)
  const swimIdx = dirBranch.indexOf("bot.setControlState('jump', true)")
  const stallIdx = dirBranch.indexOf('transitStalled({')
  assert.ok(swimIdx > stallIdx, 'the swim lives in the else of the stall test - a condemned bearing never steers')
  assert.ok(dirBranch.includes("await settle(8)"), 'the healthy path keeps the settle(8) swim byte for byte')
})

test('transitStalled: the patience the bearing branch inherits (the r=1-forever shape)', () => {
  // F14's shape: a shore one ring away it can never climb out of - r flat at
  // 1 condemns (b > a - margin with b == a), patience intact below the cap.
  assert.equal(transitStalled({ d0: 1, d: 1, passes: TRANSIT_STALL_PASSES }), true,
    'r never shrinks for the full patience - the walls own this swim')
  assert.equal(transitStalled({ d0: 1, d: 1, passes: TRANSIT_STALL_PASSES - 1 }), false,
    'patience first: a short stall keeps the plan')
  assert.equal(transitStalled({ d0: 3, d: 1, passes: TRANSIT_STALL_PASSES }), false,
    'a closing bearing (r 3 -> 1) is progress, never condemned')
  assert.equal(transitStalled({ d0: 3, d: 3 - TRANSIT_STALL_MARGIN, passes: TRANSIT_STALL_PASSES }), false,
    'closing exactly the margin is progress (b > a - margin is the condemn test)')
  assert.equal(transitStalled({ d0: null, d: 1, passes: TRANSIT_STALL_PASSES }), false,
    'junk distances never condemn (the Number(null) hole stays plugged)')
})
