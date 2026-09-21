// (v0.43.0) THE PALETTE CANDIDATE RULE. mineflayer's findBlocks fast-path probes
// the matcher with Block.fromStateId(stateId, 0) - a block with NO position
// (blocks.js isBlockInSection) - to decide whether a chunk section is worth
// scanning. Any position-dependent reject inside the matcher (the v0.41.0 yard
// filter's chestNearYard({chestPos: null}) = false) makes every chest section
// test false, so findChest returned null with the 50-chest warehouse in range
// (measured: dispatch 35591877408 F10, 13 blocks from the yard, 24x
// 'scan: no chest within 64b (bankable 126)', banked=0). The rule: a palette
// block is a CANDIDATE (pass), a real block is a TARGET (the filter applies).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findChest, chestNearYard } from '../../src/lib/deposit.mjs'

// A bot that hands the matcher back instead of scanning - the same seam
// deposit-walk.test.mjs uses.
function matcherBot () {
  let captured = null
  const bot = {
    findBlock: ({ matching, maxDistance }) => {
      captured = matching
      return { maxDistancePassed: maxDistance }
    },
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 10 } }
  }
  return { bot, matcher: () => captured }
}

const paletteChest = { name: 'chest', position: null } // Block.fromStateId shape
const realChest = (x, y, z, name = 'chest') => ({ name, position: { x, y, z } })
const yard = { x: 0, y: 64, z: 0 }

test('palette fast-path: a position-less chest block is a CANDIDATE (passes)', () => {
  const { bot, matcher } = matcherBot()
  findChest(bot, { yardCenter: yard, maxDistance: 64 })
  assert.equal(matcher()(paletteChest), true, 'the palette entry must pass so the section is scanned')
})

test('palette fast-path: the same holds with the exclude list active', () => {
  const { bot, matcher } = matcherBot()
  findChest(bot, { yardCenter: yard, exclude: [yard], maxDistance: 64 })
  assert.equal(matcher()(paletteChest), true, 'exclude applies to real targets only')
})

test('real blocks: the yard filter still rejects far chests (regression guard)', () => {
  const { bot, matcher } = matcherBot()
  findChest(bot, { yardCenter: yard, maxDistance: 64 })
  const m = matcher()
  assert.equal(m(realChest(5, 64, 5)), true, 'a chest at the yard passes')
  assert.equal(m(realChest(300, 64, 300)), false, 'a wilderness chest is still rejected')
  assert.equal(m(realChest(0, 64, 0, 'chest_minecart')), false, 'non-chest names still rejected')
})

test('real blocks: junk position with an active yard filter still rejects', () => {
  const { bot, matcher } = matcherBot()
  findChest(bot, { yardCenter: yard, maxDistance: 64 })
  assert.equal(matcher()({ name: 'chest', position: {} }), false, 'a blind walk is not a delivery')
})

test('legacy: no yardCenter - everything chest-shaped passes (incl. palette)', () => {
  const { bot, matcher } = matcherBot()
  findChest(bot, { yardCenter: null, maxDistance: 64 })
  const m = matcher()
  assert.equal(m(paletteChest), true)
  assert.equal(m(realChest(300, 64, 300)), true)
})

test('chestNearYard keeps its contract: junk chest position rejects, junk yard/radius falls back sane', () => {
  assert.equal(chestNearYard({ chestPos: null, yardCenter: yard }), false)
  assert.equal(chestNearYard({ chestPos: realChest(1, 2, 3).position, yardCenter: null }), true)
  assert.equal(chestNearYard({ chestPos: realChest(1, 2, 3).position, yardCenter: { junk: true } }), true)
  // junk radius (0 / negative / NaN) falls back to YARD_CHEST_RADIUS - the
  // implemented contract (deposit-walk.test.mjs pins the same fallback shape)
  assert.equal(chestNearYard({ chestPos: realChest(1, 2, 3).position, yardCenter: yard, radius: 0 }), true, 'radius 0 -> default 64, near chest passes')
  assert.equal(chestNearYard({ chestPos: realChest(300, 64, 300).position, yardCenter: yard, radius: 0 }), false, 'radius 0 -> default 64, far chest still rejects')
})
