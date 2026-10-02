//
// toolrecovery.test.mjs - THE RECOVERY BOOK (v0.492.0) unit tests.
// The lines are byte-verbatim from the stored faces (face 42 = run108,
// face 43 = run84a fleet19.log), in the live order - hand-traced first
// (opens 13 == terminals 13 / opens 6 == terminals 6), then pinned.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  toolRecovery, RECOVERY_OPEN_RE, RECOVERY_SPARE_OK_RE,
  RECOVERY_MID_FAIL_RE, RECOVERY_TERMINAL_RE,
  RECOVERY_SURFACED_RE, RECOVERY_CLIMB_REFUSED_RE
} from '../../src/lib/toolrecovery.mjs'

// Face 42's recovery lane (run108), verbatim and in the live order:
// 13 episodes - eight OK (F6 wooden-only; F2/F7/F1/F18 the full kit;
// F5 wooden after TWO failed terminals - the reboot chain; F11 the
// wooden+stone+stone double; F14 wooden after one failed), five
// FAILED (F5 'none' twice, F8/F12 the table leg, F14 'none'). The
// mid-fails ride between: stick-drought x10, materials x1, table x1,
// and F14's 'undefined' - the emitter's own honest gap.
const FACE42_MINI = [
  'F6 tool recovery: no pickaxe - spare-pick craft first',
  'F6 tool recovery: spare craft failed (no pickaxe materials (need 3 ingots / 3 cobble / 3 planks of ONE type)) - re-running the bootstrap',
  'F5 tool recovery: no pickaxe - spare-pick craft first',
  'F5 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F5 tool recovery: failed (none)',
  'F5 tool recovery: no pickaxe - spare-pick craft first',
  'F5 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F5 tool recovery: failed (none)',
  'F6 tool recovery: OK (wooden_pickaxe)',
  'F2 tool recovery: no pickaxe - spare-pick craft first',
  'F2 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F7 tool recovery: no pickaxe - spare-pick craft first',
  'F7 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F1 tool recovery: no pickaxe - spare-pick craft first',
  'F1 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F2 tool recovery: OK (wooden_pickaxe,stone_pickaxe)',
  'F18 tool recovery: no pickaxe - spare-pick craft first',
  'F18 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F8 tool recovery: no pickaxe - spare-pick craft first',
  'F8 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F5 tool recovery: no pickaxe - spare-pick craft first',
  'F5 tool recovery: spare craft failed (no table) - re-running the bootstrap',
  'F7 tool recovery: OK (wooden_pickaxe,stone_pickaxe)',
  'F1 tool recovery: OK (wooden_pickaxe,stone_pickaxe)',
  'F14 tool recovery: no pickaxe - spare-pick craft first',
  'F14 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F5 tool recovery: OK (wooden_pickaxe)',
  'F11 tool recovery: no pickaxe - spare-pick craft first',
  'F11 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F18 tool recovery: OK (wooden_pickaxe,stone_pickaxe)',
  'F8 tool recovery: failed (no crafting table)',
  'F12 tool recovery: no pickaxe - spare-pick craft first',
  'F12 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F14 tool recovery: failed (none)',
  'F14 tool recovery: no pickaxe - spare-pick craft first',
  'F14 tool recovery: spare craft failed (undefined) - re-running the bootstrap',
  'F11 tool recovery: OK (wooden_pickaxe,stone_pickaxe,stone_pickaxe)',
  'F14 tool recovery: OK (wooden_pickaxe)',
  'F12 tool recovery: failed (no crafting table)'
]

// Face 43's recovery lane (run84a), verbatim and in the live order:
// six episodes - five OK (F15/F5 the full kit, F13/F3/F8 wooden-only),
// one FAILED (F3 'none', then the reopen that recovered).
const FACE43_MINI = [
  'F15 tool recovery: no pickaxe - spare-pick craft first',
  'F15 tool recovery: spare craft failed (no table) - re-running the bootstrap',
  'F15 tool recovery: OK (wooden_pickaxe,stone_pickaxe)',
  'F3 tool recovery: no pickaxe - spare-pick craft first',
  'F3 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F13 tool recovery: no pickaxe - spare-pick craft first',
  'F13 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F8 tool recovery: no pickaxe - spare-pick craft first',
  'F8 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F5 tool recovery: no pickaxe - spare-pick craft first',
  'F5 tool recovery: spare craft failed (no table) - re-running the bootstrap',
  'F3 tool recovery: failed (none)',
  'F3 tool recovery: no pickaxe - spare-pick craft first',
  'F3 tool recovery: spare craft failed (no pickaxe materials (need 3 ingots / 3 cobble / 3 planks of ONE type)) - re-running the bootstrap',
  'F13 tool recovery: OK (wooden_pickaxe)',
  'F5 tool recovery: OK (wooden_pickaxe,stone_pickaxe)',
  'F3 tool recovery: OK (wooden_pickaxe)',
  'F8 tool recovery: OK (wooden_pickaxe)'
]

test('v0.492.0 face-42 mini: 13 episodes book 13/13 - the kit anatomy, the failed whys, the mid-fail chain, F5/F14 the reboot chains', () => {
  const b = toolRecovery(FACE42_MINI)
  assert.equal(b.episodes, 13)
  assert.equal(b.fates.ok, 8)
  assert.equal(b.fates.failed, 5)
  assert.equal(b.fates['spare-ok'], 0)
  assert.equal(b.fates.unresolved, 0)
  // The kit anatomy: the full kit 5 (F2/F7/F1/F18 + F11's double stone),
  // the half kit (wooden only) 3 (F6/F5/F14).
  assert.equal(b.kitFull, 5)
  assert.equal(b.kitWoodenOnly, 3)
  assert.deepEqual(b.kitSizes, { 1: 3, 2: 4, 3: 1 })
  assert.equal(b.failedWhy.none, 3)
  assert.equal(b.failedWhy.table, 2)
  // The mid-fail chain: the stick drought owns 10 of 13, F14's
  // 'undefined' is the emitter's own honest gap.
  assert.equal(b.midFails, 13)
  assert.equal(b.midFailClasses['stick-drought'], 10)
  assert.equal(b.midFailClasses.materials, 1)
  assert.equal(b.midFailClasses.table, 1)
  assert.equal(b.midFailClasses.undefined, 1)
  assert.equal(b.midFailOrphans, 0)
  // The reboot chains: F5 (failed -> failed -> OK) and F14
  // (failed -> OK); every loop leg except F5's middle one recovered.
  assert.equal(b.loops, 3)
  assert.equal(b.loopRecovered, 2)
  assert.equal(b.loopStillFailed, 1)
  assert.equal(b.chains, 2)
  assert.equal(b.chainsRecovered, 2)
  // The wide capture: F6's nested materials reason arrives whole.
  const f6 = b.rows.find(r => r.bot === 'F6')
  assert.deepEqual(f6.midReasons, ['materials'])
  assert.equal(f6.fate, 'ok')
  assert.equal(f6.fullKit, false)
  // F11's double-stone kit is a full kit.
  const f11 = b.rows.find(r => r.bot === 'F11')
  assert.equal(f11.fullKit, true)
  assert.equal(f11.kitSize, 3)
  // F5's chain: three rows, the first two loops flagged on the faileds.
  const f5rows = b.rows.filter(r => r.bot === 'F5')
  assert.equal(f5rows.length, 3)
  assert.equal(f5rows[0].loop, false)
  assert.equal(f5rows[1].loop, true)
  assert.equal(f5rows[2].loop, true)
  assert.equal(f5rows[2].fate, 'ok')
})

test('v0.492.0 face-43 mini: 6 episodes book 6/6 - F3 the failed->reopen->OK chain, the table mids', () => {
  const b = toolRecovery(FACE43_MINI)
  assert.equal(b.episodes, 6)
  assert.equal(b.fates.ok, 5)
  assert.equal(b.fates.failed, 1)
  assert.equal(b.kitFull, 2)
  assert.equal(b.kitWoodenOnly, 3)
  assert.equal(b.failedWhy.none, 1)
  assert.equal(b.midFailClasses['stick-drought'], 3)
  assert.equal(b.midFailClasses.table, 2)
  assert.equal(b.midFailClasses.materials, 1)
  // F3's reboot chain: failed -> OK, recovered.
  assert.equal(b.loops, 1)
  assert.equal(b.loopRecovered, 1)
  assert.equal(b.chains, 1)
  assert.equal(b.chainsRecovered, 1)
})

test('v0.492.0 both faces as one timeline: 19 episodes - the stick drought owns 13 of 19 mid-fails, every chain recovered', () => {
  // The two faces concatenated read as one timeline: the cross-face
  // continuations are honest chain legs there (F8's face-42 failed
  // terminal then face-43's own episode; F5's face-43 episode rides
  // after the face-42 chain) - the per-face reads above are the
  // decompose's own view, one log at a time.
  const b = toolRecovery([...FACE42_MINI, ...FACE43_MINI])
  assert.equal(b.episodes, 19)
  assert.equal(b.fates.ok, 13)
  assert.equal(b.fates.failed, 6)
  // THE STICK DROUGHT: 13 of 19 mid-fails - the same sticks the smelt
  // verdict's STICK TAX priced at 19x coal.
  assert.equal(b.midFailClasses['stick-drought'], 13)
  assert.equal(b.midFails, 19)
  // The kit anatomy across both faces: full 7 / half 6; the failed
  // whys: 'none' 4, the table leg 2.
  assert.equal(b.kitFull, 7)
  assert.equal(b.kitWoodenOnly, 6)
  assert.deepEqual(b.kitSizes, { 1: 6, 2: 6, 3: 1 })
  assert.deepEqual(b.failedWhy, { none: 4, table: 2, other: 0 })
  // The reboot law: 5 loop legs (F5's triple + the F8/F14/F3 reopens),
  // 4 recovered, 1 still-failed - and all 4 chains ended recovered.
  assert.equal(b.loops, 5)
  assert.equal(b.loopRecovered, 4)
  assert.equal(b.loopStillFailed, 1)
  assert.equal(b.chains, 4)
  assert.equal(b.chainsRecovered, 4)
})

test('v0.492.0 truncation edge: the open with no terminal stays unresolved, a fresh open overwrites the stale one, an orphan mid-fail is the honest audit row', () => {
  const b = toolRecovery([
    'F4 tool recovery: no pickaxe - spare-pick craft first',
    'F4 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
    'F9 tool recovery: no pickaxe - spare-pick craft first',
    'F9 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
    'F9 tool recovery: no pickaxe - spare-pick craft first',
    'F7 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap'
  ])
  assert.equal(b.episodes, 3)
  assert.equal(b.fates.unresolved, 3)
  assert.equal(b.fates.ok, 0)
  // F4's mid-fail rode its open episode; F9's first mid-fail rode the
  // stale episode, the fresh open then overwrote it honestly.
  const f9 = b.rows.filter(r => r.bot === 'F9')
  assert.equal(f9[0].midReasons.length, 1)
  assert.equal(f9[1].midReasons.length, 0)
  // F7's mid-fail had no open episode - the orphan audit row.
  assert.equal(b.midFailOrphans, 1)
})

test('v0.492.0 the spare-OK skin closes SPARE-OK (read before the terminal RE, never swallowed); the prose legs attach and never close', () => {
  const b = toolRecovery([
    'F3 tool recovery: no pickaxe - spare-pick craft first',
    'F3 tool recovery: OK (spare craft stone, holds 1)',
    'F5 tool recovery: no pickaxe - spare-pick craft first',
    'F5 tool recovery: surfaced - the wood leg gathers where trees grow',
    'F5 tool recovery: climb refused - the underground attempt stands',
    'F5 tool recovery: failed (no crafting table)'
  ])
  assert.equal(b.episodes, 2)
  assert.equal(b.fates['spare-ok'], 1)
  assert.equal(b.fates.failed, 1)
  assert.equal(b.fates.unresolved, 0)
  // The prose legs: tallied on the row, the episode still closed by
  // the emitter's own terminal.
  const f5 = b.rows.find(r => r.bot === 'F5')
  assert.equal(f5.prose.surfaced, 1)
  assert.equal(f5.prose.climbRefused, 1)
  assert.equal(f5.reason, 'table')
  assert.equal(b.prose.surfaced, 1)
  assert.equal(b.prose.climbRefused, 1)
})

test('v0.492.0 RE anchors: the sibling lanes never cross-match, the nested why arrives whole, junk/blob/zero read the honest zero', () => {
  // The sibling skin (the sword lane's own voice) never matches.
  assert.equal(RECOVERY_TERMINAL_RE.test('F2 spare pick: craft did not land (wooden_pickaxe, holds 0)'), false)
  assert.equal(RECOVERY_TERMINAL_RE.test('F2 sword: craft did not land (wooden_sword, holds 0)'), false)
  // The stale-window prose and the storm-cooldown refusal never match.
  assert.equal(RECOVERY_OPEN_RE.test('[F17] camp furnace: [tools] closing stale craft window (minecraft:inventory) - grid recovery'), false)
  assert.equal(RECOVERY_MID_FAIL_RE.test('F2 craft stick: storm cooldown 3999ms left (3 consecutive timeouts) - refusing'), false)
  // The anchors bite on the real skins.
  assert.ok(RECOVERY_OPEN_RE.test('F6 tool recovery: no pickaxe - spare-pick craft first'))
  assert.ok(RECOVERY_SPARE_OK_RE.test('F3 tool recovery: OK (spare craft stone, holds 1)'))
  assert.ok(RECOVERY_MID_FAIL_RE.test('F6 tool recovery: spare craft failed (no pickaxe materials (need 3 ingots / 3 cobble / 3 planks of ONE type)) - re-running the bootstrap'))
  const wide = RECOVERY_MID_FAIL_RE.exec('F6 tool recovery: spare craft failed (no pickaxe materials (need 3 ingots / 3 cobble / 3 planks of ONE type)) - re-running the bootstrap')
  assert.equal(wide[2], 'no pickaxe materials (need 3 ingots / 3 cobble / 3 planks of ONE type)')
  assert.ok(RECOVERY_TERMINAL_RE.test('F13 tool recovery: failed (no crafting table)'))
  assert.ok(RECOVERY_SURFACED_RE.test('F5 tool recovery: surfaced - the wood leg gathers where trees grow'))
  assert.ok(RECOVERY_CLIMB_REFUSED_RE.test('F5 tool recovery: climb refused - the underground attempt stands'))
  // The terminal's kit capture: comma split, no empties.
  const kit = RECOVERY_TERMINAL_RE.exec('F11 tool recovery: OK (wooden_pickaxe,stone_pickaxe,stone_pickaxe)')
  assert.equal(kit[3], 'wooden_pickaxe,stone_pickaxe,stone_pickaxe')
  // Junk / blob / zero: the honest zero (the calm fleet never opens).
  assert.equal(toolRecovery(null), null)
  assert.equal(toolRecovery('not an array'), null)
  const junk = toolRecovery([undefined, 42, '', 'garbage line', 'F1 tool recovery: bogus skin'])
  assert.equal(junk.episodes, 0)
  assert.equal(junk.midFailOrphans, 0)
})
