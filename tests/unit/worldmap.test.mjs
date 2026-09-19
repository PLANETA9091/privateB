// WorldMap: the shared scout->miner resource map.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorldMap } from '../../src/fleet/worldmap.mjs'

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
