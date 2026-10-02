// WorldMap: the shared scout->miner resource map.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorldMap, firstUsableRecord } from '../../src/fleet/worldmap.mjs'

test('add / counts / size / total', () => {
  const m = new WorldMap()
  m.add('sand', { x: 1, y: 2, z: 3 })
  m.add('sand', { x: 4, y: 5, z: 6 })
  m.add('gravel', { x: 7, y: 8, z: 9 })
  assert.equal(m.size('sand'), 2)
  assert.equal(m.size('gravel'), 1)
  assert.equal(m.size('stone'), 0)
  assert.equal(m.total(), 3)
  assert.deepEqual(m.counts(), { sand: 2, gravel: 1 })
})

test('adding the same position twice does not duplicate it', () => {
  const m = new WorldMap()
  m.add('sand', { x: 1, y: 2, z: 3 })
  m.add('sand', { x: 1, y: 2, z: 3 })
  assert.equal(m.size('sand'), 1)
})

test('nearest returns the closest known position', () => {
  const m = new WorldMap()
  m.add('sand', { x: 100, y: 64, z: 100 })
  m.add('sand', { x: 10, y: 64, z: 10 })
  const best = m.nearest('sand', { x: 0, y: 64, z: 0 })
  assert.equal(best.x, 10)
  assert.equal(best.z, 10)
})

test('nearest respects maxDistance', () => {
  const m = new WorldMap()
  m.add('sand', { x: 1000, y: 64, z: 1000 })
  assert.equal(m.nearest('sand', { x: 0, y: 64, z: 0 }, { maxDistance: 100 }), null)
  assert.notEqual(m.nearest('sand', { x: 0, y: 64, z: 0 }, { maxDistance: 5000 }), null)
})

test('nearest with verifyWith drops stale entries', () => {
  const m = new WorldMap()
  m.add('sand', { x: 5, y: 64, z: 5 })
  m.add('sand', { x: 50, y: 64, z: 50 })
  const best = m.nearest('sand', { x: 0, y: 64, z: 0 }, {
    verifyWith: pos => (pos.x === 5 ? null : { name: 'sand' }) // the near one was mined away
  })
  assert.equal(best.x, 50)
  assert.equal(m.size('sand'), 1, 'stale entry must be removed from the map')
})

test('take removes a single position', () => {
  const m = new WorldMap()
  m.add('sand', { x: 1, y: 1, z: 1 })
  m.take('sand', { x: 1, y: 1, z: 1 })
  assert.equal(m.size('sand'), 0)
})

test('save + load roundtrip keeps positions and scanned chunks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worldmap-'))
  const file = path.join(dir, 'map.json')
  const m1 = new WorldMap({ file })
  m1.markScanned(-3, 7)
  m1.add('clay', { x: -31, y: 70, z: 118 })
  m1.add('oak_log', { x: 12, y: 65, z: -2 })
  m1.save()

  const m2 = new WorldMap({ file })
  assert.ok(m2.isScanned(-3, 7))
  assert.equal(m2.size('clay'), 1)
  assert.equal(m2.size('oak_log'), 1)
  assert.equal(m2.nearest('clay', { x: 0, y: 0, z: 0 }).x, -31)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('load survives a corrupted file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worldmap-'))
  const file = path.join(dir, 'broken.json')
  fs.writeFileSync(file, '{ not json at all')
  const m = new WorldMap({ file })
  assert.equal(m.total(), 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('markScanned / isScanned', () => {
  const m = new WorldMap()
  m.markScanned(12, -5)
  assert.ok(m.isScanned(12, -5))
  assert.ok(!m.isScanned(11, -5))
})

test('report summarises the map', () => {
  const m = new WorldMap()
  m.markScanned(0, 0)
  m.add('sand', { x: 1, y: 1, z: 1 })
  const rep = m.report()
  assert.equal(rep.chunksScanned, 1)
  assert.equal(rep.positions, 1)
  assert.ok(rep.top.length >= 1)
})

// (v0.512.0) THE DEEPER RECORD - the fallback gather's law: one failed cell no
// longer starves a name the map holds dozens of records for.
test('firstUsableRecord: the blocked nearest is skipped, the second record answers (the name survives)', () => {
  const a = { x: 10, y: 64, z: 10 }
  const b = { x: 20, y: 64, z: 20 }
  const blocked = new Set(['10,64,10'])
  assert.equal(firstUsableRecord([a, b], { isBlocked: p => blocked.has(`${p.x},${p.y},${p.z}`) }), b, 'the first usable record IS the name\'s best (nearest-first contract)')
  assert.equal(firstUsableRecord([a, b], null), a, 'no blocker -> the nearest record stands')
})

test('firstUsableRecord: every record refused reads the honest null', () => {
  const a = { x: 1, y: 64, z: 1 }
  const b = { x: 2, y: 64, z: 2 }
  assert.equal(firstUsableRecord([a, b], { isBlocked: () => true }), null)
  assert.equal(firstUsableRecord([], { isBlocked: () => false }), null, 'an empty list reads null')
})

test('firstUsableRecord: junk-safe end to end (non-array, junk records, the throwing blocker reads NO gate)', () => {
  assert.equal(firstUsableRecord(null), null)
  assert.equal(firstUsableRecord('junk'), null)
  const real = { x: 5, y: 64, z: 5 }
  assert.equal(firstUsableRecord([null, 'junk', 42, { x: 'junk', y: 64, z: 1 }, real]), real, 'junk records are skipped, the real one answers (reference equality - the lib returns the record it holds)')
  // a throwing blocker reads NO gate - the read must never break the election (the oresteer law)
  const rec = { x: 3, y: 64, z: 3 }
  assert.equal(firstUsableRecord([rec], { isBlocked: () => { throw new Error('the ledger is dead') } }), rec)
  // a non-boolean truthy is NOT a refusal (the contract is boolean; junk reads no gate)
  assert.equal(firstUsableRecord([rec], { isBlocked: () => ({ hazard: true }) }), rec)
})

test('firstUsableRecord: the WorldMap method delegates the same law', () => {
  const map = new WorldMap()
  const a = { x: 1, y: 64, z: 1 }
  const b = { x: 9, y: 64, z: 9 }
  assert.equal(map.firstUsable([a, b], { isBlocked: p => p.x === 1 }), b)
  assert.equal(map.firstUsable([a, b]), a)
  assert.equal(map.firstUsable(null), null)
})

test('the deeper-record wire: the fallback reads nearestK(k=4) and filters per candidate, the board path untouched (source pins)', () => {
  const miner = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(miner.includes("const records = map.nearestK(name, bot.entity.position, { maxDistance, k: 4, verifyWith })"), 'the fallback gathers k=4 per name')
  assert.ok(miner.includes('firstUsableRecord(records, { isBlocked: p => failedTrips.has(`${p.x},${p.y},${p.z}`) || wetTrip(p) })'), 'the blocker rides the same failedTrips/wetTrip law')
  assert.ok(!miner.includes('if (pos && failedTrips.has(`${pos.x},${pos.y},${pos.z}`)) continue'), 'the whole-name skip is gone')
  assert.ok(miner.includes("import { firstUsableRecord } from '../fleet/worldmap.mjs'"), 'the helper rides the worldmap import')
  const wm = fs.readFileSync(new URL('../../src/fleet/worldmap.mjs', import.meta.url), 'utf8')
  assert.ok(wm.indexOf('firstUsable (records') > wm.indexOf('nearestK (name, from'), 'the method lives after nearestK (its contract feeds it)')
})
