// The re-loot plan (v0.200.0) - the death economy's pure decision surface.
//
// Measured background (run63-mined, fleet 36212235363): 4 deaths, ~227u
// named by the v0.199.0 death-drop line, every stack alive PAST the run's
// end (t-176 + 300s despawn = t+124) - nobody walks back. The plan decides
// whether the respawned bot's return walk can converge inside the despawn
// window and the house's bounded-budget law, with every refusal carrying a
// named why.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  relootPlan, RELOOT_DESPAWN_MS, RELOOT_MAX_DIST, RELOOT_MARGIN_MS, RELOOT_GOAL_RANGE
} from '../../src/lib/reloot.mjs'
import { WALK_CAP_MS, WALK_PER_BLOCK_MS } from '../../src/lib/tripplan.mjs'

const NOW = 1000000
const SPOT = { x: -66.4, y: 59.2, z: 399.9 }
const BOT = { x: -60, y: 64, z: 390 }

test('the walk envelope constant matches the tripplan walk cap', () => {
  // 128 blocks * 250ms/block = 32000ms = WALK_CAP_MS exactly: a re-loot at
  // maxDist gets a budget that JUST fits the cap, never over it
  assert.equal(RELOOT_MAX_DIST * WALK_PER_BLOCK_MS, WALK_CAP_MS)
})

test('the happy path arms the walk with a floored goal', () => {
  const p = relootPlan({ spot: SPOT, deathAt: NOW - 10000, now: NOW, botPos: BOT })
  assert.equal(p.go, true)
  // the Math.floor(-66.4) = -67 lesson: the goal floors TOWARD the honest
  // cell, negatives included
  assert.deepEqual(p.goal, { x: -67, y: 59, z: 399 })
  assert.equal(p.range, RELOOT_GOAL_RANGE)
  assert.ok(p.dist > 0 && Number.isFinite(p.dist))
  // dist ~12.7 sits in the budget's flat base zone (the 14s floor) - the
  // plan never issues a budget below one honest path build + approach
  assert.equal(p.budgetMs, 14000)
  assert.equal(p.windowMs, RELOOT_DESPAWN_MS - 10000)
})

test('the plan composes the tripplan budget (flat zone pin)', () => {
  // dist ~36 blocks sits at walkBudgetMs's base (36*250+5000 = 14000)
  const p = relootPlan({
    spot: { x: 36, y: 0, z: 0 }, botPos: { x: 0, y: 0, z: 0 },
    deathAt: NOW - 1000, now: NOW
  })
  assert.equal(p.go, true)
  assert.equal(p.budgetMs, 14000)
})

test('junk spot and junk deathAt refuse as no-spot', () => {
  for (const spot of [null, undefined, {}, { x: NaN, y: 59, z: 399 }, { x: -66, y: 'x', z: 399 }]) {
    assert.equal(relootPlan({ spot, deathAt: NOW - 1000, now: NOW, botPos: BOT }).why, 'no-spot')
  }
  for (const deathAt of [null, undefined, NaN, 'soon']) {
    assert.equal(relootPlan({ spot: SPOT, deathAt, now: NOW, botPos: BOT }).why, 'no-spot')
  }
})

test('an already-attempted death refuses as attempted (the retry-storm fence)', () => {
  const p = relootPlan({ spot: SPOT, deathAt: NOW - 1000, now: NOW, botPos: BOT, attempted: true })
  assert.equal(p.go, false)
  assert.equal(p.why, 'attempted')
})

test('the despawn boundary is exclusive on the wrong side', () => {
  // exactly at despawn: the drops are gone
  assert.equal(
    relootPlan({ spot: SPOT, deathAt: NOW - RELOOT_DESPAWN_MS, now: NOW, botPos: BOT }).why,
    'expired'
  )
  // 100s inside: the drops still exist AND the walk fits the window
  assert.equal(
    relootPlan({ spot: SPOT, deathAt: NOW - RELOOT_DESPAWN_MS + 100000, now: NOW, botPos: BOT }).go,
    true
  )
  // one ms inside: the drops exist but NO walk can converge in 1ms - the
  // no-time fence owns the refusal (an honest why, never a doomed walk)
  assert.equal(
    relootPlan({ spot: SPOT, deathAt: NOW - RELOOT_DESPAWN_MS + 1, now: NOW, botPos: BOT }).why,
    'no-time'
  )
})

test('a future deathAt (clock skew) reads as a full window, not junk', () => {
  const p = relootPlan({ spot: SPOT, deathAt: NOW + 5000, now: NOW, botPos: BOT })
  assert.equal(p.go, true)
  assert.equal(p.windowMs, RELOOT_DESPAWN_MS + 5000)
})

test('an unreadable bot position refuses as no-bot (the budget needs a distance)', () => {
  for (const botPos of [null, undefined, { x: NaN, y: 64, z: 390 }]) {
    assert.equal(relootPlan({ spot: SPOT, deathAt: NOW - 1000, now: NOW, botPos }).why, 'no-bot')
  }
})

test('beyond the walk envelope refuses as too-far', () => {
  const far = { x: 129, y: 0, z: 0 }
  assert.equal(
    relootPlan({ spot: far, deathAt: NOW - 1000, now: NOW, botPos: { x: 0, y: 0, z: 0 } }).why,
    'too-far'
  )
  // exactly at the cap: the envelope's edge is legal
  const edge = relootPlan({ spot: { x: 128, y: 0, z: 0 }, deathAt: NOW - 1000, now: NOW, botPos: { x: 0, y: 0, z: 0 } })
  assert.equal(edge.go, true)
  assert.equal(edge.budgetMs, WALK_CAP_MS)
})

test('a walk that cannot finish before the despawn refuses as no-time', () => {
  // 20s of window left, a 100-block walk needs 30000ms + 30000 margin > 20000
  const p = relootPlan({
    spot: { x: 100, y: 0, z: 0 }, botPos: { x: 0, y: 0, z: 0 },
    deathAt: NOW - (RELOOT_DESPAWN_MS - 20000), now: NOW
  })
  assert.equal(p.go, false)
  assert.equal(p.why, 'no-time')
})

test('the margin is a real fence, not decoration', () => {
  // budget for 40 blocks = 15000, margin 30000 -> the walk needs 45000 of
  // window; a 44000 window cannot afford the margin and refuses
  const deathAt = NOW - (RELOOT_DESPAWN_MS - 44000)
  const p = relootPlan({
    spot: { x: 40, y: 0, z: 0 }, botPos: { x: 0, y: 0, z: 0 }, deathAt, now: NOW
  })
  assert.equal(p.go, false)
  assert.equal(p.why, 'no-time')
  // the exact fit (budget + margin == window) arms: the same strict
  // inequality the dusk wire's fence (c) uses - the margin rides INSIDE
  const exact = relootPlan({
    spot: { x: 40, y: 0, z: 0 }, botPos: { x: 0, y: 0, z: 0 },
    deathAt: NOW - (RELOOT_DESPAWN_MS - 45000), now: NOW
  })
  assert.equal(exact.go, true)
})

test('junk parameters degrade to the defaults, never to a wider walk', () => {
  // a junk despawn reads the vanilla 300s (an already-expired death stays expired)
  assert.equal(
    relootPlan({ spot: SPOT, deathAt: NOW - RELOOT_DESPAWN_MS, now: NOW, botPos: BOT, despawnMs: NaN }).why,
    'expired'
  )
  // a junk maxDist reads the 128 envelope
  assert.equal(
    relootPlan({ spot: { x: 200, y: 0, z: 0 }, botPos: { x: 0, y: 0, z: 0 }, deathAt: NOW - 1000, now: NOW, maxDist: NaN }).why,
    'too-far'
  )
  // a junk margin reads the 30s default (the fence stays a fence):
  // budget 15000 + margin 30000 = 45000 > a 44000 window
  assert.equal(
    relootPlan({
      spot: { x: 40, y: 0, z: 0 }, botPos: { x: 0, y: 0, z: 0 },
      deathAt: NOW - (RELOOT_DESPAWN_MS - 44000), now: NOW, marginMs: -5
    }).why,
    'no-time'
  )
})

test('the refusals are distinct classes a decode can count', () => {
  const whys = new Set([
    relootPlan({ spot: null }).why,
    relootPlan({ spot: SPOT, deathAt: NOW - 1000, now: NOW, botPos: BOT, attempted: true }).why,
    relootPlan({ spot: SPOT, deathAt: NOW - RELOOT_DESPAWN_MS, now: NOW, botPos: BOT }).why,
    relootPlan({ spot: SPOT, deathAt: NOW - 1000, now: NOW, botPos: null }).why,
    relootPlan({ spot: { x: 500, y: 0, z: 0 }, deathAt: NOW - 1000, now: NOW, botPos: { x: 0, y: 0, z: 0 } }).why,
    relootPlan({
      spot: { x: 100, y: 0, z: 0 }, botPos: { x: 0, y: 0, z: 0 },
      deathAt: NOW - (RELOOT_DESPAWN_MS - 20000), now: NOW
    }).why
  ])
  assert.deepEqual([...whys].sort(), ['attempted', 'expired', 'no-bot', 'no-spot', 'no-time', 'too-far'])
})
