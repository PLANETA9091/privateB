//
// ration.test.mjs - THE FLESH RATION's pins (v0.511.0)
// The doctrine: recover() waits on 'autoeat + natural regen' - the autoeat
// plugin was inert three layers deep (enableAuto never called; rotten_flesh
// banned - the fleet's ONLY food; minHunger 15 strict-< under the regen
// floor 18). The policy lib pins the fleet's own eating law and the wire
// in miner.mjs that makes it real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RATION_OPTS, RATION_BANNED, ROTTEN_FLESH, RATION_MIN_HUNGER, RATION_MIN_HEALTH, REGEN_HUNGER_FLOOR, rationVerdict } from '../../src/lib/ration.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('ration: the regen floor is the vanilla truth (18) and the thresholds serve it', () => {
  assert.equal(REGEN_HUNGER_FLOOR, 18)
  // the plugin eats when bot.food < minHunger (STRICT <) - 18 feeds at <= 17:
  // the 15..17 dead band (neither regen nor a bite) closes, and hunger >= 18
  // (the regen window) never triggers a bite that would not be needed
  assert.equal(RATION_MIN_HUNGER, 18)
  assert.equal(RATION_MIN_HUNGER, REGEN_HUNGER_FLOOR)
  // recover() waits at hp < 14 - the plugin's health side fires in the SAME band
  assert.equal(RATION_MIN_HEALTH, 14)
})

test('ration: rotten_flesh is UN-banned and the four real bans stay', () => {
  // the fleet's food chain: zombies attack -> combat kills -> flesh drops -> no
  // other lane supplies food. The default ban refused the only food the fleet owns.
  assert.ok(!RATION_BANNED.includes(ROTTEN_FLESH), 'the staple must not be banned')
  assert.ok(!RATION_OPTS.bannedFood.includes(ROTTEN_FLESH))
  // the plugin default's other four stay: their side effects are real prices
  // (poison x3, chorus teleport - a mid-shaft bite surfaces the bot somewhere random)
  for (const banned of ['pufferfish', 'chorus_fruit', 'poisonous_potato', 'spider_eye']) {
    assert.ok(RATION_BANNED.includes(banned), `${banned} must stay banned`)
  }
  assert.equal(RATION_BANNED.length, 4)
})

test('ration: the opts object is the plugin surface, only the doctrine fields moved', () => {
  // every field is the plugin 5.0.3 default except minHunger/bannedFood
  // (the two dead layers this module cures) - one object, no drift
  assert.deepEqual(RATION_OPTS, {
    eatingTimeout: 3000,
    minHealth: 14,
    minHunger: 18,
    returnToLastItem: true,
    offhand: false,
    priority: 'foodPoints',
    bannedFood: ['pufferfish', 'chorus_fruit', 'poisonous_potato', 'spider_eye'],
    strictErrors: true
  })
})

test('ration: the verdict names the doctrine side that fired', () => {
  // the standing guard: the regen floor is threatened
  assert.deepEqual(rationVerdict({ food: 12, health: 20 }), { due: true, reason: 'hunger-guard' })
  // the boundary itself: 17 eats, 18 does not (strict < on both sides)
  assert.equal(rationVerdict({ food: 17, health: 20 }).due, true)
  assert.equal(rationVerdict({ food: 18, health: 20 }).due, false)
  // the post-fight band: hp under 14 fires even with a full stomach
  assert.deepEqual(rationVerdict({ food: 20, health: 9.5 }), { due: true, reason: 'health-guard' })
  // both sides: the hunger side names first (the standing guard outranks the band)
  assert.deepEqual(rationVerdict({ food: 10, health: 6 }), { due: true, reason: 'hunger-guard+health-guard' })
  // the healthy shape: nothing fires
  assert.deepEqual(rationVerdict({ food: 20, health: 20 }), { due: false, reason: 'fed' })
  assert.deepEqual(rationVerdict({ food: 19, health: 14 }), { due: false, reason: 'fed' })
})

test('ration: a junk body never eats (junk never widens a verdict)', () => {
  // unreadable food AND health: no clock, no bite - the walkForbidden law's shape
  assert.deepEqual(rationVerdict({}), { due: false, reason: 'no readable clock' })
  assert.deepEqual(rationVerdict({ food: null, health: null }), { due: false, reason: 'no readable clock' })
  assert.deepEqual(rationVerdict({ food: NaN, health: undefined }), { due: false, reason: 'no readable clock' })
  assert.deepEqual(rationVerdict({ food: '18', health: true }), { due: false, reason: 'no readable clock' })
  // one readable side still fires on its own truth, the junk side never fakes
  assert.deepEqual(rationVerdict({ food: 12, health: NaN }), { due: true, reason: 'hunger-guard' })
  assert.deepEqual(rationVerdict({ food: NaN, health: 5 }), { due: true, reason: 'health-guard' })
  // zero is READABLE (a starving body is the loudest client, not a junk one)
  assert.deepEqual(rationVerdict({ food: 0, health: 20 }), { due: true, reason: 'hunger-guard' })
})

test('ration: the wire is pinned in miner.mjs (setOpts + enableAuto + the honest reads)', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'bots', 'miner.mjs'), 'utf8')
  // the config rides the plugin's own surface, the eater is ACTUALLY enabled
  assert.ok(src.includes('bot.autoEat.setOpts(RATION_OPTS)'), 'the ration policy must be handed to the plugin')
  assert.ok(src.includes('bot.autoEat.enableAuto()'), 'the physicsTick eater must be enabled - the 5.0.3 loader never calls it')
  assert.ok(/bot\.on\('spawn', \(\) => \{ try \{ bot\.autoEat\.enableAuto\(\) \} catch/.test(src), 'the enable rides spawn (idempotent, the _enabled guard re-arms nothing)')
  // the visibility: eatStart records, eatFinish compares - the delta decides, never the hope
  assert.ok(src.includes("bot.autoEat.on('eatStart'"), 'the attempt must be readable')
  assert.ok(src.includes("bot.autoEat.on('eatFinish'"), 'the outcome must be readable')
  assert.ok(src.includes("ration: ${ok ? 'ate' : 'failed'}"), 'the honest verdict line (failed eats log as failed)')
  assert.ok(src.includes("import { RATION_OPTS, rationVerdict } from '../lib/ration.mjs'"), 'the policy import is pinned')
})

test('ration: the fleet tail filter carries the ration lines', () => {
  const src = fs.readFileSync(path.join(root, 'testbed', 'fleet19.mjs'), 'utf8')
  // the console filter gates what the run log prints - the ration lines must ride it
  assert.ok(/\|ration\/\.test\(m\)/.test(src), "the tail filter must include 'ration' at the tail")
  // the policy lib is where the wire's numbers live - the miner must not fork its own
  assert.ok(!/bot\.autoEat\.setOpts\(\{/.test(src), 'the wire must hand over RATION_OPTS, not an inline fork')
})
