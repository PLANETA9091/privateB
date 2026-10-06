import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nopathBill } from '../../src/lib/nopathbill.mjs'

// THE ERA BYTE-EXACT - face 40 (run 37493502472, the leak face) rode the
// fuel no-path spike (15 rides, the era high) plus the iron commune's own
// ride in the v0.705.0 double-prefix skin. The lines below are the face's
// own bytes; the bill's debut read names the crowd, not a column.

test('the spike rides by its own bytes - the 40th\'s 16 no-path doors fold per bot per lane', () => {
  const face = [
    'F9 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F6 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F13 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F10 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F18 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F15 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F17 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F11 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F18 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F7 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F9 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F10 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F15 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F4 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)'
  ]
  const bill = nopathBill(face)
  assert.ok(bill, 'the spike face opens the bill')
  assert.equal(bill.n, 16)
  assert.equal(bill.fuel.n, 15)
  assert.equal(bill.fuel.distinct, 10)
  assert.deepEqual(bill.fuel.byBot, {
    F9: 2, F6: 1, F13: 1, F10: 2, F1: 2,
    F18: 2, F15: 2, F17: 1, F11: 1, F7: 1
  })
  // the repeats carry the >=2 bots only - five of the ten rode twice
  assert.deepEqual(bill.fuel.repeats, { F1: 2, F10: 2, F15: 2, F18: 2, F9: 2 })
  // the iron ride wore the double-prefix skin - the ask ladder's blind byte
  assert.equal(bill.iron.n, 1)
  assert.deepEqual(bill.iron.byBot, { F4: 1 })
  assert.deepEqual(bill.iron.repeats, {})
  // the food lane rode clean - a real zero, not silence
  assert.deepEqual(bill.food, { n: 0, byBot: {}, repeats: {}, distinct: 0 })
})

test('the honest silences - no face, junk, and a no-path-free door leg stay null', () => {
  assert.equal(nopathBill(), null)
  assert.equal(nopathBill(null), null)
  assert.equal(nopathBill(''), null)
  assert.equal(nopathBill(['junk line', 42, null]), null)
  // the doors read but every why named another starver - the bill's silence
  const otherSkins = [
    'F9 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F4 iron commune: chest walk failed (water rescue in progress (iron commune walk @-10,64,-210 refused))',
    'F1 fuel commons: chest walk failed after the nudge ((nudge retry): timeout after 4500ms)',
    'F6 food commons: chest walk failed (goal was changed)'
  ]
  assert.equal(nopathBill(otherSkins), null)
})

test('the edge skins - the double-prefix stays iron, the mention stays out, the first walk rides food', () => {
  const bill = nopathBill([
    // the v0.705.0 cross-contamination law: the double-prefix ride is IRON's
    'F4 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)',
    // the single-prefix iron family rides its own lane too
    'F16 iron commune: chest walk failed (No path to the goal)',
    // the fuel line MENTIONING the iron walk inside its parens: a mention is
    // not a member, and the water-rescue why is not the no-path skin
    'F9 fuel commons: chest walk failed after the nudge (water rescue in progress (iron commune walk @-10,64,-210 refused))',
    // the food commons' first walk (no nudge yet) rides the food lane
    'F6 food commons: chest walk failed (No path to the goal!)'
  ])
  assert.ok(bill, 'the edge face opens the bill')
  assert.equal(bill.n, 3)
  assert.deepEqual(bill.iron.byBot, { F4: 1, F16: 1 })
  assert.deepEqual(bill.fuel, { n: 0, byBot: {}, repeats: {}, distinct: 0 })
  assert.deepEqual(bill.food.byBot, { F6: 1 })
  assert.equal(bill.food.distinct, 1)
})

test('the one-lane face reads real zeros and the raw blob splits by newline', () => {
  const blob = [
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)'
  ].join('\n')
  const bill = nopathBill(blob)
  assert.ok(bill, 'the raw blob face opens the bill')
  assert.equal(bill.n, 3)
  // THE COLUMN'S OWN READ: one bot owns every ride - the repeats law's
  // door-side twin (the relog lane's v0.715.0 shape)
  assert.deepEqual(bill.fuel.repeats, { F1: 3 })
  assert.equal(bill.fuel.distinct, 1)
  assert.deepEqual(bill.food, { n: 0, byBot: {}, repeats: {}, distinct: 0 })
  assert.deepEqual(bill.iron, { n: 0, byBot: {}, repeats: {}, distinct: 0 })
})

// (v0.718.0) THE RIDER'S OWN CROSS-LANE - the shape grows additively (the
// v0.653.0 law): the v0.716.0 cells stay byte-stable, the new cell prices
// the JOIN - the bots the door family refused ACROSS LANES.

test('the 41st\'s own rider skin byte-verbatim - F15 rode all three lanes, F4 kept its own', () => {
  const face = [
    'F15 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F4 food commons: chest walk failed (No path to the goal!)',
    'F4 food commons: chest walk failed (No path to the goal!)',
    'F15 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F15 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F15 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)',
    'F15 iron commune: chest walk failed (No path to the goal!)',
    'F15 iron commune: chest walk failed (No path to the goal!)',
    'F15 food commons: chest walk failed (No path to the goal!)',
    'F15 food commons: chest walk failed (No path to the goal!)'
  ]
  const bill = nopathBill(face)
  assert.ok(bill, 'the rider face opens the bill')
  assert.equal(bill.n, 10)
  // the v0.716.0 cells stay byte-stable under the additive law
  assert.equal(bill.fuel.n, 3)
  assert.equal(bill.iron.n, 3)
  assert.equal(bill.food.n, 4)
  // THE RIDER: F15 rode fuel 3 + iron 3 + food 2 = 8 rides across 3 lanes
  assert.deepEqual(bill.crossLane.bots, { F15: 3 })
  assert.deepEqual(bill.crossLane.rides, { F15: 8 })
  assert.equal(bill.crossLane.total, 8)
  // F4's food x2 is the lane's own column, NOT a rider (one lane only)
  assert.equal(bill.crossLane.bots.F4, undefined)
  assert.equal(bill.crossLane.rides.F4, undefined)
})

test('the 40th\'s crowd+column face reads the empty crossLane - the honest zero', () => {
  const face = [
    'F9 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F6 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F13 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F10 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F18 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F15 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F17 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F11 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F18 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F7 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F9 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F10 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F15 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F4 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)'
  ]
  const bill = nopathBill(face)
  assert.ok(bill, 'the 40th\'s face opens the bill')
  assert.equal(bill.n, 16)
  // the crowd (fuel, 10 bots) and the column (F4's iron x3) kept their
  // lanes - even F15's fuel x2 stayed single-lane on the 40th: the rider
  // was born on the 41st, the 40th reads the empty cell
  assert.deepEqual(bill.crossLane, { bots: {}, rides: {}, total: 0 })
})

test('the two-rider edge - a 2-lane rider and a 3-lane whale name themselves', () => {
  const face = [
    'F2 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F2 food commons: chest walk failed (No path to the goal!)',
    'F7 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F7 food commons: chest walk failed (No path to the goal!)',
    'F7 iron commune: chest walk failed (No path to the goal!)'
  ]
  const bill = nopathBill(face)
  assert.ok(bill, 'the two-rider face opens the bill')
  assert.equal(bill.n, 5)
  assert.deepEqual(bill.crossLane.bots, { F2: 2, F7: 3 })
  assert.deepEqual(bill.crossLane.rides, { F2: 2, F7: 3 })
  assert.equal(bill.crossLane.total, 5)
})

test('the single-lane column is not a rider - the v0.716.0 verdict stays the lane\'s subject', () => {
  const blob = [
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F1 fuel commons: chest walk failed after the nudge (No path to the goal!)'
  ].join('\n')
  const bill = nopathBill(blob)
  assert.ok(bill, 'the column face opens the bill')
  assert.deepEqual(bill.fuel.repeats, { F1: 3 })
  // the column reproduces INSIDE its lane - the crossLane cell stays empty
  assert.deepEqual(bill.crossLane, { bots: {}, rides: {}, total: 0 })
})
