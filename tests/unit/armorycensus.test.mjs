//
// armorycensus.test.mjs - THE ARMORY CENSUS (v0.494.0) unit tests.
// The lines are byte-verbatim from the stored faces (face 42 = run108,
// face 43 = run84a fleet19.log), hand-traced first, then pinned.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  armoryCensus, SWORD_OUTER_RE, SWORD_CRAFT_RE, SWORD_SKIP_RE,
  SPARE_CRAFT_RE, SPARE_SKIP_RE
} from '../../src/lib/armorycensus.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// Face 42's armory lanes, verbatim and in the live order (subset):
// the sword lane's both verdict skins (the inner craft verdict rides
// beside the outer lane verdict - the read-order law), the table leg's
// refusal + its outer echo, the stick leg's misses, the spare-pick
// lane's stick drought and its materials skip.
const FACE42_MINI = [
  'F2 sword: OK (wooden_sword, holds 1)',
  'F2 sword: OK (wooden_sword)',
  'F5 sword: stick craft did not land',
  'F1 sword: no table reachable or placeable',
  'F1 sword: failed (no table)',
  'F4 spare pick: skip (no sticks and no planks for sticks)',
  'F9 spare pick: stick craft did not land',
  'F3 sword: craft did not land (wooden_sword, holds 0)',
  'F3 sword: failed (wooden_sword)',
  'F6 spare pick: OK (wooden_pickaxe, holds 1)',
  'F16 spare pick: skip (no pickaxe materials (need 3 ingots / 3 cobble / 3 planks of ONE type))',
  'F7 spare pick: no table reachable or placeable',
  'F7 sword: OK (stone_sword, holds 1)',
  'F7 sword: OK (stone_sword)'
]

// Face 43's armory lanes, verbatim: the all-delivering face - zero
// stick misses on the sword lane, one table refusal, the spare lane's
// stick-drought skips.
const FACE43_MINI = [
  'F5 sword: OK (wooden_sword, holds 1)',
  'F5 sword: OK (wooden_sword)',
  'F6 spare pick: skip (no sticks and no planks for sticks)',
  'F8 sword: no table reachable or placeable',
  'F8 sword: failed (no table)',
  'F2 spare pick: OK (wooden_pickaxe, holds 2)',
  'F5 sword: OK (stone_sword, holds 1)',
  'F5 sword: OK (stone_sword)'
]

test('v0.494.0 face-42 mini: the read-order law holds, the table leg owns the sword failures, the spare skip classes classify', () => {
  const b = armoryCensus(FACE42_MINI)
  // The sword lane: the inner craft verdicts never bleed into the
  // outer verdict tally (the greedy-capture blindness avoided).
  assert.equal(b.sword.craftVerdicts, 3)
  assert.equal(b.sword.craftMisses, 1)
  assert.equal(b.sword.craftHolds, 0)
  assert.equal(b.sword.ok, 2)
  assert.deepEqual(b.sword.okTiers, { wooden_sword: 1, stone_sword: 1 })
  assert.equal(b.sword.failed, 2)
  assert.equal(b.sword.failedWhy['craft-miss'], 1)
  assert.equal(b.sword.failedWhy.table, 1)
  assert.equal(b.sword.stickMisses, 1)
  assert.equal(b.sword.tableRefusals, 1)
  // The spare-pick lane: the craft verdict IS the terminal.
  assert.equal(b.spare.craftVerdicts, 1)
  assert.equal(b.spare.ok, 1)
  assert.deepEqual(b.spare.okTiers, { wooden_pickaxe: 1 })
  assert.equal(b.spare.craftMisses, 0)
  assert.equal(b.spare.stickMisses, 1)
  assert.equal(b.spare.tableRefusals, 1)
  assert.equal(b.spare.skips, 2)
  assert.equal(b.spare.skipClasses['stick-drought'], 1)
  assert.equal(b.spare.skipClasses.materials, 1)
})

test('v0.494.0 face-43 mini: the delivering face - zero stick misses on the sword lane, the stone tier arms', () => {
  const b = armoryCensus(FACE43_MINI)
  assert.equal(b.sword.ok, 2)
  assert.deepEqual(b.sword.okTiers, { wooden_sword: 1, stone_sword: 1 })
  assert.equal(b.sword.failed, 1)
  assert.equal(b.sword.failedWhy.table, 1)
  assert.equal(b.sword.craftMisses, 0)
  assert.equal(b.sword.stickMisses, 0)
  assert.equal(b.spare.ok, 1)
  assert.equal(b.spare.skipClasses['stick-drought'], 1)
  assert.equal(b.spare.tableRefusals, 0)
})

test('v0.494.0 the honest scope: the generic craft-flow labels belong to their own lenses (storm refusal, the upgrade lane) and never cross-match', () => {
  // The storm-cooldown and ingredients lines ride the GENERIC 'craft
  // <item>:' label - stormrefusal's lane, not the armory census's.
  assert.equal(SWORD_SKIP_RE.test('F5 craft stick: storm cooldown 3992ms left (3 consecutive timeouts) - refusing'), false)
  assert.equal(SWORD_OUTER_RE.test('F15 craft wooden_sword: no craftable recipe variant (ingredients missing?)'), false)
  // The '[toolupgrade]' and recovery skins never cross-match.
  assert.equal(SPARE_CRAFT_RE.test('F6 tool recovery: OK (wooden_pickaxe)'), false)
  assert.equal(SPARE_SKIP_RE.test('F15 [toolupgrade] craft stick: no craftable recipe variant (ingredients missing?)'), false)
  // The anchors bite on the real skins.
  assert.ok(SWORD_CRAFT_RE.test('F2 sword: OK (wooden_sword, holds 1)'))
  assert.ok(SWORD_OUTER_RE.test('F2 sword: OK (wooden_sword)'))
  assert.ok(SWORD_OUTER_RE.test('F1 sword: failed (no table)'))
  assert.ok(SPARE_SKIP_RE.test('F4 spare pick: skip (no sticks and no planks for sticks)'))
  // The nested skip reason arrives whole (the wide capture).
  const wide = SPARE_SKIP_RE.exec('F16 spare pick: skip (no pickaxe materials (need 3 ingots / 3 cobble / 3 planks of ONE type))')
  assert.equal(wide[2], 'no pickaxe materials (need 3 ingots / 3 cobble / 3 planks of ONE type)')
})

test('v0.494.0 both faces: 37 swords + 25 spare picks armed - the wooden tier dominates, the table leg owns the sword failures', () => {
  // The stored faces (run*/ - gitignored, present in the mining tree,
  // absent on CI): a missing face reads the honest zero by skipping.
  let l42 = null
  let l43 = null
  try {
    l42 = readFileSync(join(here, '../../scripts/fleet-mining/run108/fleet19.log'), 'utf8').split('\n')
    l43 = readFileSync(join(here, '../../scripts/fleet-mining/run84a/fleet19.log'), 'utf8').split('\n')
  } catch {
    return
  }
  const b42 = armoryCensus(l42)
  const b43 = armoryCensus(l43)
  // THE YIELD: the weapon supply chain delivered 37 swords and 25
  // spare picks across the two faces - the fight cost ledger's
  // all-sword face 43 rode exactly this.
  assert.equal(b42.sword.ok + b43.sword.ok, 37)
  assert.equal(b42.spare.ok + b43.spare.ok, 25)
  // THE TIER LAW: the wooden tier dominates (31/37), the stone share 6.
  const wooden = b42.sword.okTiers.wooden_sword + b43.sword.okTiers.wooden_sword
  const stone = b42.sword.okTiers.stone_sword + b43.sword.okTiers.stone_sword
  assert.equal(wooden, 31)
  assert.equal(stone, 6)
  // THE TABLE LEG: 5 of face 42's 7 sword failures are the table leg
  // (the rung refused and the outer verdict echoed it) - face 43 ran
  // nearly clean (1).
  assert.equal(b42.sword.failedWhy.table, 5)
  assert.equal(b43.sword.failedWhy.table, 1)
  // THE STICK DROUGHT's third lane: the spare skips.
  assert.equal(b42.spare.skipClasses['stick-drought'], 8)
  assert.equal(b43.spare.skipClasses['stick-drought'], 3)
  // The totals: every armory line classified (77 + 66 = 143).
  assert.equal(b42.total, 77)
  assert.equal(b43.total, 66)
})

test('v0.494.0 junk/blob/zero: the honest zero is itself the read - an unarmed fleet is the v0.66.0 fists era own signature', () => {
  assert.equal(armoryCensus(null), null)
  assert.equal(armoryCensus('not an array'), null)
  const junk = armoryCensus([undefined, 42, '', 'garbage line', 'F1 sword: bogus skin', 'F1 spare pick: bogus skin'])
  assert.equal(junk.total, 0)
  assert.equal(junk.sword.ok, 0)
  assert.equal(junk.spare.ok, 0)
  const zero = armoryCensus(['F1 bank: holding 45s of 169s for the smelt leg', 'F2 water: head wet'])
  assert.equal(zero.total, 0)
})
