// Tests for the climb dig's still-there re-arm (v0.309.0).
//
// MEASURED (fleet 36547556739, the 0.307.0+0.308.0 face, COMPLETED SUCCESS
// but 3 of 4 zero-banks rode 'still underground after 2 climb attempts'):
// F1's end-phase burned both climb attempts (90s + 54s fences) on ONE
// flooded-band cell class - 6x 'climb diag: ... dig failed at [...]
// diorite (held=wooden_pickaxe, airborne, post=diorite STILL THERE (server
// never broke it))' - and 261u rode the write-off row. The heartbeat
// cadence prices each failed dig at ~20s (= the DRY 200t window at the
// relogged client's half-rate tick clock), while wooden-pick diorite under
// the vanilla wet x5 + airborne x5 stack needs ~562 SERVER progress ticks:
// the eye/feet wet read (an air pocket, on a client that had just relogged)
// took the dry window, the server priced the dig from its own (desynced or
// bounding-box-wet) state, and the STOP spam could never cover the price.
// THE CURE: when the stale recheck says STILL THERE and the dig ran the dry
// window, re-arm the SAME cell once at the flooded window (800t). The
// v0.42.0 wet-escape route stays the wet failure's owner; a wet-window dig
// that still reads STILL THERE is a genuine verdict and never re-arms.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CLIMB_DIG_TICKS, CLIMB_DIG_TICKS_WET, CLIMB_REARM_TICKS, climbRearmTicks
} from '../../src/lib/surface.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('climbRearmTicks: the F1 datum - a dry-window dig that reads STILL THERE re-arms at the flooded window', () => {
  assert.equal(climbRearmTicks({ digWindow: CLIMB_DIG_TICKS, postLanded: false }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbRearmTicks({ digWindow: 200, postLanded: false }), 800)
})

test('climbRearmTicks: a dig that already ran the flooded window never re-arms (the wet-escape route owns the wet failure)', () => {
  assert.equal(climbRearmTicks({ digWindow: CLIMB_DIG_TICKS_WET, postLanded: false }), 0)
  assert.equal(climbRearmTicks({ digWindow: 1200, postLanded: false }), 0, 'a wider caller override is honoured - the cap guards the re-arm, not the intent')
})

test('climbRearmTicks: only the strict STILL THERE verdict re-arms', () => {
  assert.equal(climbRearmTicks({ digWindow: CLIMB_DIG_TICKS, postLanded: true }), 0, 'a LANDED dig belongs to the stale-read recovery, not the re-arm')
  assert.equal(climbRearmTicks({ digWindow: CLIMB_DIG_TICKS, postLanded: null }), 0, 'an unknown post read has no evidence the server held the cell')
  assert.equal(climbRearmTicks({ digWindow: CLIMB_DIG_TICKS, postLanded: undefined }), 0)
  assert.equal(climbRearmTicks({ digWindow: CLIMB_DIG_TICKS, postLanded: 'junk' }), 0)
  assert.equal(climbRearmTicks({ digWindow: CLIMB_DIG_TICKS }), 0, 'an absent verdict re-arms nowhere')
})

test('climbRearmTicks: junk digWindow reads as the dry window (the conservative honest price)', () => {
  // the F1 log line carries no window field - a missing read must still
  // re-arm, never silently agree with the misprice
  assert.equal(climbRearmTicks({ postLanded: false }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbRearmTicks({ digWindow: NaN, postLanded: false }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbRearmTicks({ digWindow: 'junk', postLanded: false }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbRearmTicks({ digWindow: null, postLanded: false }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbRearmTicks(null), 0, 'a fully junk call has no verdict - no re-arm')
})

test('climbRearmTicks: the re-arm window honours a caller override and junk falls to the flooded default', () => {
  assert.equal(climbRearmTicks({ digWindow: 200, postLanded: false, rearmTicks: 300 }), 300)
  assert.equal(climbRearmTicks({ digWindow: 300, postLanded: false, rearmTicks: 300 }), 0, 'ran >= wet never re-arms, whatever the window')
  assert.equal(climbRearmTicks({ digWindow: 200, postLanded: false, rearmTicks: NaN }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbRearmTicks({ digWindow: 200, postLanded: false, rearmTicks: 0 }), CLIMB_DIG_TICKS_WET, 'a zero rearmTicks is junk, not a disabled re-arm')
  assert.equal(climbRearmTicks({ digWindow: 200, postLanded: false, rearmTicks: -5 }), CLIMB_DIG_TICKS_WET)
})

test('climbRearmTicks: the window constants keep the v0.39.0 / v0.42.0 pins', () => {
  assert.equal(CLIMB_DIG_TICKS, 200, 'the dry patient window (v0.39.0)')
  assert.equal(CLIMB_DIG_TICKS_WET, 800, 'the flooded window (v0.42.0) = 40s')
  assert.equal(CLIMB_REARM_TICKS, CLIMB_DIG_TICKS_WET, 'the re-arm rides the flooded window')
})

test('wiring: the re-arm sits between the stale recheck and the refusal forensics, one attempt, pass-alive on landing', () => {
  const iRecheck = minerSrc.indexOf("await settleTicks(12, 'climb dig stale recheck')")
  const iLanded = minerSrc.indexOf('if (isDigLanded(post)) {', iRecheck)
  const iRearm = minerSrc.indexOf('climbRearmTicks({ digWindow, postLanded: false, rearmTicks: CLIMB_REARM_TICKS })')
  const iFailCell = minerSrc.indexOf('digFailCell = {', iLanded)
  assert.ok(iRecheck !== -1, 'the stale recheck call site exists')
  assert.ok(iLanded !== -1 && iLanded > iRecheck, 'the verdict read follows the recheck')
  assert.ok(iRearm !== -1 && iRearm > iLanded && iRearm < iFailCell, 'the re-arm sits after the STILL THERE verdict, before the refusal forensics')
  assert.ok(minerSrc.includes('await bot.fastDig(cellB, { maxTicks: rearmTicks })'), 'the re-arm digs the SAME cell at the re-arm window')
  const iRearmLanded = minerSrc.indexOf("climb dig: still-there re-arm landed at [${cellPos.x},${cellPos.y},${cellPos.z}] (${cellB.name})", iRearm)
  assert.ok(iRearmLanded !== -1 && iRearmLanded < iFailCell, 'a landed re-arm logs and keeps the pass alive before the refusal is built')
  assert.ok(minerSrc.includes("climb dig: still-there re-arm failed at [${cellPos.x},${cellPos.y},${cellPos.z}] (${cellB.name})"), 'a refused re-arm names itself in the climb dig family')
})

test('wiring: the re-arm is bounded per climb and the counters are climb-scoped', () => {
  assert.ok(minerSrc.includes('let stillThereRearms = 0'), 'the landed counter is climb-scoped')
  assert.ok(minerSrc.includes('let stillThereRearmFails = 0'), 'the failed counter is climb-scoped')
  assert.ok(minerSrc.includes('if (stillThereRearms++ < 3)'), 'the landed re-arm logs the first 3')
  assert.ok(minerSrc.includes('if (++stillThereRearmFails <= 2)'), 'the failed re-arm logs the first 2')
})

test('wiring: the pure function is imported from surface.mjs beside the window selector it prices', () => {
  assert.ok(/import\s*{[^}]*climbRearmTicks[^}]*}\s*from\s*'\.\.\/lib\/surface\.mjs'/s.test(minerSrc), 'climbRearmTicks rides the surface import')
  assert.ok(/import\s*{[^}]*CLIMB_REARM_TICKS[^}]*}\s*from\s*'\.\.\/lib\/surface\.mjs'/s.test(minerSrc), 'CLIMB_REARM_TICKS rides the surface import')
})
