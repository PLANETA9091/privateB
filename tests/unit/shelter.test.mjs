// Tests for the shelter policy in src/lib/shelter.mjs.
// The measured death pattern this module closes: naked bootstrap bots at night
// lose every chase (zombies pursue across the surface) AND every fight (fists
// 1-2 dmg vs a 20 hp zombie, live-measured 17 hp -> 4.3 hp with it still alive).
// A sealed 1-deep hole beats every surface mob - the policy pins WHEN the bot
// is allowed to dig in and WHAT it may spend on the seal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHELTER_ROUND_MS, SHELTER_MAX_MS, SHELTER_SAFE_DIST, SEAL_PRIORITY,
  shelterDue, pickSealItem
} from '../../src/lib/shelter.mjs'

test('shelterDue: only the measured death pattern gets the shelter', () => {
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 5 }), true, 'the pattern: naked + night + close threat')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 12 }), true, '12 = the detect edge')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 12.5 }), false, 'beyond detect range: keep walking')
  assert.equal(shelterDue({ night: false, armed: false, threatDist: 5 }), false, 'daylight bots walk in the open')
  assert.equal(shelterDue({ night: true, armed: true, threatDist: 5 }), false, 'armed bots fight or flee, they do not seal')
})

test('shelterDue: junk inputs never trap the bot in a hole', () => {
  assert.equal(shelterDue({}), false, 'nothing set -> no shelter')
  assert.equal(shelterDue({ night: 'yes', armed: false, threatDist: 5 }), false, 'junk night is not night')
  assert.equal(shelterDue({ night: true, armed: 0, threatDist: 5 }), false, 'armed must be EXACTLY false (0 is not false here)')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: NaN }), false, 'junk distance reads as far')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: -1 }), true, 'negative = basically inside the mob')
})

test('pickSealItem: dirt family first, craft-critical items never spent', () => {
  assert.equal(pickSealItem([{ name: 'cobblestone', count: 10 }, { name: 'dirt', count: 3 }]).name, 'dirt', 'dirt outranks cobblestone')
  assert.equal(pickSealItem([{ name: 'oak_log', count: 4 }, { name: 'cobblestone', count: 10 }]).name, 'cobblestone', 'logs are NEVER spent')
  assert.equal(pickSealItem([{ name: 'oak_log', count: 4 }, { name: 'oak_planks', count: 12 }, { name: 'stick', count: 8 }]), null, 'only craft-critical stock -> no shelter (an open hole is a death trap)')
  assert.equal(pickSealItem([{ name: 'dirt', count: 1 }]).name, 'dirt')
  assert.equal(pickSealItem([{ name: 'grass_block', count: 2 }]).name, 'grass_block', 'grass block is dirt family')
  assert.equal(pickSealItem([{ name: 'stone', count: 5 }]).name, 'stone', 'smelted stone seals too')
})

test('pickSealItem: junk inventories yield null (flee instead)', () => {
  assert.equal(pickSealItem([]), null)
  assert.equal(pickSealItem(null), null)
  assert.equal(pickSealItem(undefined), null)
  assert.equal(pickSealItem([null, 42, {}, { name: 7 }]), null)
  assert.equal(pickSealItem([{ name: 'creeper' }]), null, 'mob drops that are not sealable are ignored')
})

test('policy constants stay sane', () => {
  assert.equal(SHELTER_MAX_MS > SHELTER_ROUND_MS, true, 'at least one wait round fits the cap')
  assert.equal(SHELTER_SAFE_DIST >= 8, true, 'a zombie at the wall must keep the bot sealed')
  assert.equal(SEAL_PRIORITY[0] === 'dirt', true, 'dirt leads the priority - it is worthless to the bootstrap')
  assert.ok(!SEAL_PRIORITY.some(n => n.endsWith('_log') || n.endsWith('_planks') || n === 'stick'), 'craft-critical blocks are excluded by construction')
})
