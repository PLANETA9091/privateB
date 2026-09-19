// Tests for the walk-goal helpers in src/lib/jobqueue.mjs.
// The Big Fleet OOM (v0.6.4 investigation) traced back to pathfinder goals computed as
// "current position + offset" that landed inside unexcavated stone, plus abandoned gotos
// whose A* kept recomputing in the background. gotoSafe must stop the pathfinder on
// failure; standGoalNear must snap walk targets to standable columns.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gotoSafe, standGoalNear } from '../../src/lib/jobqueue.mjs'
import { Vec3 } from 'vec3'

const goals = {
  GoalNear: class {
    constructor (x, y, z, range) { this.x = x; this.y = y; this.z = z; this.range = range; this.kind = 'GoalNear' }
  }
}

// A flat world: solid up to y=63 inclusive (ground top at 63), air from 64 up.
function flatBot () {
  return {
    blockAt (p) {
      const solid = p.y <= 63
      return solid
        ? { boundingBox: 'block' }
        : { boundingBox: 'empty' }
    }
  }
}

// A world where the requested column is fully buried between y=55 and y=75.
function buriedBot () {
  return {
    blockAt (p) {
      if (p.y <= 54) return { boundingBox: 'block' }
      if (p.y <= 75) return { boundingBox: 'block' } // sealed column
      return { boundingBox: 'empty' }
    }
  }
}

test('standGoalNear: a clear column keeps the requested y', () => {
  const g = standGoalNear(flatBot(), goals, 100.7, 64, 200.2, { range: 1 })
  assert.equal(g.x, 100)
  assert.equal(g.y, 64)
  assert.equal(g.z, 200)
  assert.equal(g.range, 1)
})

test('standGoalNear: a buried column prefers DOWN (falling is cheap), then the last-resort cell', () => {
  // flat world: solid ground top at 61, pure air above. The requested y=64 has no ground
  // anywhere above (nothing to stand ON), so the helper must step DOWN to the surface.
  const bot = { blockAt: p => (p.y <= 61 ? { boundingBox: 'block' } : { boundingBox: 'empty' }) }
  const g = standGoalNear(bot, goals, 5, 64, 5, { range: 1, maxShift: 4 })
  assert.equal(g.y, 62) // ground 61, feet 62, head 63
})

test('standGoalNear: a sealed (trunk) column snaps to a standable NEIGHBOR', () => {
  // ground top 63 everywhere, trunk occupies column (10,10) at 64..68
  const bot = {
    blockAt (p) {
      const trunk = p.x === 10 && p.z === 10 && p.y >= 64 && p.y <= 68
      return { boundingBox: (trunk || p.y <= 63) ? 'block' : 'empty' }
    }
  }
  const g = standGoalNear(bot, goals, 10, 64, 10, { range: 1 })
  // the trunk column itself is sealed up to its top (68); "standable" at 69 would be a
  // trunk TOP - unreachable for a walker. The ring finds the grass right next to it.
  assert.notEqual(g.y, 69)
  assert.ok(Math.abs(g.x - 10) + Math.abs(g.z - 10) >= 1, 'goal moved off the trunk column')
  assert.equal(g.y, 64) // neighbor ground top, feet at 64
  assert.equal(g.range, 2)
})

test('standGoalNear: a fully buried column falls back to the requested cell (never aims high)', () => {
  // buriedBot: sealed 0..75 (requested 64 +- everything the helper scans) -> last resort
  const g = standGoalNear(buriedBot(), goals, 10, 64, 10, { range: 1, maxShift: 6 })
  assert.equal(g.y, 64)
  assert.equal(g.range, 2)

  // truly sealed forever: solid at every y the helper can reach
  const sealedBot = { blockAt: () => ({ boundingBox: 'block' }) }
  const g2 = standGoalNear(sealedBot, goals, 0, 64, 0, { range: 1, maxShift: 6 })
  assert.equal(g2.y, 64)
  assert.ok(g2.range >= 2)
})

test('standGoalNear: unloaded chunks (blockAt null) count as standable air, ground still required', () => {
  const bot = { blockAt: p => (p.y === 63 ? { boundingBox: 'block' } : null) }
  const g = standGoalNear(bot, goals, 0, 64, 0, { range: 2 })
  assert.equal(g.y, 64)
})

test('gotoSafe: resolves when the pathfinder finishes', async () => {
  let stopped = 0
  const bot = { pathfinder: { goto: () => Promise.resolve('done'), stop: () => { stopped++ } } }
  const r = await gotoSafe(bot, { x: 1 }, { timeoutMs: 500 })
  assert.equal(r, 'done')
  assert.equal(stopped, 0)
})

test('gotoSafe: timeout rejects AND stops the pathfinder (no zombie A*)', async () => {
  let stopped = 0
  const bot = {
    pathfinder: {
      goto: () => new Promise(() => {}), // never settles: the mineflayer-pathfinder corner case
      stop: () => { stopped++ }
    }
  }
  await assert.rejects(gotoSafe(bot, { x: 1 }, { timeoutMs: 25 }), /timeout/)
  assert.equal(stopped, 1)
})

test('gotoSafe: a rejected goto also stops the pathfinder', async () => {
  let stopped = 0
  const bot = {
    pathfinder: {
      goto: () => Promise.reject(new Error('no path')),
      stop: () => { stopped++ }
    }
  }
  await assert.rejects(gotoSafe(bot, { x: 1 }, { timeoutMs: 500 }), /no path/)
  assert.equal(stopped, 1)
})

test('gotoSafe: stop() itself throwing never masks the original error', async () => {
  const bot = {
    pathfinder: {
      goto: () => new Promise(() => {}),
      stop: () => { throw new Error('stop exploded') }
    }
  }
  await assert.rejects(gotoSafe(bot, { x: 1 }, { timeoutMs: 25 }), /timeout/)
})

test('gotoSafe returns real Vec3 compatibility: goal objects pass through untouched', async () => {
  let received = null
  const bot = { pathfinder: { goto: async g => { received = g }, stop: () => {} } }
  const goal = new Vec3(1, 2, 3)
  await gotoSafe(bot, goal, { timeoutMs: 500 })
  assert.equal(received, goal)
})
