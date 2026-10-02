//
// campbuild.test.mjs - THE CAMP BUILD BOOK (v0.497.0) unit tests.
// The lines are byte-verbatim from the stored faces (face 42 = run108,
// face 43 = run84a fleet19.log), hand-traced first, then pinned. The
// leg-clock skipped line is the fleet19.mjs emitter template (zero
// field rows at n=2 - the honest zero, the class kept).
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  campBuild, noBuildClass, CAMP_BUILT_RE, CAMP_NOBUILD_RE, CAMP_TABLE_FIRST_RE,
  CAMP_PLANKS_RE, CAMP_SKIPPED_RE, CAMP_ATTEMPT_RE, CAMP_ALLFAIL_RE,
  CAMP_STORM_RE, CAMP_GRID_RE
} from '../../src/lib/campbuild.mjs'
import { parseStormCooldown } from '../../src/lib/memhb.mjs'

// Face 42's camp furnace lane, verbatim and in the live order: F4's
// table-first build (the face's only one), F15's two plank-death
// episodes (the mixed-wood pocket, the 7s machinery, the craft storm)
// and the reuse refusals (subset).
const FACE42_MINI = [
  'F4 camp furnace: craft-table (118 cobble + 4 planks - table first)',
  'F4 camp furnace: BUILT (furnace at -140,46,452) in 6s',
  'F4 camp furnace: no build (machine near)',
  'F17 camp furnace: no build (machine near)',
  'F15 camp furnace: craft-planks (3 log(s) in pocket - craft planks (largest same-type stack 1/4))',
  'F15 camp furnace: craft oak_planks: variant#2 attempt0 failed: craft oak_planks: timeout after 7000ms',
  'F15 camp furnace: [tools] closing stale craft window (minecraft:inventory) - grid recovery',
  'F15 camp furnace: craft oak_planks: variant#2 attempt1 failed: craft oak_planks: timeout after 7000ms',
  'F15 camp furnace: [tools] closing stale craft window (minecraft:inventory) - grid recovery',
  'F15 camp furnace: craft oak_planks: all 1 variant(s) failed, last: craft oak_planks: timeout after 7000ms',
  'F15 camp furnace: no build (plank craft failed)',
  'F15 camp furnace: craft-planks (2 log(s) in pocket - craft planks (largest same-type stack 1/4))',
  'F15 camp furnace: craft oak_planks: variant#2 attempt0 failed: craft oak_planks: timeout after 7000ms',
  'F15 camp furnace: [tools] closing stale craft window (minecraft:inventory) - grid recovery',
  'F15 camp furnace: craft storm: 3 consecutive craft timeouts - cooldown 4000ms (server stall?)',
  'F15 camp furnace: craft oak_planks: all 1 variant(s) failed, last: craft oak_planks: timeout after 7000ms',
  'F15 camp furnace: no build (plank craft failed)'
]

// Face 43's camp furnace lane, verbatim: the reuse face - every
// refusal honest, F10's cobble floor the only non-reuse row.
const FACE43_MINI = [
  'F14 camp furnace: no build (machine near)',
  'F9 camp furnace: no build (machine near)',
  'F10 camp furnace: no build (cobble 4/8)',
  'F7 camp furnace: no build (machine near)',
  'F19 camp furnace: no build (machine near)'
]

test('v0.497.0 face-42 mini: F4 rides the table-first order to the face\'s only build, F15\'s two episodes die at the plank craft', () => {
  const g = campBuild(FACE42_MINI)
  assert.equal(g.totals.built, 1)
  assert.equal(g.totals.buildSecs, 6)
  assert.equal(g.totals.tableFirst, 1)
  assert.equal(g.totals.reuse, 2)
  assert.equal(g.totals.plankDeath, 2)
  assert.equal(g.totals.planksDecisions, 2)
  assert.equal(g.totals.planksLogs, 5)
  // THE SAME-TYPE FLOOR: largest same-type stack 1/4 twice - the
  // mixed-wood pocket never consolidates (the table gate's commodity
  // law echoed in the furnace lane).
  assert.equal(g.totals.sameTypeShort, 2)
  assert.equal(g.totals.attempts, 3)
  assert.equal(g.totals.timeoutMs, 21000)
  assert.equal(g.totals.otherAttempts, 0)
  assert.equal(g.totals.allFails, 2)
  assert.equal(g.totals.storms, 1)
  assert.equal(g.totals.stormCooldownMs, 4000)
  assert.equal(g.totals.grid, 3)
  assert.equal(g.totals.total, 17)
  // The builder: built + the order leg + one honest reuse later.
  assert.equal(g.bots.F4.built, 1)
  assert.equal(g.bots.F4.buildSecs, 6)
  assert.equal(g.bots.F4.tableFirst, 1)
  assert.equal(g.bots.F4.reuse, 1)
  // The plank-death bot: two decisions, three priced attempts, the
  // storm firing mid-episode-two, zero builds.
  assert.equal(g.bots.F15.built, 0)
  assert.equal(g.bots.F15.planksDecisions, 2)
  assert.equal(g.bots.F15.sameTypeShort, 2)
  assert.equal(g.bots.F15.attempts, 3)
  assert.equal(g.bots.F15.timeoutMs, 21000)
  assert.equal(g.bots.F15.allFails, 2)
  assert.equal(g.bots.F15.storms, 1)
  assert.equal(g.bots.F15.grid, 3)
  assert.equal(g.bots.F15.plankDeath, 2)
})

test('v0.497.0 face-43 mini: the reuse face - 21 honest machine-near refusals and F10\'s cobble floor', () => {
  const g = campBuild(FACE43_MINI)
  assert.equal(g.totals.built, 0)
  assert.equal(g.totals.reuse, 4)
  assert.equal(g.totals.cobbleFloor, 1)
  assert.equal(g.totals.plankDeath, 0)
  assert.equal(g.totals.total, 5)
  // The cobble-floor bot: the resource floor's own read (have 4, need 8).
  assert.equal(g.bots.F10.cobbleFloor, 1)
  assert.equal(g.bots.F10.reuse, 0)
})

test('v0.497.0 both-faces aggregate: THE FOUNDRY IS ALREADY BUILT - one build in two faces against 41 reusals', () => {
  const g = campBuild([...FACE42_MINI, ...FACE43_MINI])
  assert.equal(g.totals.built, 1)
  assert.equal(g.totals.reuse, 6)
  assert.equal(g.totals.cobbleFloor, 1)
  assert.equal(g.totals.plankDeath, 2)
  assert.equal(g.totals.attempts, 3)
  assert.equal(g.totals.timeoutMs, 21000)
  assert.equal(g.totals.storms, 1)
  assert.equal(g.totals.grid, 3)
  assert.equal(g.totals.total, 22)
  // The single build's owner.
  assert.deepEqual(g.totals.buildBots, { F4: 1 })
})

test('v0.497.0 the scope pins: the refusing storm skin belongs to memhb, the why classes classify, the leg-clock template reads', () => {
  // The storm-refusal pair (memhb's STORM_COOLDOWN_RE, the 'refusing'
  // skin) never touches the FIRING skin this book tallies - one shape
  // family per owner, pinned both directions.
  const firing = 'F15 camp furnace: craft storm: 3 consecutive craft timeouts - cooldown 4000ms (server stall?)'
  assert.equal(parseStormCooldown(firing), null)
  assert.equal(CAMP_STORM_RE.test(firing), true)
  // The why classes.
  assert.deepEqual(noBuildClass('machine near'), { cls: 'reuse' })
  assert.deepEqual(noBuildClass('cobble 4/8'), { cls: 'cobble-floor', cobbleHave: 4, cobbleNeed: 8 })
  assert.deepEqual(noBuildClass('plank craft failed'), { cls: 'plank-death' })
  assert.deepEqual(noBuildClass('nothing to smelt'), { cls: 'nothing-to-smelt' })
  assert.deepEqual(noBuildClass('something new'), { cls: 'other' })
  assert.deepEqual(noBuildClass(undefined), { cls: 'other' })
  // The emitter template (zero field rows at n=2 - the class kept).
  const skipped = 'F9 camp furnace: build skipped - the leg clock (30s) cannot afford a 24s smelt build + the 4s put (furnace)'
  assert.equal(CAMP_SKIPPED_RE.test(skipped), true)
  const g = campBuild([skipped])
  assert.equal(g.totals.skipped, 1)
  assert.equal(g.bots.F9.skipped, 1)
  // The RE anchors byte-verbatim.
  assert.equal(CAMP_BUILT_RE.exec(FACE42_MINI[1])[5], '6')
  assert.equal(CAMP_TABLE_FIRST_RE.exec(FACE42_MINI[0])[2], '118')
  assert.equal(CAMP_PLANKS_RE.exec(FACE42_MINI[4])[3], '1')
  assert.equal(CAMP_ATTEMPT_RE.exec(FACE42_MINI[5])[4], '0')
  assert.equal(CAMP_ALLFAIL_RE.exec(FACE42_MINI[9])[3], '1')
  assert.equal(CAMP_GRID_RE.test(FACE42_MINI[6]), true)
  assert.equal(CAMP_NOBUILD_RE.exec('F10 camp furnace: no build (cobble 4/8)')[2], 'cobble 4/8')
})

test('v0.497.0 junk battery: non-strings skipped, garbage and blobs read the honest zero', () => {
  assert.equal(campBuild(null), null)
  assert.equal(campBuild('not an array'), null)
  const g = campBuild([undefined, null, 7, {}, '', 'garbage', 'F1 camp furnace: BUILT (furnace at -1,46,-2) in 6s ', '  F1 camp furnace: no build (machine near)', 'blob (camp furnace: BUILT) (F2)'])
  assert.equal(g.totals.built, 0)
  assert.equal(g.totals.total, 0)
  assert.deepEqual(g.bots, {})
  const z = campBuild([])
  assert.equal(z.totals.built, 0)
  assert.equal(z.totals.total, 0)
  // A non-timeout attempt why lands the honest bucket.
  const other = campBuild(['F3 camp furnace: craft oak_planks: variant#1 attempt0 failed: craft oak_planks: interrupted'])
  assert.equal(other.totals.attempts, 1)
  assert.equal(other.totals.otherAttempts, 1)
  assert.equal(other.totals.timeoutMs, 0)
})
