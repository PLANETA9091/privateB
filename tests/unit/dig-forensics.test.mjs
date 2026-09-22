// (v0.76.0) THE DIG FORENSICS: a fastDig false has two opposite meanings -
// 'the server never broke the block' vs 'the server broke it and the client
// world is stale'. Fleet 35721411276 (master 25dff26, the v0.75.0 face fleet)
// proved the class is per-cell, not protocol: F7 dug overhead cells all the
// way up (+22 levels, dug=68) while F18 (a stone pickaxe in hand) stalled the
// whole run on ONE ceiling cell. These pins cover the split helpers: the
// landed verdict (the stale-read recheck's decision) and the forensics line
// (the surviving refusal's diagnosis).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDigLanded, digRefusalDetail } from '../../src/lib/surface.mjs'

test('isDigLanded: a gone/unloaded read counts as landed (the dig DID land)', () => {
  assert.equal(isDigLanded(null), true, 'null read = unloaded section = the block is gone')
  assert.equal(isDigLanded(undefined), true)
})

test('isDigLanded: air (type 0) is landed, any solid block refuses', () => {
  assert.equal(isDigLanded({ type: 0, name: 'air' }), true)
  assert.equal(isDigLanded({ type: 1, name: 'stone' }), false, 'the run71/72 phantom-stone cell')
  assert.equal(isDigLanded({ type: 42, name: 'diorite' }), false)
})

test('isDigLanded: junk reads refuse (a false negative only costs the recheck, never a phantom success)', () => {
  assert.equal(isDigLanded({}), false, 'a block object without a type field')
  assert.equal(isDigLanded('stone'), false)
  assert.equal(isDigLanded(7), false)
})

test('digRefusalDetail: a surviving refusal names held, ground and the post-settle verdict', () => {
  // the F18 shape: a stone pickaxe in hand, grounded, the cell STILL stone
  assert.equal(
    digRefusalDetail({ heldName: 'stone_pickaxe', onGround: true, postName: 'stone', postLanded: false }),
    'held=stone_pickaxe, grounded, post=stone STILL THERE (server never broke it)'
  )
  // the stale-read shape that DID recover is not logged as a refusal - but the
  // detail function must still describe it honestly if ever asked
  assert.equal(
    digRefusalDetail({ heldName: 'wooden_shovel', onGround: false, postName: 'air', postLanded: true }),
    'held=wooden_shovel, airborne, post=air LANDED (stale client read)'
  )
})

test('digRefusalDetail: junk-safe placeholders instead of throws', () => {
  assert.equal(digRefusalDetail({}), 'held=n/a, ground?, post=? (re-read failed)')
  assert.equal(
    digRefusalDetail({ heldName: 42, onGround: 'yes', postName: null, postLanded: false }),
    'held=n/a, ground?, post=? STILL THERE (server never broke it)',
    'a missing post name falls back to ? for a still-there cell'
  )
  assert.equal(
    digRefusalDetail({ heldName: 'stone_pickaxe', onGround: true, postLanded: true }),
    'held=stone_pickaxe, grounded, post=air LANDED (stale client read)',
    'a landed verdict with no name reads as air'
  )
})
