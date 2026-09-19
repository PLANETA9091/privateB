// Tests for the fleet memory guard (src/fleet/memory-guard.mjs).
// The first Big Fleet run died with a 4 GB heap OOM after ~3.5 minutes; the guard
// evicts chunk columns the server has already stopped tracking and reports memory
// stats. These tests pin the eviction math - the only part with real logic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evictFarColumns, attachMemoryGuard } from '../../src/fleet/memory-guard.mjs'

function fakeWorld (keys) {
  const columns = {}
  for (const k of keys) columns[k] = { fake: true }
  const unloaded = []
  return {
    columns,
    unloaded,
    unloadColumn (cx, cz) {
      unloaded.push(`${cx},${cz}`)
      delete columns[`${cx},${cz}`]
    }
  }
}

test('evictFarColumns: removes chunks beyond the radius, keeps nearby ones', () => {
  // bot stands at (0, 0). Chunk (0,0) spans 0..15; its center is (8, 8).
  const world = fakeWorld(['0,0', '1,0', '0,1', '6,0', '-7,0', '10,10'])
  const bot = { x: 8, y: 64, z: 8 }
  const n = evictFarColumns(world, bot, 96)
  // (8,8): d=0 -> keep. (24,8): d=16 keep. (8,24): d=16 keep.
  // (104,8): d=96 -> exactly at the radius, keep (strict >). (-104,8): d=112 evict. (168,168): far evict.
  assert.equal(n, 2)
  assert.deepEqual(Object.keys(world.columns).sort(), ['0,0', '0,1', '1,0', '6,0'])
  assert.deepEqual(world.unloaded.sort(), ['-7,0', '10,10'])
})

test('evictFarColumns: exactly-on-radius chunks stay (strict inequality)', () => {
  const world = fakeWorld(['6,0'])
  const n = evictFarColumns(world, { x: 8, y: 0, z: 8 }, 96)
  assert.equal(n, 0)
  assert.ok(world.columns['6,0'])
})

test('evictFarColumns: malformed keys are skipped, not thrown', () => {
  const world = fakeWorld(['0,0'])
  world.columns.junk = {}
  world.columns[''] = {}
  world.columns['a,b'] = {}
  const n = evictFarColumns(world, { x: 8, y: 0, z: 8 }, 96)
  assert.equal(n, 0)
  assert.ok(world.columns['0,0'])
})

test('evictFarColumns: no position or no columns object is a soft no-op', () => {
  const world = fakeWorld(['0,0'])
  assert.equal(evictFarColumns(world, null, 96), 0)
  assert.equal(evictFarColumns(null, { x: 0, y: 0, z: 0 }, 96), 0)
  assert.equal(evictFarColumns({ unloadColumn () {} }, { x: 0, y: 0, z: 0 }, 96), 0) // world without columns
})

test('evictFarColumns: falls back to delete when world lacks unloadColumn', () => {
  const world = { columns: { '0,0': {}, '-9,0': {} } }
  const n = evictFarColumns(world, { x: 8, y: 0, z: 8 }, 96)
  assert.equal(n, 1)
  assert.ok(world.columns['0,0'])
  assert.ok(!world.columns['-9,0'])
})

test('attachMemoryGuard: stats report columns/entities/heap and stop() clears the timer', async () => {
  const world = fakeWorld(['0,0', '1,0'])
  const bot = {
    entity: { position: { x: 8, y: 64, z: 8 } },
    world: { async: world },
    entities: { 1: {}, 2: {} }
  }
  const guard = attachMemoryGuard(bot, { everyMs: 3600000 }) // never fires during the test
  const s = guard.stats()
  assert.equal(s.columns, 2)
  assert.equal(s.entities, 2)
  assert.equal(s.evicted, 0)
  assert.ok(s.heapUsedMb >= 0 && s.rssMb >= 0)
  assert.equal(s.lastTickAgo, -1)

  guard.tick() // manual tick: nothing is far, nothing evicted, no throw
  assert.equal(guard.stats().evicted, 0)

  guard.stop()
  // a manual tick after stop must still be safe (idempotent)
  guard.tick()
})

test('attachMemoryGuard: a dead bot (no entity) never throws on tick', () => {
  const bot = { world: { async: fakeWorld(['0,0']) } } // entity gone
  const guard = attachMemoryGuard(bot, { everyMs: 3600000 })
  guard.tick()
  const s = guard.stats()
  assert.equal(s.evicted, 0)
  assert.equal(s.columns, 1)
  guard.stop()
})
