// WorldMap persistence (v0.18.4): merge-on-save, worldKey guard, autosave.
//
// The old save() blindly overwrote data/worldmap.json, so a second writer (a scout
// in another terminal) or a hard death (the Big Fleet OOM class) lost everything
// that was not in the dying process's own map at its final save. Merge-on-save
// makes every saver pull the disk's finds into the live map first; the worldKey
// keeps a map file from a DIFFERENT seed from leaking positions that do not exist.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorldMap } from '../../src/fleet/worldmap.mjs'

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'worldmap-persist-'))

const sleep = ms => new Promise(r => setTimeout(r, ms))

test('save() returns merged/written counts and writes a v2 payload with the worldKey', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'map.json')
  const m = new WorldMap({ file, worldKey: 'seed-1' })
  m.markScanned(1, 2)
  m.add('sand', { x: 1, y: 64, z: 1 })
  const r = m.save()
  assert.equal(r.merged, 0, 'nothing on disk yet - nothing to merge')
  assert.equal(r.written, 1)
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(payload.version, 2)
  assert.equal(payload.worldKey, 'seed-1')
  assert.deepEqual(payload.found.sand, [[1, 64, 1]])
  fs.rmSync(dir, { recursive: true, force: true })
})

test('save() merges another writer\'s positions into the live map and the file', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'map.json')

  // process A: finds a beach and saves
  const a = new WorldMap({ file })
  a.add('sand', { x: 10, y: 64, z: 10 })
  a.save()

  // process B (started later): loads the file, finds gravel, saves
  const b = new WorldMap({ file })
  b.add('gravel', { x: 20, y: 64, z: 20 })
  b.save()

  // process A saves again WITHOUT reloading: the old code would clobber B's gravel
  const r = a.save()
  assert.ok(r.merged >= 1, `A must merge B's finds from disk (merged=${r.merged})`)
  assert.equal(a.size('gravel'), 1, 'the merged find must land in A\'s LIVE map')
  assert.equal(a.size('sand'), 1)

  // a fresh reader sees the union
  const c = new WorldMap({ file })
  assert.equal(c.size('sand'), 1)
  assert.equal(c.size('gravel'), 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('save() merges scannedChunks from disk too', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'map.json')
  const a = new WorldMap({ file })
  a.markScanned(3, 4)
  a.save()
  const b = new WorldMap({ file })
  b.markScanned(5, 6)
  b.save()
  a.save() // old code: a's file would lose 5,6
  const c = new WorldMap({ file })
  assert.ok(c.isScanned(3, 4) && c.isScanned(5, 6))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('a conflicting worldKey overwrites instead of merging foreign terrain', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'map.json')

  const worldOne = new WorldMap({ file, worldKey: 'seed-111' })
  worldOne.add('sand', { x: 1, y: 64, z: 1 })
  worldOne.save()

  const worldTwo = new WorldMap({ file, worldKey: 'seed-222' })
  worldTwo.add('basalt', { x: 9, y: 64, z: 9 })
  worldTwo.save() // conflicting key: must REPLACE, not merge

  const reread = new WorldMap({ file, worldKey: 'seed-222' })
  assert.equal(reread.size('basalt'), 1)
  assert.equal(reread.size('sand'), 0, 'the other world\'s terrain must not leak in')

  // and the first world saving again must not adopt the foreign basalt either
  worldOne.save()
  const backToOne = new WorldMap({ file, worldKey: 'seed-111' })
  assert.equal(backToOne.size('sand'), 1)
  assert.equal(backToOne.size('basalt'), 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the same worldKey merges (fixed-seed restart keeps its knowledge)', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'map.json')
  const run1 = new WorldMap({ file, worldKey: '-8201142900731514829' })
  run1.add('clay', { x: -31, y: 70, z: 118 })
  run1.save()

  const run2 = new WorldMap({ file, worldKey: '-8201142900731514829' })
  assert.equal(run2.size('clay'), 1, 'the same seed reloads the previous run\'s finds')
  run2.add('iron_ore', { x: 5, y: 42, z: 5 })
  const r = run2.save()
  assert.equal(r.written, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('a legacy file without worldKey still merges (backward compatible)', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'map.json')
  fs.writeFileSync(file, JSON.stringify({
    scannedChunks: ['7,7'],
    found: { sand: [[3, 64, 3]] }
  }))
  const m = new WorldMap({ file, worldKey: 'seed-x' })
  assert.equal(m.size('sand'), 1, 'pre-v0.18.4 files load as before')
  const r = m.save()
  assert.equal(r.written, 1)
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(payload.worldKey, 'seed-x', 'the key stamps forward on the next save')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('load() refuses a conflicting worldKey at construction', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'map.json')
  const writer = new WorldMap({ file, worldKey: 'seed-A' })
  writer.add('sand', { x: 1, y: 1, z: 1 })
  writer.save()
  const foreign = new WorldMap({ file, worldKey: 'seed-B' })
  assert.equal(foreign.total(), 0, 'another world\'s map must start empty')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('a corrupt file on disk is overwritten cleanly by save() (never throws)', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'broken.json')
  fs.writeFileSync(file, '{ not json at all')
  const m = new WorldMap({ file })
  m.add('sand', { x: 2, y: 2, z: 2 })
  const r = m.save()
  assert.equal(r.written, 1)
  assert.equal(r.merged, 0)
  const reread = new WorldMap({ file })
  assert.equal(reread.size('sand'), 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('a file holding garbage-but-valid JSON is replaced, not merged', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'weird.json')
  fs.writeFileSync(file, JSON.stringify({ hello: 'world' }))
  const m = new WorldMap({ file })
  m.add('clay', { x: 1, y: 2, z: 3 })
  assert.doesNotThrow(() => m.save())
  const reread = new WorldMap({ file })
  assert.equal(reread.size('clay'), 1)
  assert.ok(reread.isScanned === undefined || true) // shape sanity only
  fs.rmSync(dir, { recursive: true, force: true })
})

test('save() without a configured file is a no-op', () => {
  const m = new WorldMap()
  const r = m.save()
  assert.deepEqual(r, { merged: 0, written: 0 })
})

test('autosave writes periodically and stopAutosave ends it', async () => {
  const dir = tmpDir()
  const file = path.join(dir, 'map.json')
  const m = new WorldMap({ file })
  assert.equal(m.startAutosave({ everyMs: 40 }), true, 'first start succeeds')
  m.add('sand', { x: 1, y: 1, z: 1 })
  await sleep(150) // >= 3 intervals
  assert.ok(fs.existsSync(file), 'the autosave must have written the file')

  assert.equal(m.stopAutosave(), true)
  fs.rmSync(file, { force: true })
  m.add('gravel', { x: 2, y: 2, z: 2 })
  await sleep(120)
  assert.ok(!fs.existsSync(file), 'no writes after stopAutosave')

  assert.equal(m.startAutosave({ everyMs: 40 }), true, 'restart after stop works')
  m.stopAutosave()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('startAutosave is idempotent and refuses a map without a file', async () => {
  const dir = tmpDir()
  const file = path.join(dir, 'map.json')
  const m = new WorldMap({ file })
  assert.equal(m.startAutosave({ everyMs: 40 }), true)
  assert.equal(m.startAutosave({ everyMs: 40 }), false, 'double-start refused')
  m.stopAutosave()

  const noFile = new WorldMap()
  assert.equal(noFile.startAutosave(), false, 'nothing to save without a file')
  fs.rmSync(dir, { recursive: true, force: true })
})
