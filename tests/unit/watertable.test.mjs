// The water table (v0.84.0): the aquifer ceiling memory.
// Pins the pure half: region keying (negative coordinates included), the
// highest-strike-wins rule, the lid-vs-ceiling semantics at the shaft entry,
// the LRU cap, and the junk guards (the Number(null) family lesson - a board
// fed nulls must answer null, never throw).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { regionKeyOf, shaftCeiling, WaterTableBoard, WT_REGION, WT_MARGIN, WT_CAP } from '../../src/lib/watertable.mjs'

test('watertable: region keying buckets negatives like >> semantics', () => {
  assert.equal(regionKeyOf(0, 0), '0,0')
  assert.equal(regionKeyOf(63, 63), '0,0')
  assert.equal(regionKeyOf(64, 0), '1,0')
  assert.equal(regionKeyOf(-1, -1), '-1,-1')
  assert.equal(regionKeyOf(-64, 0), '-1,0')
  assert.equal(regionKeyOf(-65, 128), '-2,2')
  assert.equal(WT_REGION, 64)
})

test('watertable: junk coordinates never key a region', () => {
  assert.equal(regionKeyOf(null, 0), null)
  assert.equal(regionKeyOf(0, undefined), null)
  assert.equal(regionKeyOf(NaN, NaN), null)
  assert.equal(regionKeyOf('100', 100), null)
})

test('watertable: ceiling = strike + margin, binding below the entry', () => {
  // the run76 shape: aquifer strike at 45, shaft entered at 64 -> stop at 49
  assert.equal(shaftCeiling(45, 64), 45 + WT_MARGIN)
  assert.equal(WT_MARGIN, 4)
  // the gate must leave the FIRST dig legal: 49 < 63
  assert.ok(shaftCeiling(45, 64) < 64 - 1)
})

test('watertable: a strike at/above the shaft entry is a lid, not a ceiling', () => {
  // surface lake: strike 63 while entering at 64 -> no ceiling (the bot may dig)
  assert.equal(shaftCeiling(63, 64), null)
  // marginal: floor 49 >= entry-1 49 -> the gate would fire on dig one, useless
  assert.equal(shaftCeiling(45, 50), null)
  assert.equal(shaftCeiling(46, 50), null) // floor 50 >= 49
  // one deeper and it binds again: floor 48 < 49
  assert.equal(shaftCeiling(44, 50), 48)
})

test('watertable: ceiling margin override and junk guards', () => {
  assert.equal(shaftCeiling(45, 64, { margin: 8 }), 53)
  assert.equal(shaftCeiling(null, 64), null)
  assert.equal(shaftCeiling(45, null), null)
  assert.equal(shaftCeiling(NaN, 64), null)
  assert.equal(shaftCeiling('45', 64), null)
})

test('watertable: board records per region, highest strike wins', () => {
  const board = new WaterTableBoard()
  assert.equal(board.size, 0)
  assert.equal(board.tableFor({ x: 100, y: 60, z: 100 }), null)

  board.record({ x: 100, y: 40, z: 100 }, 1000)
  assert.equal(board.size, 1)
  assert.equal(board.tableFor({ x: 120, y: 30, z: 90 }), 40, 'same region answers the strike y')

  board.record({ x: 110, y: 46, z: 120 }, 2000) // same region [1,1], water found HIGHER up
  assert.equal(board.tableFor({ x: 100, z: 100 }), 46, 'the highest strike wins')

  board.record({ x: 70, y: 38, z: 70 }, 3000) // a lower strike in the SAME region must not lower the table
  assert.equal(board.tableFor({ x: 100, z: 100 }), 46)

  board.record({ x: 500, y: 50, z: 500 }, 4000) // a different region entirely
  assert.equal(board.size, 2)
  assert.equal(board.tableFor({ x: 500, z: 500 }), 50)
})

test('watertable: ceilingFor composes region lookup + lid semantics', () => {
  const board = new WaterTableBoard()
  board.record({ x: 100, y: 45, z: 100 }, 1000)
  // deep strike, high entry -> the ceiling binds
  assert.equal(board.ceilingFor({ x: 120, y: 60, z: 90 }, 64), 49)
  // same strike but the shaft already STARTS at the ceiling -> null (fluid guard backstops)
  assert.equal(board.ceilingFor({ x: 120, y: 50, z: 90 }, 50), null)
  // unknown region -> null
  assert.equal(board.ceilingFor({ x: -500, z: -500 }, 64), null)
  // junk -> null, never a throw
  assert.equal(board.ceilingFor(null, 64), null)
  assert.equal(board.ceilingFor({ x: 120, z: 90 }, null), null)
})

test('watertable: junk records are ignored, the board never throws', () => {
  const board = new WaterTableBoard()
  assert.equal(board.record(null), 0)
  assert.equal(board.record({ x: 100, y: '45', z: 100 }), 0)
  assert.equal(board.record({ x: 100, z: 100 }), 0) // no y
  assert.equal(board.size, 0)
  board.record({ x: 0, y: 50, z: 0 }, 1000)
  assert.equal(board.record(undefined, 2000), 1, 'junk after real data keeps the size')
})

test('watertable: the cap evicts the least-recently-touched region', () => {
  const board = new WaterTableBoard({ cap: 2 })
  board.record({ x: 0, y: 50, z: 0 }, 1000) // A
  board.record({ x: 200, y: 50, z: 0 }, 2000) // B
  assert.equal(board.size, 2)
  board.record({ x: 0, y: 51, z: 0 }, 3000) // touch A (higher strike + refresh)
  board.record({ x: 400, y: 50, z: 0 }, 4000) // C -> B (oldest touch 2000) must fall
  assert.equal(board.size, 2, 'cap enforced')
  assert.equal(board.tableFor({ x: 0, z: 0 }), 51, 'A survives with its raised strike')
  assert.equal(board.tableFor({ x: 200, z: 0 }), null, 'B evicted')
  assert.equal(board.tableFor({ x: 400, z: 0 }), 50, 'C lives')
})

test('watertable: constants stay honest', () => {
  assert.equal(WT_CAP, 64)
})
