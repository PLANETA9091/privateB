// (v0.272.0) THE MELEE-FIGHT COOLDOWN pins - the melee twin of the v0.140.0
// ranged window. Face 36378053182 measured the F18 shape: the fight hit the
// chase ceiling (hp 12.2, drowned @4.2), the episode broke on 'the next drop
// reopens it', and the bot stood IDLE while the killer closed 4.2m -> 1.2m in
// seven seconds and collected it (in-water, y 61 - the water-flee line missed
// by 0.2 hp). The ranged cooldown never covered the class (only
// RANGED_HOSTILES arm their window). The cure: the same break vs a melee
// threat arms the mob's window; the next verdict yields 'flee' - the wounded
// bot RETREATS instead of waiting to be hit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MELEE_COOLDOWN_MS,
  meleeCooldownUntil,
  meleeCooldownLive,
  threatVerdict,
  threatVerdictLane,
  RANGED_HOSTILES,
  ENGAGE_RANGE
} from '../../src/lib/combat.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('meleeCooldownUntil: arms now + MELEE_COOLDOWN_MS (the ranged twin measure)', () => {
  assert.equal(MELEE_COOLDOWN_MS, 10000, 'mirrors RANGED_COOLDOWN_MS - the F18 gap was 7s, the window spans it with margin')
  assert.equal(meleeCooldownUntil({ now: 5000 }), 15000)
  assert.equal(meleeCooldownUntil({ now: 5000, ms: 2500 }), 7500)
})

test('meleeCooldownUntil: junk now refuses the arm (the Number(null) lesson - no guessed timestamp)', () => {
  assert.equal(meleeCooldownUntil({}), null, 'a missing now must refuse, NOT read as epoch 0')
  assert.equal(meleeCooldownUntil({ now: null }), null)
  assert.equal(meleeCooldownUntil({ now: undefined }), null)
  assert.equal(meleeCooldownUntil({ now: NaN }), null)
  assert.equal(meleeCooldownUntil({ now: -1 }), null)
  assert.equal(meleeCooldownUntil({ now: 'junk' }), null)
})

test('meleeCooldownLive: live/expired/junk read honestly (a junk clock OPENS the lane)', () => {
  assert.equal(meleeCooldownLive({ now: 5000, until: 15000 }), true, 'inside the window')
  assert.equal(meleeCooldownLive({ now: 15000, until: 15000 }), false, 'expiry opens the fight honestly')
  assert.equal(meleeCooldownLive({ now: 15001, until: 15000 }), false)
  assert.equal(meleeCooldownLive({ now: 5000, until: null }), false, 'a missing entry is an open lane')
  assert.equal(meleeCooldownLive({ now: null, until: 15000 }), false, 'a junk now must OPEN, not hold a phantom window')
  assert.equal(meleeCooldownLive({ now: NaN, until: 15000 }), false)
})

test('threatVerdict: the melee window yields flee where the break used to leave the bot idle (the F18 shape)', () => {
  // the exact F18 read: drowned @4.2 (inside ENGAGE_RANGE 5), hp 12.2 (above
  // FLEE_HP 8 and above WATER_FLEE_HP 12 - the water line missed by 0.2),
  // armed, alone, in water
  const base = { name: 'drowned', dist: 4.2, hp: 12.2, armed: true, inWater: true, attackers: 1, attackersClose: 1 }
  assert.equal(threatVerdict({ ...base }), 'fight', 'no window: the legacy fight answer (the ceiling break loop)')
  assert.equal(threatVerdict({ ...base, meleeCooldown: true }), 'flee', 'the window: the wounded bot RETREATS instead of waiting for the next drop')
  assert.equal(threatVerdictLane({ ...base, meleeCooldown: true }), 'melee-cooldown', 'the lane mirror names the firing lane (the by-construction coherence)')
  assert.equal(threatVerdictLane({ ...base }), 'none', 'no window: no lane fires (fight verdict)')
})

test('threatVerdict: the melee window stays in its lane (ranged keeps its own, the witch never flees via it)', () => {
  // a shooter must NEVER read the melee window - her own v0.140.0 window owns her
  const shooter = { name: 'skeleton', dist: 8, hp: 15, armed: true }
  assert.equal(threatVerdict({ ...shooter, meleeCooldown: true }), 'fight', 'the ranged classes never consult the melee window')
  assert.ok(RANGED_HOSTILES.has('witch'), 'the witch is ranged - excluded from the melee arm by construction')
  // the witch is excluded at the pure layer too (defense in depth)
  const witch = { name: 'witch', dist: 4, hp: 15, armed: true }
  assert.equal(threatVerdict({ ...witch, meleeCooldown: true }), 'fight', 'the witch keeps her v0.115.0 poison-drain chase contract')
  // outside the engage band there is no panic (the sentry re-evaluates as it closes)
  assert.equal(threatVerdict({ name: 'zombie', dist: 9, hp: 12.2, armed: true, meleeCooldown: true }), 'ignore', 'the legacy answer at range')
  // the creeper/unarmed/land-flee lanes above keep their own verdicts
  assert.equal(threatVerdict({ name: 'creeper', dist: 3, hp: 20, armed: true, meleeCooldown: true }), 'flee', 'the creeper band fires first and unchanged')
})

test('the melee cooldown is wired: the ceiling break arms it, the verdicts consult it (v0.272.0)', () => {
  assert.ok(minerSrc.includes('armMeleeCooldown(cur.entity?.id)'), 'the melee ceiling break arms the window')
  assert.ok(
    minerSrc.indexOf('armMeleeCooldown(cur.entity?.id)') > minerSrc.indexOf('if (RANGED_HOSTILES.has(cur.name) && cur.name !== \'witch\')'),
    'the arm sits in the NON-ranged branch - the shooters keep their own window'
  )
  assert.ok(minerSrc.includes('meleeCooldown: meleeCdLive(threat.entity?.id) })'), 'both verdict call sites carry meleeCooldown: meleeCdLive(...)')
  assert.ok(minerSrc.includes('combat: melee cooldown armed vs ${cur.name}'), 'the arm line prints (rides the combat filter key)')
  assert.ok(minerSrc.includes('function armMeleeCooldown (entityId)'), 'the ledger helper exists')
})
